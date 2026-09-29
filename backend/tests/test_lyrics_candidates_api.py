from app.api import lyrics as lyrics_api
from app.models.models import Artist, Track
from app.schemas.schemas import LyricsSearch
from app.services.lyrics_service import LDDCCandidate


def test_search_track_lyrics_lddc_candidates(db_session, monkeypatch):
    artist = Artist(name="周杰伦")
    db_session.add(artist)
    db_session.flush()

    track = Track(
        file_path="/tmp/song-1.mp3",
        title="威廉古堡",
        artist_id=artist.id,
        duration=240.0,
        format="mp3",
    )
    db_session.add(track)
    db_session.commit()
    db_session.refresh(track)

    monkeypatch.setattr(
        lyrics_api,
        "search_lddc_candidates",
        lambda _title, _artist=None, limit=8, duration_seconds=None: [
            LDDCCandidate(
                content="[00:01.00]威[00:01.30]廉",
                source="lddc:ne",
                synced=True,
            ),
            LDDCCandidate(
                content="[00:02.00]古堡",
                source="lddc:qm",
                synced=True,
            ),
        ][:limit],
    )

    payload = LyricsSearch(title="威廉古堡", artist="周杰伦")
    results = lyrics_api.search_track_lyrics_lddc_candidates(
        track.id,
        payload,
        limit=8,
        db=db_session,
    )

    assert len(results) == 2
    assert results[0]["source"] == "lddc:ne"
    assert results[0]["word_level"] is True
    assert "威" in results[0]["preview"]
