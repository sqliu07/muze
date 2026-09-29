"""Album cover lookup service."""
from __future__ import annotations

import logging
import ipaddress
import re
import socket
import time
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger(__name__)

ITUNES_SEARCH_API = "https://itunes.apple.com/search"
MAX_COVER_BYTES = 5 * 1024 * 1024
MAX_COVER_SECONDS = 20
MAX_COVER_PIXELS = 4096 * 4096
ARTWORK_HOST = re.compile(r"is[0-9]+-ssl\.mzstatic\.com", re.ASCII)
HTTP_HEADERS = {
    "User-Agent": "MuzeMusicPlayer/1.0",
    "Accept": "application/json",
}


@dataclass
class CoverCandidate:
    image_url: str
    thumbnail_url: str
    album_title: str = ""
    artist_name: str = ""
    source: str = "itunes"


def _cover_url_600(url: str) -> str:
    return url.replace("100x100bb", "600x600bb")


def _artwork_host(image_url: str) -> str | None:
    """Only Apple's HTTPS JPEG artwork endpoints may be fetched."""
    try:
        url = urlsplit(image_url)
        if (
            url.scheme != "https"
            or not ARTWORK_HOST.fullmatch(url.hostname or "")
            or url.username is not None or url.password is not None
            or url.port not in (None, 443)
            or url.fragment
            or not url.path.lower().endswith((".jpg", ".jpeg"))
            or any(char.isspace() or ord(char) < 32 for char in image_url)
        ):
            return None
        return url.hostname
    except (ValueError, TypeError):
        return None


def _is_jpeg(data: bytes) -> bool:
    """Check JPEG marker structure and dimensions without decoding pixels.

    Covers are stored as .jpg and served as image/jpeg, so other formats are
    intentionally rejected. Segment lengths and the final EOI catch truncated
    images; this is structural validation, not a full entropy decoder.
    """
    if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
        return False
    offset, has_frame, has_scan = 2, False, False
    while offset < len(data):
        if data[offset] != 0xFF:
            return False
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            return False
        marker = data[offset]
        offset += 1
        if marker == 0xD9:
            return has_frame and has_scan and offset == len(data)
        if marker in (0, 0xD8) or 0xD0 <= marker <= 0xD7:
            return False
        length = int.from_bytes(data[offset:offset + 2], "big")
        end = offset + length
        if length < 2 or end > len(data):
            return False
        if marker in (0xC0, 0xC1, 0xC2):
            if length < 8:
                return False
            height = int.from_bytes(data[offset + 3:offset + 5], "big")
            width = int.from_bytes(data[offset + 5:offset + 7], "big")
            components = data[offset + 7]
            if not (width and height and width * height <= MAX_COVER_PIXELS
                    and components in (1, 3, 4) and length == 8 + 3 * components):
                return False
            has_frame = True
        offset = end
        if marker == 0xDA:
            if not has_frame or length < 6:
                return False
            has_scan = True
            # Entropy data escapes FF as FF00 and may contain restart markers.
            while offset < len(data) - 1:
                offset = data.find(b"\xff", offset)
                if offset < 0:
                    return False
                if data[offset + 1] == 0 or 0xD0 <= data[offset + 1] <= 0xD7:
                    offset += 2
                else:
                    break
    return False


def search_album_cover_candidates(
    album_title: str | None,
    artist_name: str | None = None,
    track_title: str | None = None,
    limit: int = 8,
) -> list[CoverCandidate]:
    query_parts = [part for part in (artist_name, album_title or track_title) if part]
    query = " ".join(str(part).strip() for part in query_parts if str(part).strip())
    if not query:
        return []

    try:
        with httpx.Client(timeout=10.0, trust_env=False) as client:
            response = client.get(
                ITUNES_SEARCH_API,
                params={
                    "term": query,
                    "media": "music",
                    "entity": "album",
                    "limit": max(1, min(limit, 20)),
                },
                headers=HTTP_HEADERS,
            )
            response.raise_for_status()
            results = response.json().get("results", [])

            candidates: list[CoverCandidate] = []
            seen: set[str] = set()
            for result in results:
                thumbnail_url = result.get("artworkUrl100")
                if not thumbnail_url or not _artwork_host(thumbnail_url):
                    continue
                image_url = _cover_url_600(thumbnail_url)
                if image_url in seen:
                    continue
                seen.add(image_url)
                candidates.append(
                    CoverCandidate(
                        image_url=image_url,
                        thumbnail_url=thumbnail_url,
                        album_title=result.get("collectionName") or "",
                        artist_name=result.get("artistName") or "",
                    )
                )
            return candidates
    except Exception as exc:
        logger.warning("搜索专辑封面候选失败 (%s): %s", query, exc)
        return []


def fetch_cover_image_url(image_url: str) -> bytes | None:
    hostname = _artwork_host(image_url)
    if not hostname:
        return None
    try:
        addresses = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            return None
        started = time.monotonic()
        # The hostname allowlist excludes attacker-controlled DNS. Reject all
        # redirects, including redirects to another otherwise permitted host.
        with httpx.Client(timeout=10.0, trust_env=False, follow_redirects=False) as client:
            with client.stream("GET", image_url, headers={
                "User-Agent": HTTP_HEADERS["User-Agent"],
                "Accept": "image/jpeg", "Accept-Encoding": "identity",
            }) as response:
                response.raise_for_status()
                if response.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "image/jpeg":
                    return None
                if response.headers.get("content-encoding", "identity").lower() != "identity":
                    return None
                size = int(response.headers.get("content-length", "0"))
                if size < 0 or size > MAX_COVER_BYTES:
                    return None
                content = bytearray()
                for chunk in response.iter_bytes(chunk_size=64 * 1024):
                    if len(content) + len(chunk) > MAX_COVER_BYTES or time.monotonic() - started > MAX_COVER_SECONDS:
                        return None
                    content.extend(chunk)
                image_data = bytes(content)
                if _is_jpeg(image_data):
                    return image_data
    except Exception as exc:
        logger.warning("下载封面图片失败 (%s): %s", image_url, exc)
    return None


def fetch_album_cover(
    album_title: str | None,
    artist_name: str | None = None,
    track_title: str | None = None,
) -> bytes | None:
    """Search and download album artwork.

    The iTunes Search API is used because it does not require credentials and
    returns direct artwork URLs for common music metadata queries.
    """
    candidates = search_album_cover_candidates(album_title, artist_name, track_title, limit=5)
    for candidate in candidates:
        image_data = fetch_cover_image_url(candidate.image_url)
        if image_data:
            return image_data
    return None
