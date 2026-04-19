"""歌词 API — 获取、搜索、保存歌词。"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Lyrics, LyricsSearchCache, Track
from app.schemas.schemas import LyricsOut, LyricsSearch, LyricsUpdate
from app.services.lyrics_service import (
    LyricsResult,
    get_lyrics,
    has_word_level_timestamps,
    search_online_lyrics,
)

router = APIRouter(prefix="/api/lyrics", tags=["lyrics"])
_WHITESPACE_RE = re.compile(r"\s+")


def _save_lyrics(
    db: Session, track_id: int, result: LyricsResult
) -> Lyrics:
    """将 LyricsResult 保存或更新到数据库。"""
    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if lyrics:
        lyrics.content = result.content
        lyrics.source = result.source
        lyrics.synced = result.synced
    else:
        lyrics = Lyrics(
            track_id=track_id,
            content=result.content,
            source=result.source,
            synced=result.synced,
        )
        db.add(lyrics)
    db.commit()
    db.refresh(lyrics)
    return lyrics


def _get_track_or_404(track_id: int, db: Session) -> Track:
    track = db.query(Track).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="曲目不存在")
    return track


def _normalize_query_text(value: str | None) -> str:
    if not value:
        return ""
    return _WHITESPACE_RE.sub(" ", value).strip().lower()


def _save_search_cache(
    db: Session,
    query_title: str,
    query_artist: str,
    result: LyricsResult,
) -> None:
    cache = (
        db.query(LyricsSearchCache)
        .filter_by(query_title=query_title, query_artist=query_artist)
        .first()
    )
    if cache:
        cache.content = result.content
        cache.source = result.source
        cache.synced = result.synced
    else:
        cache = LyricsSearchCache(
            query_title=query_title,
            query_artist=query_artist,
            content=result.content,
            source=result.source,
            synced=result.synced,
        )
        db.add(cache)
    db.commit()


@router.get("/{track_id}", response_model=LyricsOut)
def get_track_lyrics(track_id: int, db: Session = Depends(get_db)):
    """获取歌词。有缓存则返回，无则自动获取并保存。"""
    track = _get_track_or_404(track_id, db)

    # 已有缓存
    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if lyrics and lyrics.content:
        return lyrics

    # 自动获取
    artist_name = track.artist.name if track.artist else None
    result = get_lyrics(track.file_path, track.title, artist_name)
    if result:
        lyrics = _save_lyrics(db, track_id, result)
        return lyrics

    raise HTTPException(status_code=404, detail="未找到歌词")


@router.post("/{track_id}/search", response_model=LyricsOut)
def search_track_lyrics(
    track_id: int,
    body: LyricsSearch,
    refresh: bool = Query(False),
    allow_unsynced: bool = Query(False),
    db: Session = Depends(get_db),
):
    """按指定 title/artist 进行联网搜索歌词。"""
    _get_track_or_404(track_id, db)
    query_title = _normalize_query_text(body.title)
    query_artist = _normalize_query_text(body.artist)
    if not query_title:
        raise HTTPException(status_code=422, detail="title 不能为空")

    cached = (
        db.query(LyricsSearchCache)
        .filter_by(query_title=query_title, query_artist=query_artist)
        .first()
    )
    if (not refresh) and cached and cached.content:
        result = LyricsResult(
            content=cached.content,
            source=cached.source or "cache",
            synced=cached.synced,
        )
    else:
        result = search_online_lyrics(body.title, body.artist)
        if result:
            _save_search_cache(db, query_title, query_artist, result)

    if result:
        if (not allow_unsynced) and (not result.synced or not has_word_level_timestamps(result.content)):
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "找到歌词，但不是逐字歌词，未自动替换。",
                    "source": result.source,
                    "synced": result.synced,
                    "preview": (result.content or "")[:240],
                },
            )
        return _save_lyrics(db, track_id, result)

    raise HTTPException(status_code=404, detail="未找到歌词")


@router.put("/{track_id}", response_model=LyricsOut)
def update_track_lyrics(
    track_id: int, body: LyricsUpdate, db: Session = Depends(get_db)
):
    """手动保存歌词内容。"""
    _get_track_or_404(track_id, db)

    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if lyrics:
        lyrics.content = body.content
        lyrics.source = "manual"
        lyrics.synced = False
    else:
        lyrics = Lyrics(
            track_id=track_id,
            content=body.content,
            source="manual",
            synced=False,
        )
        db.add(lyrics)
    db.commit()
    db.refresh(lyrics)
    return lyrics
