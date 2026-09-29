"""Playlists API 测试。"""
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
    client.post("/api/library/folders", json={"path": str(tmp_dir)})
    client.post("/api/library/scan", json={"path": str(tmp_dir)})
    resp = client.get("/api/tracks")
    return resp.json()["items"][0]


def test_create_playlist(client):
    """POST /api/playlists 创建歌单，验证 name 正确。"""
    resp = client.post("/api/playlists", json={"name": "我的歌单"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "我的歌单"
    assert data["track_count"] == 0


def test_list_playlists(client):
    """创建 2 个歌单，GET /api/playlists 验证长度=2。"""
    client.post("/api/playlists", json={"name": "歌单A"})
    client.post("/api/playlists", json={"name": "歌单B"})
    resp = client.get("/api/playlists")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


def test_add_and_list_tracks(client, tmp_dir: Path):
    """扫描 MP3，创建歌单，添加曲目，GET 详情验证含 1 首曲目。"""
    track = seed_track(client, tmp_dir)
    # 创建歌单
    pl = client.post("/api/playlists", json={"name": "测试歌单"}).json()
    # 添加曲目
    resp = client.post(
        f"/api/playlists/{pl['id']}/tracks",
        json={"track_ids": [track["id"]]},
    )
    assert resp.status_code == 200
    # 获取详情
    resp = client.get(f"/api/playlists/{pl['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["tracks"]) == 1
    assert data["tracks"][0]["id"] == track["id"]


def test_delete_playlist(client):
    """创建后删除，验证列表为空。"""
    pl = client.post("/api/playlists", json={"name": "临时歌单"}).json()
    resp = client.delete(f"/api/playlists/{pl['id']}")
    assert resp.status_code == 200
    resp = client.get("/api/playlists")
    assert len(resp.json()) == 0
