"""Cover downloads must stay on trusted artwork hosts and remain bounded."""
import base64
import socket

import httpx
import pytest

from app.services import cover_service


ARTWORK_URL = "https://is1-ssl.mzstatic.com/image/thumb/Music/test/600x600bb.jpg"
JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkM"
    "EQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4I"
    "CA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4e"
    "Hh4eHh4eHh7/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQF"
    "BgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEI"
    "I0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNk"
    "ZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLD"
    "xMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEB"
    "AQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJB"
    "UQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZH"
    "SElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaan"
    "qKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oA"
    "DAMBAAIRAxEAPwDzqiiiv2g+oP/Z"
)


@pytest.fixture
def artwork_client(monkeypatch):
    requests = []
    replies = []
    real_client = httpx.Client

    def handler(request):
        requests.append(request)
        return replies.pop(0)

    monkeypatch.setattr(
        cover_service.httpx, "Client",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    monkeypatch.setattr(
        socket, "getaddrinfo",
        lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("23.1.2.3", 443))],
    )
    return requests, replies


@pytest.mark.parametrize("url", [
    "http://is1-ssl.mzstatic.com/a.jpg", "https://127.0.0.1/a.jpg",
    "https://[::1]/a.jpg", "https://169.254.169.254/latest/meta-data",
    "https://is1-ssl.mzstatic.com.evil.test/a.jpg", "https://evil.test/a.jpg",
    "https://user@is1-ssl.mzstatic.com/a.jpg", "https://is1-ssl.mzstatic.com:8443/a.jpg",
    "file:///etc/passwd", "https://is1-ssl.mzstatic.com/a.svg",
])
def test_rejects_untrusted_urls_before_request(artwork_client, url):
    requests, _ = artwork_client
    assert cover_service.fetch_cover_image_url(url) is None
    assert requests == []


@pytest.mark.parametrize("address", ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fe80::1"])
def test_rejects_private_dns_results(artwork_client, monkeypatch, address):
    requests, _ = artwork_client
    monkeypatch.setattr(socket, "getaddrinfo", lambda *_args, **_kwargs: [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))
    ])
    assert cover_service.fetch_cover_image_url(ARTWORK_URL) is None
    assert requests == []


def test_does_not_follow_redirects(artwork_client):
    requests, replies = artwork_client
    replies.append(httpx.Response(302, headers={"location": "http://127.0.0.1/private"}))
    assert cover_service.fetch_cover_image_url(ARTWORK_URL) is None
    assert len(requests) == 1


def test_downloads_jpeg(artwork_client):
    _, replies = artwork_client
    replies.append(httpx.Response(200, content=JPEG, headers={"content-type": "image/jpeg"}))
    assert cover_service.fetch_cover_image_url(ARTWORK_URL) == JPEG


@pytest.mark.parametrize(("body", "media_type"), [
    (b"<svg onload='alert(1)'/>", "image/svg+xml"),
    (b"<html>error</html>", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (JPEG, "image/png"), (JPEG[:-2], "image/jpeg"),
    (b"\xff\xd8junk\xff\xd9", "image/jpeg"),
])
def test_rejects_invalid_or_mismatched_image(artwork_client, body, media_type):
    _, replies = artwork_client
    replies.append(httpx.Response(200, content=body, headers={"content-type": media_type}))
    assert cover_service.fetch_cover_image_url(ARTWORK_URL) is None


@pytest.mark.parametrize("announced", [True, False])
def test_limits_download_size(artwork_client, monkeypatch, announced):
    _, replies = artwork_client
    monkeypatch.setattr(cover_service, "MAX_COVER_BYTES", 32, raising=False)
    headers = {"content-type": "image/jpeg"}
    if announced:
        headers["content-length"] = str(len(JPEG))
    replies.append(httpx.Response(200, stream=httpx.ByteStream(JPEG), headers=headers))
    assert cover_service.fetch_cover_image_url(ARTWORK_URL) is None


def test_search_filters_untrusted_artwork(artwork_client):
    _, replies = artwork_client
    replies.append(httpx.Response(200, json={"results": [
        {"artworkUrl100": "https://evil.test/a.jpg"},
        {"artworkUrl100": ARTWORK_URL.replace("600x600", "100x100")},
    ]}))
    candidates = cover_service.search_album_cover_candidates("Album")
    assert [item.image_url for item in candidates] == [ARTWORK_URL]
