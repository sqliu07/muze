from app.api import artists as artists_api
from app.models.models import Album, Artist


def test_artist_aliases_are_deduped_in_list_and_detail(db_session):
    a1 = Artist(name="Eason Chan陈奕迅", cover_path=None)
    a2 = Artist(name="陈奕迅", cover_path=None)
    db_session.add_all([a1, a2])
    db_session.flush()

    db_session.add_all(
        [
            Album(title="范特西", artist_id=a1.id, year=2001, cover_path="fantasy.jpg"),
            Album(title="Special Thanks To", artist_id=a2.id, year=2002, cover_path=None),
        ]
    )
    db_session.commit()

    artists = artists_api.list_artists(db_session)
    names = [a["name"] for a in artists]
    assert "陈奕迅" in names or "Eason Chan陈奕迅" in names
    assert len([a for a in artists if "陈奕迅" in a["name"]]) == 1
    merged = [a for a in artists if "陈奕迅" in a["name"]][0]
    assert merged["cover_path"] == "fantasy.jpg"

    detail = artists_api.get_artist(a2.id, db_session)
    titles = {al["title"] for al in detail["albums"]}
    assert "范特西" in titles
    assert "Special Thanks To" in titles
