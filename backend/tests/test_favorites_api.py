"""Favorites API 测试。"""
from pathlib import Path

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


def test_add_favorite(client, tmp_dir: Path):
    """POST /api/favorites/{track_id}，验证 200。"""
    track = seed_track(client, tmp_dir)
    resp = client.post(f"/api/favorites/{track['id']}")
    assert resp.status_code == 200


def test_list_favorites(client, tmp_dir: Path):
    """添加收藏后 GET /api/favorites，验证长度=1。"""
    track = seed_track(client, tmp_dir)
    client.post(f"/api/favorites/{track['id']}")
    resp = client.get("/api/favorites")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == track["id"]


def test_remove_favorite(client, tmp_dir: Path):
    """添加后取消收藏，GET 验证长度=0。"""
    track = seed_track(client, tmp_dir)
    client.post(f"/api/favorites/{track['id']}")
    resp = client.delete(f"/api/favorites/{track['id']}")
    assert resp.status_code == 200
    resp = client.get("/api/favorites")
    assert len(resp.json()) == 0
