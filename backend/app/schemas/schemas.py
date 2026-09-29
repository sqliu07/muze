from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Artist ──────────────────────────────────────────────────────────────────


class ArtistBase(BaseModel):
    name: str


class ArtistOut(ArtistBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cover_path: Optional[str] = None


# ── Album ───────────────────────────────────────────────────────────────────


class AlbumBase(BaseModel):
    title: str
    year: Optional[int] = None
    genre: Optional[str] = None


class AlbumOut(AlbumBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    artist_id: Optional[int] = None
    artist: Optional[ArtistOut] = None
    cover_path: Optional[str] = None
    total_tracks: int = 0

class AlbumSummaryOut(AlbumBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    artist_id: Optional[int] = None
    cover_path: Optional[str] = None
    total_tracks: int = 0

# ── Track ───────────────────────────────────────────────────────────────────


class TrackBase(BaseModel):
    title: str
    duration: float
    format: str
    track_number: Optional[int] = None
    disc_number: Optional[int] = None
    year: Optional[int] = None
    genre: Optional[str] = None


class TrackOut(TrackBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_path: str
    artist_id: Optional[int] = None
    album_id: Optional[int] = None
    artist: Optional[ArtistOut] = None
    album: Optional[AlbumOut] = None
    bitrate: Optional[int] = None
    has_cover: bool = False
    play_count: int = 0
    file_missing: bool = False
    date_added: datetime
    is_favorite: bool = False

class TrackUpdate(BaseModel):
    title: Optional[str] = None
    artist_name: Optional[str] = None
    album_title: Optional[str] = None
    year: Optional[int] = None
    track_number: Optional[int] = None
    disc_number: Optional[int] = None
    genre: Optional[str] = None


class TrackCoverSearch(BaseModel):
    title: str
    artist: Optional[str] = None
    limit: int = 8


class TrackCoverCandidateOut(BaseModel):
    image_url: str
    thumbnail_url: str
    album_title: str = ""
    artist_name: str = ""
    source: str = "itunes"


class TrackCoverApply(BaseModel):
    image_url: str
    album_title: Optional[str] = None
    artist_name: Optional[str] = None


class TrackListOut(BaseModel):
    items: list[TrackOut]
    total: int
    page: int
    limit: int


class AlbumDetailOut(AlbumOut):
    tracks: list[TrackOut] = Field(default_factory=list)


class ArtistDetailOut(ArtistOut):
    albums: list[AlbumOut] = Field(default_factory=list)


# ── Lyrics ──────────────────────────────────────────────────────────────────


class LyricsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    track_id: int
    source: Optional[str] = None
    content: Optional[str] = None
    synced: bool = False
    offset_ms: int = 0
    translated_content: Optional[str] = None
    original_content: Optional[str] = None
    original_source: Optional[str] = None
    updated_at: datetime

class LyricsSearch(BaseModel):
    title: str
    artist: Optional[str] = None


class LyricsUpdate(BaseModel):
    content: str
    source: Optional[str] = None
    synced: Optional[bool] = None
    translated_content: Optional[str] = None


class LyricsCandidateOut(BaseModel):
    source: str
    synced: bool = False
    word_level: bool = False
    preview: str
    content: str
    translated_content: Optional[str] = None
    song_title: str = ""
    song_artist: str = ""
    duration_seconds: Optional[float] = None


# ── Playlist ────────────────────────────────────────────────────────────────


class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = None


class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class PlaylistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    track_count: int = 0

class PlaylistDetailOut(PlaylistOut):
    tracks: list[TrackOut] = Field(default_factory=list)


class PlaylistTracksAdd(BaseModel):
    track_ids: list[int]


class PlaylistTracksReorder(BaseModel):
    track_ids: list[int]


# ── Library ─────────────────────────────────────────────────────────────────


class FolderAdd(BaseModel):
    path: str


class WatchFolderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    path: str
    last_scanned: Optional[datetime] = None
    active: bool = True

class ScanRequest(BaseModel):
    path: str


class BrowseEntry(BaseModel):
    name: str
    path: str


class BrowseResult(BaseModel):
    path: str
    parent: Optional[str] = None
    entries: list[BrowseEntry] = Field(default_factory=list)


class BatchFolderAdd(BaseModel):
    paths: list[str]


class ScanResult(BaseModel):
    added: int
    updated: int
    errors: int


# ── Favorite ────────────────────────────────────────────────────────────────


class FavoriteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    track_id: int
    added_at: datetime
    track: TrackOut

# ── Search ───────────────────────────────────────────────────────────────────


class SearchResultOut(BaseModel):
    artists: list[ArtistOut] = Field(default_factory=list)
    albums: list[AlbumOut] = Field(default_factory=list)
    tracks: list[TrackOut] = Field(default_factory=list)
