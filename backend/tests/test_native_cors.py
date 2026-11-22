import asyncio

import httpx
import pytest

from main import app


@pytest.mark.parametrize("origin", ["http://tauri.localhost", "https://localhost", "http://localhost"])
def test_native_apps_can_preflight_remote_library(origin):
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://muze") as client:
            response = await client.options("/api/tracks", headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            })
            assert response.status_code == 200
            assert response.headers["access-control-allow-origin"] == origin
    asyncio.run(check())


def test_unlisted_origin_is_not_allowed_to_read_library():
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://muze") as client:
            response = await client.options("/api/tracks", headers={
                "Origin": "https://untrusted.example",
                "Access-Control-Request-Method": "GET",
            })
            assert response.status_code == 400
            assert "access-control-allow-origin" not in response.headers
    asyncio.run(check())
