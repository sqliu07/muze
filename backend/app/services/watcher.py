"""watchdog 文件夹监听服务。"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Callable, Coroutine, Any

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent

from app.core.config import SUPPORTED_FORMATS

logger = logging.getLogger(__name__)

BroadcastFn = Callable[[dict], Coroutine[Any, Any, None]]

_observer: Observer | None = None


class MusicEventHandler(FileSystemEventHandler):
    """监听音频文件的创建和删除，通过 WebSocket 广播通知。"""

    def __init__(self, loop: asyncio.AbstractEventLoop, broadcast_fn: BroadcastFn) -> None:
        super().__init__()
        self._loop = loop
        self._broadcast = broadcast_fn

    def _is_supported(self, path: str) -> bool:
        return Path(path).suffix.lower() in SUPPORTED_FORMATS

    def on_created(self, event: FileSystemEvent) -> None:
        if event.is_directory or not self._is_supported(event.src_path):
            return
        logger.info("新文件: %s", event.src_path)
        coro = self._broadcast({"type": "file_added", "data": {"path": event.src_path}})
        asyncio.run_coroutine_threadsafe(coro, self._loop)

    def on_deleted(self, event: FileSystemEvent) -> None:
        if event.is_directory or not self._is_supported(event.src_path):
            return
        logger.info("文件删除: %s", event.src_path)
        coro = self._broadcast({"type": "file_removed", "data": {"path": event.src_path}})
        asyncio.run_coroutine_threadsafe(coro, self._loop)


def start_watcher(
    paths: list[str],
    loop: asyncio.AbstractEventLoop,
    broadcast_fn: BroadcastFn,
) -> Observer:
    """启动文件夹监听，返回 Observer 实例。"""
    global _observer
    if _observer is not None:
        stop_watcher()

    _observer = Observer()
    handler = MusicEventHandler(loop, broadcast_fn)
    for p in paths:
        if Path(p).is_dir():
            _observer.schedule(handler, p, recursive=True)
    _observer.daemon = True
    _observer.start()
    logger.info("文件夹监听已启动: %s", paths)
    return _observer


def stop_watcher() -> None:
    """停止文件夹监听。"""
    global _observer
    if _observer is not None:
        _observer.stop()
        _observer.join(timeout=5)
        _observer = None
        logger.info("文件夹监听已停止")
