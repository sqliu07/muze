"""歌词 API — 获取、搜索、保存歌词。"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Lyrics, LyricsSearchCache, Track
from app.schemas.schemas import LyricsCandidateOut, LyricsOut, LyricsSearch, LyricsUpdate
from app.services.lyrics_service import (
    LyricsResult,
    get_lyrics,
    has_word_level_timestamps,
    is_mostly_cjk_lyrics,
    search_lddc_candidates,
    search_online_lyrics,
    translate_lyrics,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lyrics", tags=["lyrics"])
_WHITESPACE_RE = re.compile(r"\s+")
_ENGLISH_RE = re.compile(r"[a-zA-Z]+")  # 连续英文字母


class LyricsOffsetUpdate(BaseModel):
    # Positive values delay display; zero restores the source timing.
    offset_ms: int = Field(strict=True, ge=-30_000, le=30_000)


def _is_likely_english(text: str) -> bool:
    """粗略判断歌词是否为英文（英文字符占比 > 30%）。"""
    if not text:
        return False
    # 取前 500 字符采样
    sample = text[:500]
    en_chars = sum(len(m) for m in _ENGLISH_RE.findall(sample))
    # 去掉时间戳后的纯文本长度
    clean = re.sub(r"\[[\d:.]+\]", "", sample)
    total = max(1, len(clean.strip()))
    return en_chars / total > 0.3


def _background_translate(track_id: int, content: str) -> None:
    """后台翻译歌词并保存。"""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        translated = translate_lyrics(content)
        if not translated:
            return
        lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
        if lyrics and not lyrics.translated_content:
            lyrics.translated_content = translated
            db.commit()
            logger.info("后台翻译完成: track_id=%d", track_id)
    except Exception:
        logger.exception("后台翻译失败: track_id=%d", track_id)
    finally:
        db.close()


def _save_lyrics(
    db: Session,
    track_id: int,
    result: LyricsResult,
    *,
    preserve_original: bool = True,
) -> Lyrics:
    """保存或更新歌词。preserve_original=True 时保留 original_* 字段。"""
    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if lyrics:
        lyrics.content = result.content
        lyrics.source = result.source
        lyrics.synced = result.synced
        lyrics.translated_content = result.translated_content
        # 仅在不保留且来源为本地文件时才覆盖 original_* 字段
        if not preserve_original and result.source in ("embedded", "lrc"):
            lyrics.original_content = result.content
            lyrics.original_source = result.source
    else:
        lyrics = Lyrics(
            track_id=track_id,
            content=result.content,
            source=result.source,
            synced=result.synced,
            translated_content=result.translated_content,
        )
        if result.source in ("embedded", "lrc"):
            lyrics.original_content = result.content
            lyrics.original_source = result.source
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
        if result.translated_content:
            cache.translated_content = result.translated_content
    else:
        cache = LyricsSearchCache(
            query_title=query_title,
            query_artist=query_artist,
            content=result.content,
            source=result.source,
            synced=result.synced,
            translated_content=result.translated_content,
        )
        db.add(cache)
    db.commit()


@router.get("/status")
def lyrics_search_status(db: Session = Depends(get_db)):
    """返回逐字歌词搜索进度统计。"""
    total = db.query(Lyrics).count()
    synced_count = db.query(Lyrics).filter(Lyrics.synced == True).count()
    has_original = db.query(Lyrics).filter(
        Lyrics.original_content != None
    ).count()
    return {
        "total": total,
        "synced": synced_count,
        "pending": total - synced_count,
        "has_original": has_original,
    }


@router.get("/{track_id}", response_model=LyricsOut)
def get_track_lyrics(track_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """获取歌词。有缓存则返回，无则自动获取并保存。"""
    track = _get_track_or_404(track_id, db)

    # 已有缓存
    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if lyrics and lyrics.content:
        if lyrics.translated_content and is_mostly_cjk_lyrics(lyrics.content):
            lyrics.translated_content = None
            db.commit()
            db.refresh(lyrics)
        # 英文歌词无翻译时，后台自动触发翻译
        if (
            not lyrics.translated_content
            and not is_mostly_cjk_lyrics(lyrics.content)
            and _is_likely_english(lyrics.content)
        ):
            background_tasks.add_task(_background_translate, track_id, lyrics.content)
        return lyrics

    # 自动获取
    artist_name = track.artist.name if track.artist else None
    result = get_lyrics(track.file_path, track.title, artist_name, track.duration)
    if result:
        lyrics = _save_lyrics(db, track_id, result)
        return lyrics

    raise HTTPException(status_code=404, detail="未找到歌词")


@router.put("/{track_id}/offset", response_model=LyricsOut)
def update_lyrics_offset(
    track_id: int,
    body: LyricsOffsetUpdate,
    db: Session = Depends(get_db),
):
    """保存曲目的显示偏移（毫秒），保留原始和翻译歌词时间戳。"""
    _get_track_or_404(track_id, db)
    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if not lyrics or not lyrics.content:
        raise HTTPException(status_code=404, detail="未找到歌词")
    lyrics.offset_ms = body.offset_ms
    db.commit()
    db.refresh(lyrics)
    return lyrics


@router.post("/{track_id}/search", response_model=LyricsOut)
def search_track_lyrics(
    track_id: int,
    body: LyricsSearch,
    refresh: bool = False,
    allow_unsynced: bool = False,
    db: Session = Depends(get_db),
):
    """按指定 title/artist 进行联网搜索歌词。"""
    track = _get_track_or_404(track_id, db)
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
            translated_content=cached.translated_content,
        )
    else:
        result = search_online_lyrics(body.title, body.artist, track.duration)
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
        # 覆盖前自动备份原始歌词
        existing = db.query(Lyrics).filter_by(track_id=track_id).first()
        if existing and not existing.original_content and existing.source in ("embedded", "lrc"):
            existing.original_content = existing.content
            existing.original_source = existing.source
            db.commit()
        return _save_lyrics(db, track_id, result)

    raise HTTPException(status_code=404, detail="未找到歌词")


@router.post("/{track_id}/search/lddc-candidates", response_model=list[LyricsCandidateOut])
def search_track_lyrics_lddc_candidates(
    track_id: int,
    body: LyricsSearch,
    limit: int = Query(8, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """返回 LDDC 候选歌词，供前端二次确认。"""
    track = _get_track_or_404(track_id, db)
    if not _normalize_query_text(body.title):
        raise HTTPException(status_code=422, detail="title 不能为空")

    candidates = search_lddc_candidates(
        body.title,
        body.artist,
        limit=limit,
        duration_seconds=track.duration,
    )
    return [
        {
            "source": c.source,
            "synced": c.synced,
            "word_level": has_word_level_timestamps(c.content),
            "preview": (c.content or "")[:240],
            "content": c.content,
            "translated_content": c.translated_content,
            "song_title": c.song_title,
            "song_artist": c.song_artist,
            "duration_seconds": c.duration_seconds,
        }
        for c in candidates
    ]


@router.put("/{track_id}", response_model=LyricsOut)
def update_track_lyrics(
    track_id: int, body: LyricsUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    """手动保存歌词内容。"""
    _get_track_or_404(track_id, db)

    src = body.source or "manual"
    is_synced = bool(body.synced) if body.synced is not None else False

    # 覆盖前自动备份原始歌词
    existing = db.query(Lyrics).filter_by(track_id=track_id).first()
    if existing and not existing.original_content and existing.source in ("embedded", "lrc"):
        existing.original_content = existing.content
        existing.original_source = existing.source
        db.commit()

    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if lyrics:
        lyrics.content = body.content
        lyrics.source = src
        lyrics.synced = is_synced
        lyrics.translated_content = None
        if body.translated_content and not is_mostly_cjk_lyrics(body.content):
            lyrics.translated_content = body.translated_content
    else:
        lyrics = Lyrics(
            track_id=track_id,
            content=body.content,
            source=src,
            synced=is_synced,
            translated_content=(
                body.translated_content
                if body.translated_content and not is_mostly_cjk_lyrics(body.content)
                else None
            ),
        )
        db.add(lyrics)
    db.commit()
    db.refresh(lyrics)

    # 英文歌词无翻译时，后台自动触发翻译
    if (
        not lyrics.translated_content
        and not is_mostly_cjk_lyrics(lyrics.content)
        and _is_likely_english(lyrics.content)
    ):
        background_tasks.add_task(_background_translate, track_id, lyrics.content)

    return lyrics


@router.post("/{track_id}/restore", response_model=LyricsOut)
def restore_original_lyrics(track_id: int, db: Session = Depends(get_db)):
    """恢复到原始歌词（内嵌/lrc）。"""
    _get_track_or_404(track_id, db)
    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if not lyrics or not lyrics.original_content:
        raise HTTPException(status_code=404, detail="没有可恢复的原始歌词")

    lyrics.content = lyrics.original_content
    lyrics.source = lyrics.original_source or "embedded"
    # 检测内容是否包含 LRC 时间戳（无论来源是 embedded 还是 lrc）
    lyrics.synced = bool(
        lyrics.original_content
        and re.search(r"\[\d{1,2}:\d{2}", lyrics.original_content)
    )
    db.commit()
    db.refresh(lyrics)
    return lyrics


@router.post("/{track_id}/translate", response_model=LyricsOut)
def translate_track_lyrics(track_id: int, force: bool = False, db: Session = Depends(get_db)):
    """触发歌词翻译并返回结果（同步等待完成）。force=true 时强制重新翻译。"""
    _get_track_or_404(track_id, db)
    lyrics = db.query(Lyrics).filter_by(track_id=track_id).first()
    if not lyrics or not lyrics.content:
        raise HTTPException(status_code=404, detail="没有歌词可翻译")
    if lyrics.translated_content and not force:
        return lyrics

    translated = translate_lyrics(lyrics.content)
    if not translated:
        raise HTTPException(status_code=500, detail="翻译失败")

    lyrics.translated_content = translated
    db.commit()
    db.refresh(lyrics)
    return lyrics
