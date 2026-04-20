"""Playlists API — 歌单 CRUD、曲目管理、重排序。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Favorite, Playlist, PlaylistTrack, Track
from app.schemas.schemas import (
    PlaylistCreate,
    PlaylistDetailOut,
    PlaylistOut,
    PlaylistTracksAdd,
    PlaylistTracksReorder,
    PlaylistUpdate,
    TrackOut,
)

router = APIRouter(prefix="/api/playlists", tags=["playlists"])


def _playlist_to_dict(playlist: Playlist, track_count: int) -> dict:
    """将 Playlist ORM 对象转为符合 PlaylistOut 的字典。"""
    return {
        "id": playlist.id,
        "name": playlist.name,
        "description": playlist.description,
        "created_at": playlist.created_at,
        "updated_at": playlist.updated_at,
        "track_count": track_count,
    }


def _track_to_dict(track: Track, is_favorite: bool) -> dict:
    """将 Track ORM 对象转为符合 TrackOut 的字典。"""
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
        "is_favorite": is_favorite,
    }


@router.get("", response_model=list[PlaylistOut])
def list_playlists(db: Session = Depends(get_db)):
    """列出所有歌单，含 track_count。"""
    playlists = db.query(Playlist).order_by(Playlist.created_at.desc()).all()
    result = []
    for pl in playlists:
        count = (
            db.query(func.count(PlaylistTrack.track_id))
            .filter(PlaylistTrack.playlist_id == pl.id)
            .scalar()
        )
        result.append(_playlist_to_dict(pl, count))
    return result


@router.post("", response_model=PlaylistOut)
def create_playlist(body: PlaylistCreate, db: Session = Depends(get_db)):
    """创建歌单。"""
    playlist = Playlist(name=body.name, description=body.description)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _playlist_to_dict(playlist, 0)


@router.get("/{playlist_id}", response_model=PlaylistDetailOut)
def get_playlist(playlist_id: int, db: Session = Depends(get_db)):
    """获取歌单详情（含曲目列表）。"""
    playlist = db.query(Playlist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="歌单不存在")

    # 按 position 排序获取曲目
    entries = (
        db.query(PlaylistTrack)
        .filter_by(playlist_id=playlist_id)
        .order_by(PlaylistTrack.position)
        .all()
    )

    track_ids = [e.track_id for e in entries]
    tracks = []
    if track_ids:
        # 查询收藏状态
        fav_ids = {
            f.track_id
            for f in db.query(Favorite.track_id)
            .filter(Favorite.track_id.in_(track_ids))
            .all()
        }
        # 按 track_ids 顺序获取 Track
        track_map = {
            t.id: t
            for t in db.query(Track).filter(Track.id.in_(track_ids)).all()
        }
        for tid in track_ids:
            if tid in track_map:
                tracks.append(_track_to_dict(track_map[tid], tid in fav_ids))

    return {
        "id": playlist.id,
        "name": playlist.name,
        "description": playlist.description,
        "created_at": playlist.created_at,
        "updated_at": playlist.updated_at,
        "track_count": len(tracks),
        "tracks": tracks,
    }


@router.put("/{playlist_id}", response_model=PlaylistOut)
def update_playlist(
    playlist_id: int,
    body: PlaylistUpdate,
    db: Session = Depends(get_db),
):
    """更新歌单名称/描述。"""
    playlist = db.query(Playlist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="歌单不存在")

    if body.name is not None:
        playlist.name = body.name
    if body.description is not None:
        playlist.description = body.description

    db.commit()
    db.refresh(playlist)

    count = (
        db.query(func.count(PlaylistTrack.track_id))
        .filter(PlaylistTrack.playlist_id == playlist.id)
        .scalar()
    )
    return _playlist_to_dict(playlist, count)


@router.delete("/{playlist_id}")
def delete_playlist(playlist_id: int, db: Session = Depends(get_db)):
    """删除歌单。"""
    playlist = db.query(Playlist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="歌单不存在")
    db.delete(playlist)
    db.commit()
    return {"ok": True}


@router.post("/{playlist_id}/tracks")
def add_tracks(
    playlist_id: int,
    body: PlaylistTracksAdd,
    db: Session = Depends(get_db),
):
    """向歌单添加曲目（幂等，自动计算 position）。"""
    playlist = db.query(Playlist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="歌单不存在")

    # 获取当前最大 position
    max_pos = (
        db.query(func.max(PlaylistTrack.position))
        .filter(PlaylistTrack.playlist_id == playlist_id)
        .scalar()
        or 0
    )

    existing_ids = {
        e.track_id
        for e in db.query(PlaylistTrack)
        .filter_by(playlist_id=playlist_id)
        .all()
    }

    for tid in body.track_ids:
        if tid not in existing_ids:
            # 验证 track 存在
            track = db.query(Track).filter_by(id=tid).first()
            if not track:
                raise HTTPException(status_code=404, detail=f"曲目 {tid} 不存在")
            max_pos += 1
            db.add(PlaylistTrack(playlist_id=playlist_id, track_id=tid, position=max_pos))

    db.commit()
    return {"ok": True}


@router.delete("/{playlist_id}/tracks/{track_id}")
def remove_track(
    playlist_id: int,
    track_id: int,
    db: Session = Depends(get_db),
):
    """从歌单移除曲目。"""
    entry = (
        db.query(PlaylistTrack)
        .filter_by(playlist_id=playlist_id, track_id=track_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="曲目不在歌单中")
    db.delete(entry)
    db.commit()
    return {"ok": True}


@router.patch("/{playlist_id}/tracks/reorder")
def reorder_tracks(
    playlist_id: int,
    body: PlaylistTracksReorder,
    db: Session = Depends(get_db),
):
    """重排序歌单曲目。"""
    playlist = db.query(Playlist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="歌单不存在")

    entries = {
        e.track_id: e
        for e in db.query(PlaylistTrack)
        .filter_by(playlist_id=playlist_id)
        .all()
    }

    for idx, tid in enumerate(body.track_ids, start=1):
        if tid in entries:
            entries[tid].position = idx

    db.commit()
    return {"ok": True}
