"""Artists API 测试。"""
from tests.conftest import *  # noqa: F401,F403


def test_list_artists_empty(client):
    """GET /api/artists 空列表返回 200 + []。"""
    resp = client.get("/api/artists")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_artist_not_found(client):
    """GET /api/artists/9999 返回 404。"""
    resp = client.get("/api/artists/9999")
    assert resp.status_code == 404
