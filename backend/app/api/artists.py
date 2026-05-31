"""Artists API — 列表、详情、封面。"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.config import ARTIST_IMAGES_DIR, COVERS_DIR
from app.core.database import get_db
from app.models.models import Album, Artist
from app.schemas.schemas import ArtistDetailOut, ArtistOut
from app.services.artist_image_service import fetch_artist_image
from app.services.artist_image_daemon import get_fetch_status, trigger_fetch_now

router = APIRouter(prefix="/api/artists", tags=["artists"])
_CJK_RE = re.compile(r"[\u4e00-\u9fff]+")
_NON_ALNUM_CJK_RE = re.compile(r"[^0-9a-z\u4e00-\u9fff]+")


def _artist_key(name: str) -> str:
    lowered = name.strip().lower()
    cjk = "".join(_CJK_RE.findall(lowered))
    if cjk:
        return cjk
    return _NON_ALNUM_CJK_RE.sub("", lowered)


def _get_artist_image_path(artist_name: str) -> Path | None:
    """获取歌手照片的本地路径（如果存在）。"""
    name_hash = hashlib.md5(artist_name.encode("utf-8")).hexdigest()[:12]
    image_path = ARTIST_IMAGES_DIR / f"{name_hash}.jpg"
    return image_path if image_path.exists() else None


def _resolve_artist_cover(artist_ids: list[int], fallback_artist: Artist, db: Session) -> str | None:
    """解析歌手封面路径，优先使用歌手照片，fallback 到专辑封面。"""
    # 1. 优先检查是否有独立的歌手照片
    artist_image = _get_artist_image_path(fallback_artist.name)
    if artist_image:
        # 返回相对于 ARTIST_IMAGES_DIR 的路径，使用特殊前缀标识
        return f"artist:{artist_image.name}"

    # 2. 检查数据库中的 cover_path（可能是专辑封面）
    if fallback_artist.cover_path:
        return fallback_artist.cover_path

    # 3. fallback 到最新专辑的封面
    cover = (
        db.query(Album.cover_path)
        .filter(Album.artist_id.in_(artist_ids), Album.cover_path.isnot(None))
        .order_by(desc(Album.year), desc(Album.id))
        .first()
    )
    return cover[0] if cover else None


def _artist_to_dict(artist: Artist, cover_path: str | None = None) -> dict:
    """将 Artist ORM 对象转为字典。"""
    return {
        "id": artist.id,
        "name": artist.name,
        "cover_path": cover_path if cover_path is not None else artist.cover_path,
    }


def _album_to_dict(album) -> dict:
    """将 Album ORM 对象转为字典。"""
    return {
        "id": album.id,
        "title": album.title,
        "year": album.year,
        "genre": album.genre,
        "artist_id": album.artist_id,
        "artist": _artist_to_dict(album.artist) if album.artist else None,
        "cover_path": album.cover_path,
        "total_tracks": album.total_tracks,
    }


@router.get("/fetch-status")
def get_artist_image_fetch_status():
    """获取歌手照片获取状态。"""
    return get_fetch_status()


@router.get("", response_model=list[ArtistOut])
def list_artists(db: Session = Depends(get_db)):
    """列出艺术家（按规范化名称去重），按 name 排序。"""
    artists = db.query(Artist).order_by(Artist.name).all()
    grouped: dict[str, list[Artist]] = {}
    for artist in artists:
        key = _artist_key(artist.name) or artist.name.strip().lower()
        grouped.setdefault(key, []).append(artist)

    deduped: list[dict] = []
    for group in grouped.values():
        # 优先使用更"原生"的中文名作为展示名。
        primary = sorted(group, key=lambda a: (len(a.name), a.name))[0]
        ids = [a.id for a in group]
        cover = _resolve_artist_cover(ids, primary, db)
        deduped.append(_artist_to_dict(primary, cover))

    deduped.sort(key=lambda x: x["name"])
    return deduped


@router.get("/{artist_id}", response_model=ArtistDetailOut)
def get_artist(artist_id: int, db: Session = Depends(get_db)):
    """获取艺术家详情（合并同规范名别名的 albums，按 year 降序）。"""
    artist = db.query(Artist).filter_by(id=artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="艺术家不存在")

    key = _artist_key(artist.name) or artist.name.strip().lower()
    alias_ids = [
        a.id
        for a in db.query(Artist).all()
        if (_artist_key(a.name) or a.name.strip().lower()) == key
    ]
    if not alias_ids:
        alias_ids = [artist_id]

    albums = (
        db.query(Album)
        .filter(Album.artist_id.in_(alias_ids))
        .order_by(Album.year.desc())
        .all()
    )

    cover = _resolve_artist_cover(alias_ids, artist, db)
    result = _artist_to_dict(artist, cover)
    result["albums"] = [_album_to_dict(a) for a in albums]
    return result


@router.get("/{artist_id}/cover")
def get_artist_cover(artist_id: int, db: Session = Depends(get_db)):
    """获取歌手头像图片。"""
    artist = db.query(Artist).filter_by(id=artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="艺术家不存在")

    # 解析封面路径（包含 fallback 到专辑封面的逻辑）
    key = _artist_key(artist.name) or artist.name.strip().lower()
    alias_ids = [
        a.id
        for a in db.query(Artist).all()
        if (_artist_key(a.name) or a.name.strip().lower()) == key
    ]
    if not alias_ids:
        alias_ids = [artist_id]

    cover_path = _resolve_artist_cover(alias_ids, artist, db)
    if not cover_path:
        raise HTTPException(status_code=404, detail="封面不存在")

    # 判断图片来源：歌手照片 vs 专辑封面
    if cover_path.startswith("artist:"):
        # 歌手照片
        image_filename = cover_path[7:]  # 移除 "artist:" 前缀
        cover_file = ARTIST_IMAGES_DIR / image_filename
    else:
        # 专辑封面
        cover_file = COVERS_DIR / cover_path

    if not cover_file.exists():
        raise HTTPException(status_code=404, detail="封面文件不存在")

    return FileResponse(str(cover_file), media_type="image/jpeg", headers={"Cache-Control": "no-cache"})


@router.post("/{artist_id}/fetch-image")
def fetch_artist_image_endpoint(artist_id: int, db: Session = Depends(get_db)):
    """触发获取歌手照片（从 MusicBrainz + Wikimedia）。"""
    artist = db.query(Artist).filter_by(id=artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="艺术家不存在")

    # 检查是否已有歌手照片
    existing_image = _get_artist_image_path(artist.name)
    if existing_image:
        return {
            "status": "already_exists",
            "message": f"歌手 {artist.name} 的照片已存在",
            "path": str(existing_image),
        }

    # 尝试获取歌手照片
    image_path = fetch_artist_image(artist.name)
    if image_path:
        return {
            "status": "success",
            "message": f"成功获取歌手 {artist.name} 的照片",
            "path": str(image_path),
        }
    else:
        return {
            "status": "not_found",
            "message": f"未找到歌手 {artist.name} 的照片",
        }


@router.post("/batch-fetch-images")
def batch_fetch_artist_images_endpoint(db: Session = Depends(get_db)):
    """批量获取所有歌手的照片（同步）。"""
    result = trigger_fetch_now(db)
    return result
