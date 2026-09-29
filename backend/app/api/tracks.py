"""Tracks API — 列表、详情、流式传输、封面、元数据更新。"""
from __future__ import annotations

import os
import hashlib
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.core.config import COVERS_DIR
from app.core.database import get_db
from app.models.models import Artist, Favorite, Track
from app.schemas.schemas import (
    TrackCoverApply,
    TrackCoverCandidateOut,
    TrackCoverSearch,
    TrackListOut,
    TrackOut,
    TrackUpdate,
)

router = APIRouter(prefix="/api/tracks", tags=["tracks"])


def _cover_name_for_track(track: Track, image_url: str = "") -> str:
    artist_name = track.artist.name if track.artist else ""
    album_title = track.album.title if track.album else track.title
    cover_key = "\0".join([artist_name, album_title, image_url])
    cover_hash = hashlib.md5(cover_key.encode("utf-8")).hexdigest()[:12]
    return f"search-{cover_hash}.jpg"


def _track_to_dict(track: Track, is_favorite: bool) -> dict:
    """将 Track ORM 对象转为符合 TrackOut 的字典。"""
    from app.schemas.schemas import AlbumOut, ArtistOut

    artist_dict = None
    if track.artist is not None:
        artist_dict = ArtistOut.model_validate(track.artist).model_dump()

    album_dict = None
    if track.album is not None:
        album_dict = AlbumOut.model_validate(track.album).model_dump()

    return {
        "id": track.id,
        "file_path": track.file_path,
        "title": track.title,
        "artist_id": track.artist_id,
        "album_id": track.album_id,
        "artist": artist_dict,
        "album": album_dict,
        "duration": track.duration,
        "bitrate": track.bitrate,
        "format": track.format,
        "track_number": track.track_number,
        "disc_number": track.disc_number,
        "year": track.year,
        "genre": track.genre,
        "has_cover": track.has_cover,
        "play_count": track.play_count,
        "file_missing": track.file_missing,
        "date_added": track.date_added,
        "is_favorite": is_favorite,
    }


@router.get("", response_model=TrackListOut)
def list_tracks(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    sort: str = Query("title"),
    order: str = Query("asc"),
    search: str = Query(None),
    db: Session = Depends(get_db),
):
    """分页列出曲目，支持排序和搜索。"""
    query = db.query(Track)

    if search:
        query = query.filter(Track.title.ilike(f"%{search}%"))

    total = query.count()

    # 排序
    sort_col = getattr(Track, sort, Track.title)
    if order == "desc":
        sort_col = sort_col.desc()
    else:
        sort_col = sort_col.asc()
    query = query.order_by(sort_col)

    items = query.offset((page - 1) * limit).limit(limit).all()

    # 查询收藏状态
    track_ids = [t.id for t in items]
    fav_ids = set()
    if track_ids:
        fav_ids = {
            f.track_id
            for f in db.query(Favorite.track_id)
            .filter(Favorite.track_id.in_(track_ids))
            .all()
        }

    return TrackListOut(
        items=[_track_to_dict(t, t.id in fav_ids) for t in items],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{track_id}", response_model=TrackOut)
def get_track(track_id: int, db: Session = Depends(get_db)):
    """获取单个曲目详情。"""
    track = db.query(Track).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")

    is_favorite = db.query(Favorite).filter_by(track_id=track_id).first() is not None
    return _track_to_dict(track, is_favorite)


@router.get("/{track_id}/stream")
def stream_track(
    track_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """流式传输音频文件，支持 HTTP Range 请求。"""
    track = db.query(Track).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")

    file_path = Path(track.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    content_type = "audio/mpeg"
    suffix = file_path.suffix.lower()
    if suffix == ".flac":
        content_type = "audio/flac"
    elif suffix == ".ogg":
        content_type = "audio/ogg"
    elif suffix in (".m4a", ".mp4"):
        content_type = "audio/mp4"
    elif suffix == ".wav":
        content_type = "audio/wav"
    elif suffix == ".aiff":
        content_type = "audio/aiff"

    if range_header:
        # 解析 Range header，格式: bytes=start-end
        try:
            range_spec = range_header.replace("bytes=", "")
            parts = range_spec.split("-")
            start = int(parts[0])
            end = int(parts[1]) if parts[1] else file_size - 1
            end = min(end, file_size - 1)

            if start >= file_size:
                raise HTTPException(status_code=416, detail="范围不可满足")

            content_length = end - start + 1
            with open(file_path, "rb") as f:
                f.seek(start)
                data = f.read(content_length)

            return Response(
                content=data,
                status_code=206,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(len(data)),
                    "Content-Type": content_type,
                },
            )
        except HTTPException:
            raise
        except (ValueError, IndexError):
            raise HTTPException(status_code=400, detail="无效的 Range header")

    # 无 Range header，返回完整文件
    return FileResponse(
        str(file_path),
        media_type=content_type,
        headers={"Accept-Ranges": "bytes"},
    )


@router.get("/{track_id}/cover")
def get_track_cover(track_id: int, db: Session = Depends(get_db)):
    """获取曲目封面图片。"""
    track = db.query(Track).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")

    # 通过专辑的 cover_path 查找封面
    if track.album_id:
        from app.models.models import Album

        album = db.query(Album).filter_by(id=track.album_id).first()
        if album and album.cover_path:
            cover_file = COVERS_DIR / album.cover_path
            if cover_file.exists():
                return FileResponse(
                    str(cover_file),
                    media_type="image/jpeg",
                    headers={"Cache-Control": "no-cache"},
                )

    raise HTTPException(status_code=404, detail="封面不存在")


@router.post("/{track_id}/cover/search", response_model=TrackOut)
def search_track_cover(track_id: int, db: Session = Depends(get_db)):
    """联网搜索当前曲目的专辑封面并写入元数据。"""
    track = db.query(Track).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")
    if not track.album:
        raise HTTPException(status_code=400, detail="曲目缺少专辑信息，无法写入封面")

    album_title = track.album.title if track.album else None
    artist_name = track.artist.name if track.artist else None
    try:
        from app.services.cover_service import fetch_album_cover

        image_data = fetch_album_cover(album_title, artist_name, track.title)
    except Exception:
        image_data = None

    if not image_data:
        raise HTTPException(status_code=404, detail="未找到可用封面")

    return _apply_cover_bytes(db, track, image_data, _cover_name_for_track(track))


@router.post("/{track_id}/cover/candidates", response_model=list[TrackCoverCandidateOut])
def search_track_cover_candidates(
    track_id: int,
    body: TrackCoverSearch,
    db: Session = Depends(get_db),
):
    """按指定 title/artist 返回可选封面候选。"""
    track = db.query(Track).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title 不能为空")

    from app.services.cover_service import search_album_cover_candidates

    candidates = search_album_cover_candidates(
        body.title,
        body.artist,
        body.title,
        limit=body.limit,
    )
    return [
        {
            "image_url": c.image_url,
            "thumbnail_url": c.thumbnail_url,
            "album_title": c.album_title,
            "artist_name": c.artist_name,
            "source": c.source,
        }
        for c in candidates
    ]


@router.post("/{track_id}/cover", response_model=TrackOut)
def apply_track_cover(
    track_id: int,
    body: TrackCoverApply,
    db: Session = Depends(get_db),
):
    """应用用户选择的封面候选。"""
    track = db.query(Track).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")
    if not track.album:
        raise HTTPException(status_code=400, detail="曲目缺少专辑信息，无法写入封面")

    from app.services.cover_service import fetch_cover_image_url

    image_data = fetch_cover_image_url(body.image_url)
    if not image_data:
        raise HTTPException(status_code=404, detail="封面下载失败")

    return _apply_cover_bytes(
        db,
        track,
        image_data,
        _cover_name_for_track(track, body.image_url),
    )


def _apply_cover_bytes(
    db: Session,
    track: Track,
    image_data: bytes,
    cover_name: str,
) -> dict:
    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    (COVERS_DIR / cover_name).write_bytes(image_data)
    if track.album:
        track.album.cover_path = cover_name
    if track.artist and not track.artist.cover_path:
        track.artist.cover_path = cover_name
    track.has_cover = True

    db.commit()
    db.refresh(track)

    is_favorite = db.query(Favorite).filter_by(track_id=track.id).first() is not None
    return _track_to_dict(track, is_favorite)


@router.patch("/{track_id}", response_model=TrackOut)
def update_track(
    track_id: int,
    body: TrackUpdate,
    db: Session = Depends(get_db),
):
    """更新曲目元数据。"""
    track = db.query(Track).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")

    # 更新 Track 自身字段
    for field in ("title", "year", "track_number", "disc_number", "genre"):
        value = getattr(body, field, None)
        if value is not None:
            setattr(track, field, value)

    # 处理 artist_name
    if body.artist_name is not None:
        artist = db.query(Artist).filter_by(name=body.artist_name).first()
        if not artist:
            artist = Artist(name=body.artist_name)
            db.add(artist)
            db.flush()
        track.artist_id = artist.id

    # 处理 album_title
    if body.album_title is not None:
        from app.models.models import Album

        album = db.query(Album).filter_by(
            title=body.album_title, artist_id=track.artist_id
        ).first()
        if not album:
            album = Album(title=body.album_title, artist_id=track.artist_id)
            db.add(album)
            db.flush()
        track.album_id = album.id

    db.commit()
    db.refresh(track)

    is_favorite = db.query(Favorite).filter_by(track_id=track_id).first() is not None
    return _track_to_dict(track, is_favorite)
