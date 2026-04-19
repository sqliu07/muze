"""Library API 测试。"""
from pathlib import Path

import pytest

from tests.conftest import *  # noqa: F401,F403


def create_minimal_mp3(path: Path) -> Path:
    """创建最小合法 MP3 文件（多个 MPEG1 Layer3 帧）。"""
    frame_header = b"\xFF\xFB\x90\x00"
    frame = frame_header + b"\x00" * (417 - 4)
    path.write_bytes(frame * 10)
    return path


def test_add_watch_folder(client, tmp_dir: Path):
    """POST /api/library/folders 添加监听目录。"""
    resp = client.post("/api/library/folders", json={"path": str(tmp_dir)})
    assert resp.status_code == 200
    data = resp.json()
    assert data["path"] == str(tmp_dir)
    assert data["active"] is True


def test_list_watch_folders(client, tmp_dir: Path):
    """GET /api/library/folders 返回已添加的目录。"""
    client.post("/api/library/folders", json={"path": str(tmp_dir)})

    resp = client.get("/api/library/folders")
    assert resp.status_code == 200
    folders = resp.json()
    paths = [f["path"] for f in folders]
    assert str(tmp_dir) in paths


def test_scan_folder(client, tmp_dir: Path):
    """POST /api/library/scan 扫描目录并返回 added >= 1。"""
    create_minimal_mp3(tmp_dir / "song.mp3")

    resp = client.post("/api/library/scan", json={"path": str(tmp_dir)})
    assert resp.status_code == 200
    data = resp.json()
    assert data["added"] >= 1


def test_remove_watch_folder(client, tmp_dir: Path):
    """DELETE /api/library/folders/{id} 停用目录（soft delete）。"""
    resp = client.post("/api/library/folders", json={"path": str(tmp_dir)})
    folder_id = resp.json()["id"]

    resp = client.delete(f"/api/library/folders/{folder_id}")
    assert resp.status_code == 200

    # 验证不再在活跃列表中
    resp = client.get("/api/library/folders")
    ids = [f["id"] for f in resp.json()]
    assert folder_id not in ids


def test_clear_library(client, tmp_dir: Path):
    """DELETE /api/library/clear 清空全部数据。"""
    create_minimal_mp3(tmp_dir / "song.mp3")
    client.post("/api/library/scan", json={"path": str(tmp_dir)})

    resp = client.delete("/api/library/clear")
    assert resp.status_code == 200

    # 验证 tracks 已清空
    resp = client.get("/api/tracks")
    assert resp.status_code == 200
    assert resp.json()["total"] == 0
