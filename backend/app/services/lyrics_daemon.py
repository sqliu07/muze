"""歌词后台守护进程 — 自动搜索逐字歌词和翻译。"""
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
    search_lddc_word_lyrics,
    search_online_lyrics,
    search_netease,
    translate_lyrics,
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
            result = search_online_lyrics(track.title, artist_name, track.duration)
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


def _fetch_translation(
    title: str, artist: str | None, source: str | None, content: str | None
) -> str | None:
    """根据歌词来源选择最佳翻译获取策略。

    优先级：LDDC 重取 → 网易云 tlyric → Google Translate 兜底。
    """
    # LDDC 来源：用 LDDC 重新获取（更精确的匹配）
    if source and source.startswith("lddc"):
        try:
            result = search_lddc_word_lyrics(title, artist)
            if result and result.translated_content:
                logger.info("翻译来源: LDDC (%s - %s)", title, artist)
                return result.translated_content
        except Exception:
            logger.debug("LDDC 翻译回填失败: %s - %s", title, artist, exc_info=True)

    # 网易云 tlyric
    try:
        result = search_netease(title, artist)
        if result and result.translated_content:
            logger.info("翻译来源: 网易云 (%s - %s)", title, artist)
            return result.translated_content
    except Exception:
        logger.debug("网易云翻译回填失败: %s - %s", title, artist, exc_info=True)

    # 兜底：用 Google Translate 翻译歌词内容
    if content:
        try:
            translated = translate_lyrics(content)
            if translated:
                logger.info("翻译来源: Google Translate (%s - %s)", title, artist)
                return translated
        except Exception:
            logger.debug("Google Translate 回填失败: %s - %s", title, artist, exc_info=True)

    return None


def batch_backfill_translations(db: Session, limit: int = _BATCH_LIMIT) -> int:
    """批量为缺少翻译的歌词补充翻译，返回成功更新数。"""
    candidates = (
        db.query(Lyrics)
        .filter(
            Lyrics.content != None,
            Lyrics.translated_content == None,
        )
        .limit(limit)
        .all()
    )

    updated = 0
    for lyrics in candidates:
        track = db.query(Track).filter_by(id=lyrics.track_id).first()
        if not track:
            continue

        artist_name = track.artist.name if track.artist else None
        translated = _fetch_translation(track.title, artist_name, lyrics.source, lyrics.content)
        if not translated:
            logger.debug("翻译回填无结果: %s - %s (%s)", track.title, artist_name, lyrics.source)
            continue

        lyrics.translated_content = translated
        updated += 1
        logger.info("已补充翻译: %s - %s (%s)", track.title, artist_name, lyrics.source)

        time.sleep(_REQUEST_DELAY)

    if updated:
        db.commit()

    return updated


def _daemon_loop():
    """守护进程主循环。"""
    while True:
        time.sleep(_SEARCH_INTERVAL)
        try:
            db = SessionLocal()
            try:
                count = batch_search_word_lyrics(db)
                if count:
                    logger.info("歌词守护进程：本轮更新 %d 首逐字歌词", count)
            finally:
                db.close()

            db = SessionLocal()
            try:
                trans_count = batch_backfill_translations(db)
                if trans_count:
                    logger.info("歌词守护进程：本轮补充 %d 首翻译", trans_count)
            finally:
                db.close()
        except Exception:
            logger.exception("歌词守护进程异常")


def start_lyrics_daemon() -> threading.Thread | None:
    """启动歌词守护线程（daemon=True）。"""
    thread = threading.Thread(target=_daemon_loop, name="lyrics-daemon", daemon=True)
    thread.start()
    logger.info("歌词守护进程已启动（间隔 %d 秒）", _SEARCH_INTERVAL)
    return thread
