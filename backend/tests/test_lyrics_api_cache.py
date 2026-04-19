from app.api import lyrics as lyrics_api
from app.models.models import Artist, Track
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

    def fake_search_online_lyrics(title: str, artist_name: str | None = None):
        calls["count"] += 1
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
