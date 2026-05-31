"""歌手照片获取服务 — 通过 MusicBrainz + Wikimedia Commons 获取歌手真实照片。"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import httpx

from app.core.config import ARTIST_IMAGES_DIR

logger = logging.getLogger(__name__)

# MusicBrainz API 配置
MUSICBRAINZ_API = "https://musicbrainz.org/ws/2"
MUSICBRAINZ_HEADERS = {
    "User-Agent": "MuzeMusicPlayer/1.0 (https://github.com/user/muze)"
}

# Wikimedia Commons API 配置
WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php"


def _artist_image_path(artist_name: str) -> Path:
    """生成歌手图片的本地路径。"""
    # 使用歌手名的 MD5 哈希作为文件名，避免特殊字符问题
    name_hash = hashlib.md5(artist_name.encode("utf-8")).hexdigest()[:12]
    return ARTIST_IMAGES_DIR / f"{name_hash}.jpg"


def search_musicbrainz_artist(artist_name: str) -> str | None:
    """在 MusicBrainz 搜索歌手，返回 MBID。"""
    try:
        with httpx.Client(timeout=10.0, trust_env=False) as client:
            response = client.get(
                f"{MUSICBRAINZ_API}/artist",
                params={
                    "query": f'artist:"{artist_name}"',
                    "fmt": "json",
                    "limit": 1,
                },
                headers=MUSICBRAINZ_HEADERS,
            )
            response.raise_for_status()
            data = response.json()

            artists = data.get("artists", [])
            if not artists:
                logger.debug(f"MusicBrainz 未找到歌手: {artist_name}")
                return None

            mbid = artists[0].get("id")
            logger.debug(f"MusicBrainz 找到歌手 {artist_name}: MBID={mbid}")
            return mbid

    except Exception as e:
        logger.warning(f"MusicBrainz 搜索失败 ({artist_name}): {e}")
        return None


def get_wikimedia_image(mbid: str) -> bytes | None:
    """通过 MusicBrainz MBID 从 Wikimedia Commons 获取歌手图片。"""
    try:
        with httpx.Client(timeout=10.0, trust_env=False) as client:
            # 1. 从 MusicBrainz 获取歌手的关联信息
            response = client.get(
                f"{MUSICBRAINZ_API}/artist/{mbid}",
                params={"fmt": "json", "inc": "url-rels"},
                headers=MUSICBRAINZ_HEADERS,
            )
            response.raise_for_status()
            artist_data = response.json()

            relations = artist_data.get("relations", [])
            commons_page = None

            # 优先查找直接的 image 类型关联
            for rel in relations:
                if rel.get("type") == "image":
                    url = rel.get("url", {}).get("resource", "")
                    if "commons.wikimedia.org" in url:
                        commons_page = url
                        break

            # 如果没有直接图片，尝试通过 Wikidata 获取
            if not commons_page:
                for rel in relations:
                    if rel.get("type") == "wikidata":
                        url = rel.get("url", {}).get("resource", "")
                        if "wikidata.org" in url:
                            wikidata_id = url.split("/")[-1]
                            commons_page = _get_commons_image_from_wikidata(client, wikidata_id)
                            if commons_page:
                                break

            if not commons_page:
                logger.debug(f"未找到歌手的 Wikimedia 图片: MBID={mbid}")
                return None

            # 2. 如果是 Wikimedia Commons 页面 URL，需要解析出实际图片 URL
            if "/wiki/File:" in commons_page:
                commons_url = _get_direct_image_url(client, commons_page)
                if not commons_url:
                    return None
            else:
                commons_url = commons_page

            # 3. 清理 URL 中的跟踪参数并下载图片
            clean_url = commons_url.split("?")[0] if "?" in commons_url else commons_url
            logger.debug(f"下载歌手图片: {clean_url}")
            img_response = client.get(
                clean_url,
                follow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; MuzeMusicPlayer/1.0; +https://github.com/user/muze)",
                    "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
                },
            )
            img_response.raise_for_status()

            content_type = img_response.headers.get("content-type", "")
            if not content_type.startswith("image/"):
                logger.warning(f"非图片内容: {content_type}")
                return None

            return img_response.content

    except Exception as e:
        logger.warning(f"获取 Wikimedia 图片失败 (MBID={mbid}): {e}")
        return None


def _get_direct_image_url(client: httpx.Client, commons_page: str) -> str | None:
    """从 Wikimedia Commons 页面 URL 获取直接图片 URL。"""
    try:
        # 从页面 URL 提取文件名
        # 例如: https://commons.wikimedia.org/wiki/File:Eason_getalife.jpg
        filename = commons_page.split("/wiki/File:")[-1]
        # 获取图片信息
        response = client.get(
            "https://commons.wikimedia.org/w/api.php",
            params={
                "action": "query",
                "titles": f"File:{filename}",
                "prop": "imageinfo",
                "iiprop": "url",
                "format": "json",
            },
            headers=MUSICBRAINZ_HEADERS,
        )
        response.raise_for_status()
        data = response.json()
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            imageinfo = page.get("imageinfo", [])
            if imageinfo:
                return imageinfo[0].get("url")
        return None
    except Exception as e:
        logger.warning(f"获取图片直链失败 ({commons_page}): {e}")
        return None


def _get_commons_image_from_wikidata(client: httpx.Client, wikidata_id: str) -> str | None:
    """从 Wikidata 获取 Wikimedia Commons 图片 URL。"""
    try:
        # 使用 Wikidata API 获取图片属性 (P18)
        response = client.get(
            "https://www.wikidata.org/w/api.php",
            params={
                "action": "wbgetclaims",
                "entity": wikidata_id,
                "property": "P18",
                "format": "json",
            },
            headers=MUSICBRAINZ_HEADERS,
        )
        response.raise_for_status()
        data = response.json()

        claims = data.get("claims", {}).get("P18", [])
        if not claims:
            return None

        # 获取图片文件名
        filename = claims[0].get("mainsnak", {}).get("datavalue", {}).get("value")
        if not filename:
            return None

        # 构建 Wikimedia Commons URL
        # 使用 thumb URL 获取合适大小的图片（最大 500px）
        encoded_filename = filename.replace(" ", "_")
        file_hash = _md5_hash(encoded_filename)
        commons_url = (
            f"https://upload.wikimedia.org/wikipedia/commons/thumb/"
            f"{file_hash[0]}/{file_hash[0:2]}/{encoded_filename}/500px-{encoded_filename}"
        )
        return commons_url

    except Exception as e:
        logger.warning(f"获取 Wikidata 图片失败 ({wikidata_id}): {e}")
        return None


def _md5_hash(text: str) -> str:
    """计算 MD5 哈希（用于 Wikimedia URL 构建）。"""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def fetch_artist_image(artist_name: str) -> Path | None:
    """获取歌手照片并保存到本地。

    Args:
        artist_name: 歌手名称

    Returns:
        保存的图片路径，如果未找到则返回 None
    """
    # 检查是否已存在
    image_path = _artist_image_path(artist_name)
    if image_path.exists():
        logger.debug(f"歌手照片已存在: {artist_name}")
        return image_path

    logger.info(f"开始获取歌手照片: {artist_name}")

    # 1. 在 MusicBrainz 搜索歌手
    mbid = search_musicbrainz_artist(artist_name)
    if not mbid:
        return None

    # 2. 从 Wikimedia 获取图片
    image_data = get_wikimedia_image(mbid)
    if not image_data:
        return None

    # 3. 保存图片
    try:
        ARTIST_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        image_path.write_bytes(image_data)
        logger.info(f"歌手照片已保存: {artist_name} -> {image_path}")
        return image_path
    except Exception as e:
        logger.error(f"保存歌手照片失败 ({artist_name}): {e}")
        return None


def batch_fetch_artist_images(artist_names: list[str]) -> dict[str, Path]:
    """批量获取歌手照片。

    Args:
        artist_names: 歌手名称列表

    Returns:
        歌手名称 -> 图片路径的映射
    """
    results = {}
    for name in artist_names:
        image_path = fetch_artist_image(name)
        if image_path:
            results[name] = image_path
    return results
