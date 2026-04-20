"""Favorites API — 收藏管理。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Favorite, Track
from app.schemas.schemas import TrackOut

router = APIRouter(prefix="/api/favorites", tags=["favorites"])


def _track_to_dict(track: Track) -> dict:
    """将 Track ORM 对象转为符合 TrackOut 的字典（收藏列表中 is_favorite=True）。"""
    return {
        "id": track.id,
        "file_path": track.file_path,
        "title": track.title,
        "artist_id": track.artist_id,
        "album_id": track.album_id,
        "artist": track.artist,
        "album": track.album,
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
        "is_favorite": True,
    }


@router.get("", response_model=list[TrackOut])
def list_favorites(db: Session = Depends(get_db)):
    """列出所有收藏曲目，按 added_at 降序。"""
    favorites = (
        db.query(Favorite).order_by(Favorite.added_at.desc()).all()
    )
    track_ids = [fav.track_id for fav in favorites]
    if not track_ids:
        return []
    track_map = {
        t.id: t for t in db.query(Track).filter(Track.id.in_(track_ids)).all()
    }
    return [
        _track_to_dict(track_map[tid])
        for tid in track_ids
        if tid in track_map
    ]


@router.post("/{track_id}")
def add_favorite(track_id: int, db: Session = Depends(get_db)):
    """添加收藏（幂等）。"""
    track = db.query(Track).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")

    existing = db.query(Favorite).filter_by(track_id=track_id).first()
    if not existing:
        db.add(Favorite(track_id=track_id))
        db.commit()
    return {"ok": True}


@router.delete("/{track_id}")
def remove_favorite(track_id: int, db: Session = Depends(get_db)):
    """取消收藏。"""
    fav = db.query(Favorite).filter_by(track_id=track_id).first()
    if not fav:
        raise HTTPException(status_code=404, detail="未收藏该曲目")
    db.delete(fav)
    db.commit()
    return {"ok": True}
