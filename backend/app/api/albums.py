"""Albums API — 列表、详情。"""
from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import COVERS_DIR
from app.core.database import get_db
from app.models.models import Album, Track
from app.schemas.schemas import AlbumDetailOut, AlbumOut, TrackOut

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
        artist_dict = ArtistOut.from_orm(album.artist).dict()

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


def _track_to_dict(track: Track) -> dict:
    """将 Track ORM 对象转为字典。"""
    from app.schemas.schemas import AlbumOut as AlbumOutSchema, ArtistOut

    artist_dict = None
    if track.artist is not None:
        artist_dict = ArtistOut.from_orm(track.artist).dict()

    album_dict = None
    if track.album is not None:
        album_dict = AlbumOutSchema.from_orm(track.album).dict()

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
    artist_id: int = Query(None),
    db: Session = Depends(get_db),
):
    """列出专辑，可选按 artist_id 过滤。"""
    query = db.query(Album)

    if artist_id is not None:
        query = query.filter(Album.artist_id == artist_id)

    sort_col = getattr(Album, sort, Album.title)
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

    return FileResponse(str(cover_file), media_type="image/jpeg")
