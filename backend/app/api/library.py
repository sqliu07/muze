"""Library API — 文件夹管理、扫描、刷新、清空。"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import BASE_DIR, COVERS_DIR, DATA_DIR, LOGS_DIR
from app.core.database import get_db
from app.models.models import (
    Album,
    Artist,
    Favorite,
    Lyrics,
    PlaylistTrack,
    Track,
    WatchFolder,
)
from app.schemas.schemas import (
    BatchFolderAdd,
    BrowseEntry,
    BrowseResult,
    FolderAdd,
    ScanRequest,
    ScanResult,
    WatchFolderOut,
)
from app.services.scanner import normalize_artist_entities, scan_directory

router = APIRouter(prefix="/api/library", tags=["library"])

MUSIC_DIR = os.environ.get("MUSIC_DIR", "/music")


def is_safe_watch_path(path: str) -> bool:
    """Reject internal roots, their descendants, and roots containing them.

    Resolve symlinks and compare path components so /music and /classical are
    independent of /app, and similarly named siblings remain usable.
    """
    try:
        target = Path(path).resolve()
        for internal in (BASE_DIR, DATA_DIR, LOGS_DIR):
            root = Path(internal).resolve()
            if target.is_relative_to(root) or root.is_relative_to(target):
                return False
        return True
    except (OSError, RuntimeError, ValueError):
        return False


def _validate_watch_path(path: str) -> None:
    if not is_safe_watch_path(path):
        raise HTTPException(status_code=400, detail="不能将应用、数据或日志目录及其父目录用于媒体库")
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="目录不存在")


@router.get("/browse", response_model=BrowseResult)
def browse_directories(path: str | None = None):
    """浏览服务器目录结构（仅列出子目录）。"""
    if path is None:
        path = os.path.expanduser("~")
    target = os.path.realpath(path)

    # 安全检查：防止路径遍历
    if not os.path.isdir(target):
        raise HTTPException(status_code=400, detail="目录不存在")

    entries = []
    try:
        for name in sorted(os.listdir(target)):
            full = os.path.join(target, name)
            if os.path.isdir(full) and not name.startswith("."):
                entries.append(BrowseEntry(name=name, path=full))
    except PermissionError:
        raise HTTPException(status_code=403, detail="无权访问该目录")

    parent = os.path.dirname(target) if target != "/" else None
    return BrowseResult(path=target, parent=parent, entries=entries)


@router.post("/folders", response_model=WatchFolderOut)
def add_watch_folder(body: FolderAdd, db: Session = Depends(get_db)):
    """添加监听目录（验证目录存在，幂等）。"""
    _validate_watch_path(body.path)

    folder = db.query(WatchFolder).filter_by(path=body.path).first()
    if folder:
        if not folder.active:
            folder.active = True
            db.commit()
            db.refresh(folder)
        return folder

    folder = WatchFolder(path=body.path)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.post("/folders/batch", response_model=list[WatchFolderOut])
def add_watch_folders_batch(body: BatchFolderAdd, db: Session = Depends(get_db)):
    """批量添加监听目录。"""
    results = []
    for path in body.paths:
        if not is_safe_watch_path(path) or not os.path.isdir(path):
            continue
        folder = db.query(WatchFolder).filter_by(path=path).first()
        if folder:
            if not folder.active:
                folder.active = True
                db.commit()
                db.refresh(folder)
        else:
            folder = WatchFolder(path=path)
            db.add(folder)
            db.commit()
            db.refresh(folder)
        results.append(folder)
    return results


@router.get("/folders", response_model=list[WatchFolderOut])
def list_watch_folders(db: Session = Depends(get_db)):
    """列出活跃的监听目录。"""
    folders = db.query(WatchFolder).filter_by(active=True).all()
    return folders


@router.delete("/folders/{folder_id}")
def remove_watch_folder(folder_id: int, db: Session = Depends(get_db)):
    """删除目录及其扫描的歌曲。"""
    folder = db.query(WatchFolder).filter_by(id=folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="目录不存在")

    prefix = folder.path.rstrip(os.sep) + os.sep
    track_ids = [
        t.id for t in db.query(Track)
        .filter(Track.file_path.startswith(prefix))
        .all()
    ]

    if track_ids:
        db.query(Favorite).filter(Favorite.track_id.in_(track_ids)).delete(synchronize_session=False)
        db.query(PlaylistTrack).filter(PlaylistTrack.track_id.in_(track_ids)).delete(synchronize_session=False)
        db.query(Lyrics).filter(Lyrics.track_id.in_(track_ids)).delete(synchronize_session=False)
        db.query(Track).filter(Track.id.in_(track_ids)).delete(synchronize_session=False)

    # 清理无歌曲的专辑和歌手
    empty_album_ids = [
        a.id for a in db.query(Album)
        .filter(~db.query(Track).filter(Track.album_id == Album.id).exists())
        .all()
    ]
    if empty_album_ids:
        db.query(Album).filter(Album.id.in_(empty_album_ids)).delete(synchronize_session=False)

    empty_artist_ids = [
        a.id for a in db.query(Artist)
        .filter(~db.query(Track).filter(Track.artist_id == Artist.id).exists())
        .all()
    ]
    if empty_artist_ids:
        db.query(Artist).filter(Artist.id.in_(empty_artist_ids)).delete(synchronize_session=False)

    db.delete(folder)
    db.commit()
    return {"ok": True, "removed_tracks": len(track_ids)}


@router.post("/scan", response_model=ScanResult)
def scan_folder(body: ScanRequest, db: Session = Depends(get_db)):
    """扫描单个目录。"""
    _validate_watch_path(body.path)

    # 路径白名单校验：扫描路径必须与某个 active WatchFolder 存在前缀关系
    scan_path = os.path.realpath(body.path)
    active_folders = db.query(WatchFolder).filter_by(active=True).all()
    matched_folder = None
    for folder in active_folders:
        if not is_safe_watch_path(folder.path):
            continue
        folder_path = os.path.realpath(folder.path)
        # 双向前缀匹配：精确匹配、子目录扫描、父目录扫描
        if scan_path == folder_path or scan_path.startswith(folder_path + os.sep) or folder_path.startswith(scan_path + os.sep):
            matched_folder = folder
            break
    if not matched_folder:
        raise HTTPException(status_code=403, detail="请先将该目录添加到媒体库")

    covers_dir = str(COVERS_DIR)
    result = scan_directory(body.path, db, covers_dir)

    # 更新 last_scanned
    matched_folder.last_scanned = datetime.now(timezone.utc)
    db.commit()

    return result


@router.post("/refresh", response_model=ScanResult)
def refresh_all(db: Session = Depends(get_db)):
    """刷新所有活跃目录。"""
    folders = db.query(WatchFolder).filter_by(active=True).all()
    total_added = 0
    total_updated = 0
    total_errors = 0
    covers_dir = str(COVERS_DIR)

    for folder in folders:
        if not is_safe_watch_path(folder.path):
            total_errors += 1
            continue
        result = scan_directory(folder.path, db, covers_dir)
        total_added += result["added"]
        total_updated += result["updated"]
        total_errors += result["errors"]
        folder.last_scanned = datetime.now(timezone.utc)

    db.commit()
    return {"added": total_added, "updated": total_updated, "errors": total_errors}


@router.delete("/clear")
def clear_library(db: Session = Depends(get_db)):
    """清空全部数据。按外键依赖顺序删除。"""
    db.query(Favorite).delete()
    db.query(PlaylistTrack).delete()
    db.query(Lyrics).delete()
    db.query(Track).delete()
    db.query(Album).delete()
    db.query(Artist).delete()
    db.commit()
    return {"ok": True}


@router.get("/logs")
def get_logs(lines: int = 200):
    """读取最近 N 行日志。"""
    log_file = LOGS_DIR / "muze.log"
    if not log_file.exists():
        return {"lines": []}
    all_lines = log_file.read_text(encoding="utf-8").splitlines()
    return {"lines": all_lines[-lines:]}


@router.post("/normalize-artists")
def normalize_artists(write_tags: bool = False, db: Session = Depends(get_db)):
    """合并重复歌手；可选写回规范化 artist TAG（需启用环境变量）。"""
    result = normalize_artist_entities(db, write_tags=write_tags)
    return result
