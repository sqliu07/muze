"""歌词后台守护进程 — 自动搜索逐字歌词。"""
from __future__ import annotations

import logging
import threading
import time

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.models import Lyrics, Track
from app.services.lyrics_service import (
    has_word_level_timestamps,
    search_online_lyrics,
)

logger = logging.getLogger(__name__)

_SEARCH_INTERVAL = 900  # 15 minutes
_BATCH_LIMIT = 50
_REQUEST_DELAY = 1.5


def _needs_word_lyrics(lyrics: Lyrics) -> bool:
    """判断该歌词是否需要搜索逐字版本。"""
    if not lyrics.content:
        return True
    if lyrics.synced and has_word_level_timestamps(lyrics.content):
        return False
    return lyrics.source in ("embedded", "lrc", "manual", "netease", "lrclib")


def batch_search_word_lyrics(db: Session, limit: int = _BATCH_LIMIT) -> int:
    """批量搜索逐字歌词，返回成功更新数。"""
    candidates = (
        db.query(Track)
        .join(Lyrics, Lyrics.track_id == Track.id)
        .filter(
            or_(
                Lyrics.synced == False,
                Lyrics.source.in_(["embedded", "lrc", "manual", "netease", "lrclib"]),
            )
        )
        .limit(limit)
        .all()
    )

    updated = 0
    for track in candidates:
        lyrics = db.query(Lyrics).filter_by(track_id=track.id).first()
        if not lyrics or not _needs_word_lyrics(lyrics):
            continue

        artist_name = track.artist.name if track.artist else None
        try:
            result = search_online_lyrics(track.title, artist_name)
        except Exception:
            logger.exception("搜索歌词失败: %s - %s", track.title, artist_name)
            continue

        if not result or not has_word_level_timestamps(result.content):
            continue

        lyrics.content = result.content
        lyrics.source = result.source
        lyrics.synced = result.synced
        updated += 1
        logger.info("已更新逐字歌词: %s - %s (%s)", track.title, artist_name, result.source)

        time.sleep(_REQUEST_DELAY)

    if updated:
        db.commit()

    return updated


def _daemon_loop():
    """守护进程主循环。"""
    while True:
        time.sleep(_SEARCH_INTERVAL)
        db = SessionLocal()
        try:
            count = batch_search_word_lyrics(db)
            if count:
                logger.info("歌词守护进程：本轮更新 %d 首逐字歌词", count)
        except Exception:
            logger.exception("歌词守护进程异常")
        finally:
            db.close()


def start_lyrics_daemon() -> threading.Thread | None:
    """启动歌词守护线程（daemon=True）。"""
    thread = threading.Thread(target=_daemon_loop, name="lyrics-daemon", daemon=True)
    thread.start()
    logger.info("歌词守护进程已启动（间隔 %d 秒）", _SEARCH_INTERVAL)
    return thread
