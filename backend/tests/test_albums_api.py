"""Albums API 测试。"""
import subprocess
import sys

from app.api import albums as albums_api
from app.models.models import Album, Artist, Track
from tests.conftest import *  # noqa: F401,F403


def test_list_albums_empty(client):
    """GET /api/albums 空列表返回 200 + []。"""
    resp = client.get("/api/albums")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_album_not_found(client):
    """GET /api/albums/9999 返回 404。"""
    resp = client.get("/api/albums/9999")
    assert resp.status_code == 404


def test_related_artist_album_track_serialization_does_not_crash():
    """API 响应所依赖的关联序列化不应卡死或崩溃。"""
    script = r"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, 'backend')

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.models import Album, Artist, Track
from app.schemas.schemas import AlbumOut, ArtistOut, TrackOut

with tempfile.TemporaryDirectory() as d:
    db_path = Path(d) / 'test.db'
    engine = create_engine(
        f'sqlite:///{db_path}',
        connect_args={'check_same_thread': False},
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    artist = Artist(name='A')
    db.add(artist)
    db.flush()
    album = Album(title='AL', artist_id=artist.id)
    db.add(album)
    db.flush()
    track = Track(
        file_path=str(Path(d) / 'song.mp3'),
        title='T',
        duration=1.0,
        format='mp3',
        artist_id=artist.id,
        album_id=album.id,
    )
    db.add(track)
    db.commit()
    db.refresh(artist)
    db.refresh(album)
    db.refresh(track)

    artist_data = ArtistOut.from_orm(artist).dict()
    album_data = AlbumOut.from_orm(album).dict()
    track_data = TrackOut.from_orm(track).dict()

    assert artist_data['id'] == artist.id
    assert album_data['artist']['id'] == artist.id
    assert track_data['album']['artist']['id'] == artist.id
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        timeout=5,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_album_tracks_fallback_sort_by_filename_when_track_number_missing(db_session):
    artist = Artist(name="周杰伦")
    db_session.add(artist)
    db_session.flush()
    album = Album(title="范特西", artist_id=artist.id)
    db_session.add(album)
    db_session.flush()

    t1 = Track(
        file_path="/music/album/02-上海1943.mp3",
        title="上海1943",
        artist_id=artist.id,
        album_id=album.id,
        duration=200,
        format="mp3",
        track_number=None,
        disc_number=1,
    )
    t2 = Track(
        file_path="/music/album/01-爱在西元前.mp3",
        title="爱在西元前",
        artist_id=artist.id,
        album_id=album.id,
        duration=200,
        format="mp3",
        track_number=None,
        disc_number=1,
    )
    db_session.add_all([t1, t2])
    db_session.commit()

    result = albums_api.get_album(album.id, db_session)
    names = [t["title"] for t in result["tracks"]]
    assert names == ["爱在西元前", "上海1943"]


def test_album_cover_candidates_and_apply_selected(db_session, tmp_path, monkeypatch):
    import app.api.albums as albums_module
    import app.services.cover_service as cover_service

    artist = Artist(name="周杰伦")
    db_session.add(artist)
    db_session.flush()
    album = Album(title="范特西", artist_id=artist.id)
    db_session.add(album)
    db_session.flush()
    track = Track(
        file_path="/music/album/01-爱在西元前.mp3",
        title="爱在西元前",
        artist_id=artist.id,
        album_id=album.id,
        duration=200,
        format="mp3",
    )
    db_session.add(track)
    db_session.commit()

    cover_bytes = (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00\x01\x00\x01"
        b"\x00\x00\xff\xd9"
    )
    monkeypatch.setattr(albums_module, "COVERS_DIR", tmp_path / "covers")
    monkeypatch.setattr(
        cover_service,
        "search_album_cover_candidates",
        lambda *_args, **_kwargs: [
            cover_service.CoverCandidate(
                image_url="https://example.test/fantasy.jpg",
                thumbnail_url="https://example.test/fantasy-thumb.jpg",
                album_title="范特西",
                artist_name="周杰伦",
            )
        ],
    )
    monkeypatch.setattr(
        cover_service,
        "fetch_cover_image_url",
        lambda *_args, **_kwargs: cover_bytes,
    )

    candidates = albums_api.search_album_cover_candidates_api(
        album.id,
        body=albums_api.AlbumCoverSearch(title="范特西", artist="周杰伦"),
        db=db_session,
    )
    assert candidates[0]["thumbnail_url"] == "https://example.test/fantasy-thumb.jpg"

    result = albums_api.apply_album_cover(
        album.id,
        body=albums_api.AlbumCoverApply(
            image_url="https://example.test/fantasy.jpg"
        ),
        db=db_session,
    )

    assert result["cover_path"] is not None
    db_session.refresh(track)
    assert track.has_cover is True
