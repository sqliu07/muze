import pytest
from pydantic import ValidationError

from app.api import lyrics as lyrics_api
from app.models.models import Artist, Lyrics, Track
from app.schemas.schemas import LyricsSearch
from app.services.lyrics_service import LyricsResult


def test_search_track_lyrics_uses_query_cache(db_session, monkeypatch):
    artist = Artist(name="周杰伦")
    db_session.add(artist)
    db_session.flush()

    track1 = Track(
        file_path="/tmp/song-1.mp3",
        title="娘子",
        artist_id=artist.id,
        duration=240.0,
        format="mp3",
    )
    track2 = Track(
        file_path="/tmp/song-2.mp3",
        title="完美主义",
        artist_id=artist.id,
        duration=240.0,
        format="mp3",
    )
    db_session.add_all([track1, track2])
    db_session.commit()
    db_session.refresh(track1)
    db_session.refresh(track2)

    calls = {"count": 0}

    def fake_search_online_lyrics(
        title: str,
        artist_name: str | None = None,
        duration_seconds: float | None = None,
    ):
        calls["count"] += 1
        assert duration_seconds == 240.0
        return LyricsResult(
            content="[00:01.00]你[00:01.20]好[00:01.40]啊",
            source="fake",
            synced=True,
        )

    monkeypatch.setattr(lyrics_api, "search_online_lyrics", fake_search_online_lyrics)

    payload = LyricsSearch(title="娘子", artist="周杰伦")

    first = lyrics_api.search_track_lyrics(track1.id, payload, db=db_session)
    second = lyrics_api.search_track_lyrics(track2.id, payload, db=db_session)

    assert first.content == second.content
    assert calls["count"] == 1


def test_get_track_lyrics_clears_stale_translation_for_chinese_cached_lyrics(db_session):
    artist = Artist(name="周杰伦")
    db_session.add(artist)
    db_session.flush()

    track = Track(
        file_path="/tmp/niangzi.mp3",
        title="娘子",
        artist_id=artist.id,
        duration=240.0,
        format="mp3",
    )
    db_session.add(track)
    db_session.flush()

    lyrics = Lyrics(
        track_id=track.id,
        content=(
            "[ar:Jay Chou]\n[al:Fantasy]\n[by:LDDC]\n"
            "[00:01.00]娘子\n[00:02.00]她人在江南等我"
        ),
        source="lddc:ne",
        synced=True,
        translated_content="[00:01.00]Lady\n[00:02.00]She waits for me",
    )
    db_session.add(lyrics)
    db_session.commit()

    class _BackgroundTasks:
        def add_task(self, *_args, **_kwargs):
            raise AssertionError("中文歌词不应触发后台翻译")

    result = lyrics_api.get_track_lyrics(
        track.id,
        background_tasks=_BackgroundTasks(),
        db=db_session,
    )

    assert result.translated_content is None
    db_session.refresh(lyrics)
    assert lyrics.translated_content is None


def test_update_lyrics_offset_persists_without_rewriting_content(db_session):
    track = Track(
        file_path="/tmp/offset.mp3",
        title="Offset",
        duration=120.0,
        format="mp3",
    )
    db_session.add(track)
    db_session.flush()
    stored = Lyrics(
        track_id=track.id,
        content="[00:01.00]Hello",
        source="manual",
        synced=True,
    )
    db_session.add(stored)
    db_session.commit()

    result = lyrics_api.update_lyrics_offset(
        track.id,
        lyrics_api.LyricsOffsetUpdate(offset_ms=-750),
        db_session,
    )

    assert result.offset_ms == -750
    assert result.content == "[00:01.00]Hello"
    db_session.refresh(stored)
    assert stored.offset_ms == -750


def test_lyrics_offset_rejects_out_of_range_and_non_integer_values():
    with pytest.raises(ValidationError):
        lyrics_api.LyricsOffsetUpdate(offset_ms=30_001)
    with pytest.raises(ValidationError):
        lyrics_api.LyricsOffsetUpdate(offset_ms=0.5)
