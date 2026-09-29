"""Tracks API 测试。"""
from pathlib import Path

import pytest

from tests.conftest import *  # noqa: F401,F403


def create_minimal_mp3(path: Path) -> Path:
    """创建最小合法 MP3 文件（多个 MPEG1 Layer3 帧）。"""
    frame_header = b"\xFF\xFB\x90\x00"
    frame = frame_header + b"\x00" * (417 - 4)
    path.write_bytes(frame * 10)
    return path


def add_basic_id3_tags(path: Path) -> None:
    from mutagen.id3 import ID3, TALB, TIT2, TPE1

    tags = ID3()
    tags.add(TIT2(encoding=3, text=["Tagged Song"]))
    tags.add(TPE1(encoding=3, text=["Tagged Artist"]))
    tags.add(TALB(encoding=3, text=["Tagged Album"]))
    tags.save(path)


def seed_track(client, tmp_dir: Path) -> dict:
    """扫描一个 MP3 并返回第一个 track 数据。"""
    create_minimal_mp3(tmp_dir / "song.mp3")
    client.post("/api/library/folders", json={"path": str(tmp_dir)})
    client.post("/api/library/scan", json={"path": str(tmp_dir)})
    resp = client.get("/api/tracks")
    return resp.json()["items"][0]


def seed_tagged_track(client, tmp_dir: Path) -> dict:
    """扫描一个带基础 ID3 元数据的 MP3 并返回第一个 track 数据。"""
    path = create_minimal_mp3(tmp_dir / "tagged.mp3")
    add_basic_id3_tags(path)
    client.post("/api/library/folders", json={"path": str(tmp_dir)})
    client.post("/api/library/scan", json={"path": str(tmp_dir)})
    resp = client.get("/api/tracks")
    return resp.json()["items"][0]


def test_list_tracks_empty(client):
    """GET /api/tracks 空列表返回 total=0, items=[]。"""
    resp = client.get("/api/tracks")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_list_tracks_after_scan(client, tmp_dir: Path):
    """扫描后 GET /api/tracks，验证 total=1。"""
    seed_track(client, tmp_dir)
    resp = client.get("/api/tracks")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1


def test_get_track(client, tmp_dir: Path):
    """获取单个 Track，验证 id 匹配。"""
    track = seed_track(client, tmp_dir)
    resp = client.get(f"/api/tracks/{track['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == track["id"]
    assert "is_favorite" in data


def test_get_track_not_found(client):
    """GET /api/tracks/9999 返回 404。"""
    resp = client.get("/api/tracks/9999")
    assert resp.status_code == 404


def test_stream_track(client, tmp_dir: Path):
    """GET /api/tracks/{id}/stream 返回 200 或 206。"""
    track = seed_track(client, tmp_dir)
    resp = client.get(f"/api/tracks/{track['id']}/stream")
    assert resp.status_code in (200, 206)


def test_update_track_title(client, tmp_dir: Path):
    """PATCH /api/tracks/{id} 更新标题。"""
    track = seed_track(client, tmp_dir)
    resp = client.patch(
        f"/api/tracks/{track['id']}", json={"title": "新标题"}
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "新标题"


def test_search_track_cover_updates_metadata(client, tmp_dir: Path, monkeypatch):
    """POST /api/tracks/{id}/cover/search 搜索封面并写入当前曲目元数据。"""
    import app.api.tracks as tracks_api
    import app.services.cover_service as cover_service

    cover_bytes = (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00\x01\x00\x01"
        b"\x00\x00\xff\xd9"
    )

    monkeypatch.setattr(
        cover_service,
        "fetch_album_cover",
        lambda *_args, **_kwargs: cover_bytes,
    )
    monkeypatch.setattr(tracks_api, "COVERS_DIR", tmp_dir / "covers")

    track = seed_tagged_track(client, tmp_dir)

    resp = client.post(f"/api/tracks/{track['id']}/cover/search")

    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == track["id"]
    assert data["has_cover"] is True
    assert data["album"]["cover_path"] is not None


def test_search_track_cover_candidates_and_apply_selected(client, tmp_dir: Path, monkeypatch):
    """封面搜索可返回候选列表，并应用用户指定的候选图。"""
    import app.api.tracks as tracks_api
    import app.services.cover_service as cover_service

    cover_bytes = (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00\x01\x00\x01"
        b"\x00\x00\xff\xd9"
    )

    monkeypatch.setattr(tracks_api, "COVERS_DIR", tmp_dir / "covers")
    monkeypatch.setattr(
        cover_service,
        "search_album_cover_candidates",
        lambda *_args, **_kwargs: [
            cover_service.CoverCandidate(
                image_url="https://example.test/large.jpg",
                thumbnail_url="https://example.test/thumb.jpg",
                album_title="Tagged Album",
                artist_name="Tagged Artist",
            )
        ],
    )
    monkeypatch.setattr(
        cover_service,
        "fetch_cover_image_url",
        lambda *_args, **_kwargs: cover_bytes,
    )

    track = seed_tagged_track(client, tmp_dir)

    candidates_resp = client.post(
        f"/api/tracks/{track['id']}/cover/candidates",
        json={"title": "Tagged Album", "artist": "Tagged Artist", "limit": 4},
    )
    assert candidates_resp.status_code == 200
    candidates = candidates_resp.json()
    assert candidates[0]["thumbnail_url"] == "https://example.test/thumb.jpg"

    apply_resp = client.post(
        f"/api/tracks/{track['id']}/cover",
        json={"image_url": candidates[0]["image_url"]},
    )
    assert apply_resp.status_code == 200
    assert apply_resp.json()["has_cover"] is True


def test_pagination(client, tmp_dir: Path):
    """放入 3 个 MP3，GET /api/tracks?page=1&limit=2 返回 items 长度=2, total=3。"""
    for i in range(3):
        create_minimal_mp3(tmp_dir / f"song{i}.mp3")
    client.post("/api/library/folders", json={"path": str(tmp_dir)})
    client.post("/api/library/scan", json={"path": str(tmp_dir)})

    resp = client.get("/api/tracks?page=1&limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["total"] == 3
