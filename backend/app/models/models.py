from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utc_now() -> datetime:
    """Return an explicit UTC timestamp without relying on deprecated utcnow()."""
    return datetime.now(timezone.utc)


class Artist(Base):
    __tablename__ = "artists"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    cover_path: Mapped[Optional[str]] = mapped_column(String(512), default=None)

    albums: Mapped[list[Album]] = relationship(back_populates="artist")
    tracks: Mapped[list[Track]] = relationship(back_populates="artist")


class Album(Base):
    __tablename__ = "albums"
    __table_args__ = (UniqueConstraint("title", "artist_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255))
    artist_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("artists.id"), default=None
    )
    year: Mapped[Optional[int]] = mapped_column(default=None)
    genre: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    cover_path: Mapped[Optional[str]] = mapped_column(String(512), default=None)
    total_tracks: Mapped[int] = mapped_column(default=0)

    artist: Mapped[Optional[Artist]] = relationship(back_populates="albums")
    tracks: Mapped[list[Track]] = relationship(back_populates="album")


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    file_path: Mapped[str] = mapped_column(String(1024), unique=True)
    title: Mapped[str] = mapped_column(String(255))
    artist_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("artists.id"), default=None
    )
    album_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("albums.id"), default=None
    )
    duration: Mapped[float] = mapped_column(default=0.0)
    bitrate: Mapped[Optional[int]] = mapped_column(default=None)
    format: Mapped[str] = mapped_column(String(10))
    track_number: Mapped[Optional[int]] = mapped_column(default=None)
    disc_number: Mapped[Optional[int]] = mapped_column(default=None)
    year: Mapped[Optional[int]] = mapped_column(default=None)
    genre: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    has_cover: Mapped[bool] = mapped_column(default=False)
    play_count: Mapped[int] = mapped_column(default=0)
    file_missing: Mapped[bool] = mapped_column(default=False)
    date_added: Mapped[datetime] = mapped_column(default=utc_now)
    date_modified: Mapped[Optional[datetime]] = mapped_column(
        default=None, onupdate=utc_now
    )

    artist: Mapped[Optional[Artist]] = relationship(back_populates="tracks")
    album: Mapped[Optional[Album]] = relationship(back_populates="tracks")
    lyrics: Mapped[Optional[Lyrics]] = relationship(
        back_populates="track", uselist=False
    )
    favorite: Mapped[Optional[Favorite]] = relationship(
        back_populates="track", uselist=False
    )
    playlist_entries: Mapped[list[PlaylistTrack]] = relationship(
        back_populates="track"
    )


class Lyrics(Base):
    __tablename__ = "lyrics"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id"), unique=True
    )
    source: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    content: Mapped[Optional[str]] = mapped_column(Text, default=None)
    synced: Mapped[bool] = mapped_column(default=False)
    offset_ms: Mapped[int] = mapped_column(default=0, server_default="0")
    translated_content: Mapped[Optional[str]] = mapped_column(Text, default=None)
    original_content: Mapped[Optional[str]] = mapped_column(Text, default=None)
    original_source: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    updated_at: Mapped[datetime] = mapped_column(
        default=utc_now, onupdate=utc_now
    )

    track: Mapped[Track] = relationship(back_populates="lyrics")


class LyricsSearchCache(Base):
    __tablename__ = "lyrics_search_cache"
    __table_args__ = (UniqueConstraint("query_title", "query_artist"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    query_title: Mapped[str] = mapped_column(String(255))
    query_artist: Mapped[str] = mapped_column(String(255), default="")
    source: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    content: Mapped[Optional[str]] = mapped_column(Text, default=None)
    synced: Mapped[bool] = mapped_column(default=False)
    translated_content: Mapped[Optional[str]] = mapped_column(Text, default=None)
    updated_at: Mapped[datetime] = mapped_column(
        default=utc_now, onupdate=utc_now
    )


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        default=utc_now, onupdate=utc_now
    )

    tracks: Mapped[list[PlaylistTrack]] = relationship(
        back_populates="playlist", cascade="all, delete-orphan"
    )


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    playlist_id: Mapped[int] = mapped_column(
        ForeignKey("playlists.id"), primary_key=True
    )
    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id"), primary_key=True
    )
    position: Mapped[int]

    playlist: Mapped[Playlist] = relationship(back_populates="tracks")
    track: Mapped[Track] = relationship(back_populates="playlist_entries")


class Favorite(Base):
    __tablename__ = "favorites"

    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id"), primary_key=True
    )
    added_at: Mapped[datetime] = mapped_column(default=utc_now)

    track: Mapped[Track] = relationship(back_populates="favorite")


class WatchFolder(Base):
    __tablename__ = "watch_folders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    path: Mapped[str] = mapped_column(String(1024), unique=True)
    last_scanned: Mapped[Optional[datetime]] = mapped_column(default=None)
    active: Mapped[bool] = mapped_column(default=True)
