"""Search API — 全局搜索歌手、专辑、曲目。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Album, Artist, Track
from app.schemas.schemas import AlbumOut, ArtistOut, SearchResultOut, TrackOut

router = APIRouter(prefix="/api/search", tags=["search"])


def _artist_to_dict(artist: Artist) -> dict:
    """将 Artist ORM 对象转为字典。"""
    return {
        "id": artist.id,
        "name": artist.name,
        "cover_path": artist.cover_path,
    }


def _album_to_dict(album: Album) -> dict:
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


def _track_to_dict(track: Track) -> dict:
    """将 Track ORM 对象转为字典。"""
    return {
        "id": track.id,
        "title": track.title,
        "artist_id": track.artist_id,
        "artist": _artist_to_dict(track.artist) if track.artist else None,
        "album_id": track.album_id,
        "album": {
            "id": track.album.id,
            "title": track.album.title,
            "cover_path": track.album.cover_path,
            "artist_id": track.album.artist_id,
            "artist": _artist_to_dict(track.album.artist) if track.album and track.album.artist else None,
        } if track.album else None,
        "duration": track.duration,
        "format": track.format,
        "year": track.year,
        "genre": track.genre,
        "play_count": track.play_count,
        "has_cover": track.album.cover_path is not None if track.album else False,
    }


@router.get("", response_model=SearchResultOut)
def search(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    limit: int = Query(10, ge=1, le=50, description="每个分类的最大返回数"),
    type: str | None = Query(None, description="搜索类型: artist, album, track"),
    db: Session = Depends(get_db),
):
    """全局搜索歌手、专辑、曲目。"""
    pattern = f"%{q}%"

    results = SearchResultOut(artists=[], albums=[], tracks=[])

    # 搜索歌手
    if type is None or type == "artist":
        artists = (
            db.query(Artist)
            .filter(Artist.name.ilike(pattern))
            .limit(limit)
            .all()
        )
        results.artists = [_artist_to_dict(a) for a in artists]

    # 搜索专辑（标题或歌手名）
    if type is None or type == "album":
        albums = (
            db.query(Album)
            .join(Artist, Album.artist_id == Artist.id, isouter=True)
            .filter(
                or_(
                    Album.title.ilike(pattern),
                    Artist.name.ilike(pattern),
                )
            )
            .limit(limit)
            .all()
        )
        results.albums = [_album_to_dict(a) for a in albums]

    # 搜索曲目（标题、歌手名或专辑名）
    if type is None or type == "track":
        tracks = (
            db.query(Track)
            .join(Artist, Track.artist_id == Artist.id, isouter=True)
            .join(Album, Track.album_id == Album.id, isouter=True)
            .filter(
                or_(
                    Track.title.ilike(pattern),
                    Artist.name.ilike(pattern),
                    Album.title.ilike(pattern),
                )
            )
            .limit(limit)
            .all()
        )
        results.tracks = [_track_to_dict(t) for t in tracks]

    return results
