"""Muze API — FastAPI 应用入口。"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import setup_logging
from app.core.database import Base, engine
from app.models import models  # noqa: F401 — 注册所有模型

setup_logging()
logger = logging.getLogger(__name__)

from app.api.library import router as library_router
from app.api.tracks import router as tracks_router
from app.api.albums import router as albums_router
from app.api.artists import router as artists_router
from app.api.playlists import router as playlists_router
from app.api.favorites import router as favorites_router
from app.api.ws import router as ws_router
from app.api.lyrics import router as lyrics_router

from app.api.ws import manager
from app.services.watcher import start_watcher, stop_watcher

Base.metadata.create_all(bind=engine)


def _migrate_schema() -> None:
    """给已有表补缺列（SQLite ALTER TABLE ADD COLUMN 幂等）。"""
    import sqlalchemy as sa

    migrations = [
        ("lyrics", "original_content", "TEXT"),
        ("lyrics", "original_source", "VARCHAR(20)"),
    ]

    with engine.begin() as conn:
        for table, column, col_type in migrations:
            try:
                conn.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                logger.info("迁移: 已添加 %s.%s (%s)", table, column, col_type)
            except Exception:
                # 列已存在则忽略
                pass


_migrate_schema()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 启动时：恢复活跃目录的文件夹监听
    from app.core.database import SessionLocal
    from app.models.models import WatchFolder

    db = SessionLocal()
    try:
        folders = db.query(WatchFolder).filter_by(active=True).all()
        paths = [f.path for f in folders]
    finally:
        db.close()

    loop = asyncio.get_running_loop()
    if paths:
        start_watcher(paths, loop, manager.broadcast)

    # 启动歌词守护进程
    from app.services.lyrics_daemon import start_lyrics_daemon
    start_lyrics_daemon()

    yield

    # 关闭时：停止监听
    stop_watcher()


app = FastAPI(title="Muze API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(library_router)
app.include_router(tracks_router)
app.include_router(albums_router)
app.include_router(artists_router)
app.include_router(playlists_router)
app.include_router(favorites_router)
app.include_router(ws_router)
app.include_router(lyrics_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---- 静态文件托管（Docker 生产构建） ----
STATIC_DIR = Path(__file__).parent / "static"

if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    # 公共根目录文件（favicon、manifest 等）
    _KNOWN_STATIC = {p.name for p in STATIC_DIR.iterdir() if p.is_file()}

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str, request: Request):
        """静态文件优先，其余返回 index.html（SPA fallback）。"""
        if full_path in _KNOWN_STATIC:
            return FileResponse(STATIC_DIR / full_path)
        return FileResponse(STATIC_DIR / "index.html")
