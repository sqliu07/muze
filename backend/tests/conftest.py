import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.core.database import Base
from app.models import models  # noqa: F401 — 注册所有模型
from app.api import albums, artists, favorites, library, playlists, tracks
from app.schemas.schemas import (
    FolderAdd,
    PlaylistCreate,
    PlaylistTracksAdd,
    ScanRequest,
    TrackCoverApply,
    TrackCoverSearch,
    TrackUpdate,
)


@pytest.fixture()
def tmp_dir():
    """创建临时目录，yield Path，结束后自动清理。"""
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


@pytest.fixture()
def db_session(tmp_dir: Path):
    """使用临时 SQLite 数据库创建 Session，测试结束后清理。"""
    db_path = tmp_dir / "test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(tmp_dir: Path):
    """使用临时 SQLite 的轻量 API 客户端，避免 TestClient 的线程池调度。"""
    db_path = tmp_dir / "test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    class _Response:
        def __init__(self, data=None, status_code: int = 200):
            self._data = jsonable_encoder(data)
            self.status_code = status_code

        def json(self):
            return self._data

    class _Request:
        def __init__(self, headers: dict | None = None):
            self.headers = headers or {}

    class _Client:
        def _call(self, func, *args, **kwargs):
            db = SessionLocal()
            try:
                return _Response(func(*args, db=db, **kwargs))
            except HTTPException as exc:
                return _Response({"detail": exc.detail}, exc.status_code)
            finally:
                db.close()

        def get(self, url: str):
            parsed = urlparse(url)
            path = parsed.path
            query = {k: v[-1] for k, v in parse_qs(parsed.query).items()}

            if path == "/api/albums":
                return self._call(
                    albums.list_albums,
                    sort=query.get("sort", "title"),
                    order=query.get("order", "asc"),
                    artist_id=int(query["artist_id"]) if "artist_id" in query else None,
                )
            if path.startswith("/api/albums/"):
                return self._call(albums.get_album, int(path.rsplit("/", 1)[-1]))

            if path == "/api/artists":
                return self._call(artists.list_artists)
            if path.startswith("/api/artists/"):
                return self._call(artists.get_artist, int(path.rsplit("/", 1)[-1]))

            if path == "/api/favorites":
                return self._call(favorites.list_favorites)

            if path == "/api/library/folders":
                return self._call(library.list_watch_folders)

            if path == "/api/tracks":
                return self._call(
                    tracks.list_tracks,
                    page=int(query.get("page", 1)),
                    limit=int(query.get("limit", 50)),
                    sort=query.get("sort", "title"),
                    order=query.get("order", "asc"),
                    search=query.get("search"),
                )
            if path.endswith("/stream") and path.startswith("/api/tracks/"):
                track_id = int(path.split("/")[3])
                db = SessionLocal()
                try:
                    result = tracks.stream_track(track_id, _Request(), db)
                    return _Response(None, getattr(result, "status_code", 200))
                except HTTPException as exc:
                    return _Response({"detail": exc.detail}, exc.status_code)
                finally:
                    db.close()
            if path.startswith("/api/tracks/"):
                return self._call(tracks.get_track, int(path.rsplit("/", 1)[-1]))

            if path == "/api/playlists":
                return self._call(playlists.list_playlists)
            if path.startswith("/api/playlists/"):
                return self._call(playlists.get_playlist, int(path.rsplit("/", 1)[-1]))

            raise AssertionError(f"Unhandled GET {url}")

        def post(self, url: str, json: dict | None = None):
            path = urlparse(url).path
            body = json or {}

            if path == "/api/library/folders":
                return self._call(library.add_watch_folder, FolderAdd(**body))
            if path == "/api/library/scan":
                return self._call(library.scan_folder, ScanRequest(**body))

            if path.startswith("/api/favorites/"):
                return self._call(favorites.add_favorite, int(path.rsplit("/", 1)[-1]))

            if path == "/api/playlists":
                return self._call(playlists.create_playlist, PlaylistCreate(**body))
            if path.endswith("/tracks") and path.startswith("/api/playlists/"):
                playlist_id = int(path.split("/")[3])
                return self._call(
                    playlists.add_tracks,
                    playlist_id,
                    PlaylistTracksAdd(**body),
                )

            if path.endswith("/cover/search") and path.startswith("/api/tracks/"):
                track_id = int(path.split("/")[3])
                return self._call(tracks.search_track_cover, track_id)
            if path.endswith("/cover/candidates") and path.startswith("/api/tracks/"):
                track_id = int(path.split("/")[3])
                return self._call(
                    tracks.search_track_cover_candidates,
                    track_id,
                    TrackCoverSearch(**body),
                )
            if path.endswith("/cover") and path.startswith("/api/tracks/"):
                track_id = int(path.split("/")[3])
                return self._call(
                    tracks.apply_track_cover,
                    track_id,
                    TrackCoverApply(**body),
                )

            raise AssertionError(f"Unhandled POST {url}")

        def patch(self, url: str, json: dict | None = None):
            path = urlparse(url).path
            body = json or {}

            if path.startswith("/api/tracks/"):
                return self._call(
                    tracks.update_track,
                    int(path.rsplit("/", 1)[-1]),
                    TrackUpdate(**body),
                )

            raise AssertionError(f"Unhandled PATCH {url}")

        def delete(self, url: str):
            path = urlparse(url).path

            if path == "/api/library/clear":
                return self._call(library.clear_library)
            if path.startswith("/api/library/folders/"):
                return self._call(
                    library.remove_watch_folder,
                    int(path.rsplit("/", 1)[-1]),
                )

            if path.startswith("/api/favorites/"):
                return self._call(favorites.remove_favorite, int(path.rsplit("/", 1)[-1]))

            if path.startswith("/api/playlists/"):
                return self._call(playlists.delete_playlist, int(path.rsplit("/", 1)[-1]))

            raise AssertionError(f"Unhandled DELETE {url}")

    yield _Client()

    Base.metadata.drop_all(bind=engine)
    engine.dispose()
