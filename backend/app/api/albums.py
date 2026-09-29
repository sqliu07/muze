"""Albums API — 列表、详情。"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import COVERS_DIR
from app.core.database import get_db
from app.models.models import Album, Artist, Track
from app.schemas.schemas import (
    AlbumDetailOut,
    AlbumOut,
    TrackCoverApply as AlbumCoverApply,
    TrackCoverCandidateOut,
    TrackCoverSearch as AlbumCoverSearch,
    TrackOut,
)

router = APIRouter(prefix="/api/albums", tags=["albums"])


def _infer_disc_track_from_path(file_path: str) -> tuple[int | None, int | None]:
    stem = Path(file_path).stem
    m = re.match(r"^\s*(\d{1,2})[._-](\d{1,2})\D", stem)
    if m:
        try:
            return int(m.group(1)), int(m.group(2))
        except ValueError:
            return None, None
    m = re.match(r"^\s*(\d{1,2})\D", stem)
    if m:
        try:
            return None, int(m.group(1))
        except ValueError:
            return None, None
    return None, None


def _album_to_dict(album: Album) -> dict:
    """将 Album ORM 对象转为字典。"""
    from app.schemas.schemas import ArtistOut

    artist_dict = None
    if album.artist is not None:
        artist_dict = ArtistOut.model_validate(album.artist).model_dump()

    return {
        "id": album.id,
        "title": album.title,
        "year": album.year,
        "genre": album.genre,
        "artist_id": album.artist_id,
        "artist": artist_dict,
        "cover_path": album.cover_path,
        "total_tracks": album.total_tracks,
    }


def _album_cover_name(album: Album, image_url: str = "") -> str:
    artist_name = album.artist.name if album.artist else ""
    key = "\0".join([artist_name, album.title, image_url])
    cover_hash = hashlib.md5(key.encode("utf-8")).hexdigest()[:12]
    return f"search-{cover_hash}.jpg"


def _track_to_dict(track: Track) -> dict:
    """将 Track ORM 对象转为字典。"""
    from app.schemas.schemas import AlbumOut as AlbumOutSchema, ArtistOut

    artist_dict = None
    if track.artist is not None:
        artist_dict = ArtistOut.model_validate(track.artist).model_dump()

    album_dict = None
    if track.album is not None:
        album_dict = AlbumOutSchema.model_validate(track.album).model_dump()

    return {
        "id": track.id,
        "file_path": track.file_path,
        "title": track.title,
        "duration": track.duration,
        "format": track.format,
        "track_number": track.track_number,
        "disc_number": track.disc_number,
        "year": track.year,
        "genre": track.genre,
        "artist_id": track.artist_id,
        "album_id": track.album_id,
        "artist": artist_dict,
        "album": album_dict,
        "bitrate": track.bitrate,
        "has_cover": track.has_cover,
        "play_count": track.play_count,
        "file_missing": track.file_missing,
        "date_added": track.date_added,
        "is_favorite": False,
    }


@router.get("", response_model=list[AlbumOut])
def list_albums(
    sort: str = Query("title"),
    order: str = Query("asc"),
    artist_id: int = Query(None),
    db: Session = Depends(get_db),
):
    """列出专辑，可选按 artist_id 过滤。"""
    query = db.query(Album)

    if artist_id is not None:
        query = query.filter(Album.artist_id == artist_id)

    # 特殊处理：按艺术家名排序需要 JOIN
    if sort == "artist":
        query = query.outerjoin(Album.artist)
        sort_col = Artist.name.asc()
        if order == "desc":
            sort_col = Artist.name.desc()
    else:
        sort_col = getattr(Album, sort, Album.title)
        if order == "desc":
            sort_col = sort_col.desc()
    query = query.order_by(sort_col)

    albums = query.all()
    return [_album_to_dict(a) for a in albums]


@router.get("/{album_id}", response_model=AlbumDetailOut)
def get_album(album_id: int, db: Session = Depends(get_db)):
    """获取专辑详情（含 tracks 列表，优先 disc/track，缺失时按文件名兜底）。"""
    album = db.query(Album).filter_by(id=album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="专辑不存在")

    tracks_raw = (
        db.query(Track)
        .filter(Track.album_id == album_id, Track.file_missing == False)
        .all()
    )
    def _track_sort_key(t: Track):
        inferred_disc, inferred_track = _infer_disc_track_from_path(t.file_path)
        disc = t.disc_number if t.disc_number is not None else inferred_disc
        track = t.track_number if t.track_number is not None else inferred_track
        return (
            disc if disc is not None else 9999,
            track if track is not None else 9999,
            Path(t.file_path).name.lower(),
            t.id,
        )

    tracks = sorted(tracks_raw, key=_track_sort_key)

    result = _album_to_dict(album)
    result["tracks"] = [_track_to_dict(t) for t in tracks]
    return result


@router.get("/{album_id}/cover")
def get_album_cover(album_id: int, db: Session = Depends(get_db)):
    """获取专辑封面图片。"""
    album = db.query(Album).filter_by(id=album_id).first()
    if not album or not album.cover_path:
        raise HTTPException(status_code=404, detail="封面不存在")

    cover_file = COVERS_DIR / album.cover_path
    if not cover_file.exists():
        raise HTTPException(status_code=404, detail="封面文件不存在")

    return FileResponse(str(cover_file), media_type="image/jpeg", headers={"Cache-Control": "no-cache"})


@router.post("/{album_id}/cover/candidates", response_model=list[TrackCoverCandidateOut])
def search_album_cover_candidates_api(
    album_id: int,
    body: AlbumCoverSearch,
    db: Session = Depends(get_db),
):
    album = db.query(Album).filter_by(id=album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="专辑不存在")
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title 不能为空")

    from app.services.cover_service import search_album_cover_candidates

    candidates = search_album_cover_candidates(
        body.title,
        body.artist or (album.artist.name if album.artist else None),
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


@router.post("/{album_id}/cover", response_model=AlbumOut)
def apply_album_cover(
    album_id: int,
    body: AlbumCoverApply,
    db: Session = Depends(get_db),
):
    album = db.query(Album).filter_by(id=album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="专辑不存在")

    from app.services.cover_service import fetch_cover_image_url

    image_data = fetch_cover_image_url(body.image_url)
    if not image_data:
        raise HTTPException(status_code=404, detail="封面下载失败")

    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    cover_name = _album_cover_name(album, body.image_url)
    (COVERS_DIR / cover_name).write_bytes(image_data)
    album.cover_path = cover_name
    if album.artist and not album.artist.cover_path:
        album.artist.cover_path = cover_name
    db.query(Track).filter(Track.album_id == album.id).update({"has_cover": True})
    db.commit()
    db.refresh(album)
    return _album_to_dict(album)
