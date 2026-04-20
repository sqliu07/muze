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


def seed_track(client, tmp_dir: Path) -> dict:
    """扫描一个 MP3 并返回第一个 track 数据。"""
    create_minimal_mp3(tmp_dir / "song.mp3")
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


def test_pagination(client, tmp_dir: Path):
    """放入 3 个 MP3，GET /api/tracks?page=1&limit=2 返回 items 长度=2, total=3。"""
    for i in range(3):
        create_minimal_mp3(tmp_dir / f"song{i}.mp3")
    client.post("/api/library/scan", json={"path": str(tmp_dir)})

    resp = client.get("/api/tracks?page=1&limit=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["total"] == 3
