"""歌手照片后台守护进程 — 自动获取歌手真实照片。"""
from __future__ import annotations

import hashlib
import logging
import threading
import time
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import ARTIST_IMAGES_DIR
from app.core.database import SessionLocal
from app.models.models import Artist
from app.services.artist_image_service import fetch_artist_image

logger = logging.getLogger(__name__)

_SEARCH_INTERVAL = 300  # 5 分钟检查一次
_BATCH_LIMIT = 10  # 每批处理的歌手数量
_REQUEST_DELAY = 2.0  # 每次请求之间的延迟（秒）

# 全局状态，用于通知前端
_fetch_status = {
    "running": False,
    "total": 0,
    "processed": 0,
    "success": 0,
    "failed": 0,
    "current_artist": None,
}
_status_lock = threading.Lock()


def _get_artist_image_path(artist_name: str) -> Path | None:
    """检查歌手照片是否已存在。"""
    name_hash = hashlib.md5(artist_name.encode("utf-8")).hexdigest()[:12]
    image_path = ARTIST_IMAGES_DIR / f"{name_hash}.jpg"
    return image_path if image_path.exists() else None


def get_fetch_status() -> dict:
    """获取当前获取状态。"""
    with _status_lock:
        return _fetch_status.copy()


def _update_status(**kwargs):
    """更新状态。"""
    with _status_lock:
        _fetch_status.update(kwargs)


def batch_fetch_artist_images(db: Session, limit: int = _BATCH_LIMIT) -> int:
    """批量获取歌手照片，返回成功获取数。"""
    # 查找没有照片的歌手
    artists = db.query(Artist).all()
    candidates = []
    for artist in artists:
        if not _get_artist_image_path(artist.name):
            candidates.append(artist)
        if len(candidates) >= limit:
            break

    if not candidates:
        return 0

    _update_status(
        running=True,
        total=len(candidates),
        processed=0,
        success=0,
        failed=0,
    )

    updated = 0
    for i, artist in enumerate(candidates):
        _update_status(
            processed=i + 1,
            current_artist=artist.name,
        )

        try:
            image_path = fetch_artist_image(artist.name)
            if image_path:
                updated += 1
                _update_status(success=_fetch_status["success"] + 1)
                logger.info("已获取歌手照片: %s", artist.name)
            else:
                _update_status(failed=_fetch_status["failed"] + 1)
                logger.debug("未找到歌手照片: %s", artist.name)
        except Exception:
            _update_status(failed=_fetch_status["failed"] + 1)
            logger.exception("获取歌手照片失败: %s", artist.name)

        time.sleep(_REQUEST_DELAY)

    _update_status(running=False, current_artist=None)
    return updated


def _daemon_loop():
    """守护进程主循环。"""
    while True:
        time.sleep(_SEARCH_INTERVAL)
        db = SessionLocal()
        try:
            count = batch_fetch_artist_images(db)
            if count:
                logger.info("歌手照片守护进程：本轮获取 %d 张歌手照片", count)
        except Exception:
            logger.exception("歌手照片守护进程异常")
        finally:
            db.close()


def start_artist_image_daemon() -> threading.Thread | None:
    """启动歌手照片守护线程（daemon=True）。"""
    thread = threading.Thread(target=_daemon_loop, name="artist-image-daemon", daemon=True)
    thread.start()
    logger.info("歌手照片守护进程已启动（间隔 %d 秒）", _SEARCH_INTERVAL)
    return thread


def trigger_fetch_now(db: Session) -> dict:
    """立即触发一次歌手照片获取（同步）。"""
    count = batch_fetch_artist_images(db)
    return {
        "success": count,
        "total": _fetch_status.get("total", 0),
        "failed": _fetch_status.get("failed", 0),
    }
