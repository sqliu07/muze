from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── Artist ──────────────────────────────────────────────────────────────────


class ArtistBase(BaseModel):
    name: str


class ArtistOut(ArtistBase):
    id: int
    cover_path: Optional[str] = None

    class Config:
        orm_mode = True


# ── Album ───────────────────────────────────────────────────────────────────


class AlbumBase(BaseModel):
    title: str
    year: Optional[int] = None
    genre: Optional[str] = None


class AlbumOut(AlbumBase):
    id: int
    artist_id: Optional[int] = None
    artist: Optional[ArtistOut] = None
    cover_path: Optional[str] = None
    total_tracks: int = 0

    class Config:
        orm_mode = True


class AlbumSummaryOut(AlbumBase):
    id: int
    artist_id: Optional[int] = None
    cover_path: Optional[str] = None
    total_tracks: int = 0

    class Config:
        orm_mode = True


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

    class Config:
        orm_mode = True


class TrackUpdate(BaseModel):
    title: Optional[str] = None
    artist_name: Optional[str] = None
    album_title: Optional[str] = None
    year: Optional[int] = None
    track_number: Optional[int] = None
    disc_number: Optional[int] = None
    genre: Optional[str] = None


class TrackListOut(BaseModel):
    items: list[TrackOut]
    total: int
    page: int
    limit: int


class AlbumDetailOut(AlbumOut):
    tracks: list[TrackOut] = []


class ArtistDetailOut(ArtistOut):
    albums: list[AlbumSummaryOut] = []


# ── Lyrics ──────────────────────────────────────────────────────────────────


class LyricsOut(BaseModel):
    id: int
    track_id: int
    source: Optional[str] = None
    content: Optional[str] = None
    synced: bool = False
    original_content: Optional[str] = None
    original_source: Optional[str] = None
    updated_at: datetime

    class Config:
        orm_mode = True


class LyricsSearch(BaseModel):
    title: str
    artist: Optional[str] = None


class LyricsUpdate(BaseModel):
    content: str
    source: Optional[str] = None
    synced: Optional[bool] = None


class LyricsCandidateOut(BaseModel):
    source: str
    synced: bool = False
    word_level: bool = False
    preview: str
    content: str
    song_title: str = ""
    song_artist: str = ""


# ── Playlist ────────────────────────────────────────────────────────────────


class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = None


class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class PlaylistOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    track_count: int = 0

    class Config:
        orm_mode = True


class PlaylistDetailOut(PlaylistOut):
    tracks: list[TrackOut] = []


class PlaylistTracksAdd(BaseModel):
    track_ids: list[int]


class PlaylistTracksReorder(BaseModel):
    track_ids: list[int]


# ── Library ─────────────────────────────────────────────────────────────────


class FolderAdd(BaseModel):
    path: str


class WatchFolderOut(BaseModel):
    id: int
    path: str
    last_scanned: Optional[datetime] = None
    active: bool = True

    class Config:
        from_attributes = True
        orm_mode = True


class ScanRequest(BaseModel):
    path: str


class BrowseEntry(BaseModel):
    name: str
    path: str


class BrowseResult(BaseModel):
    path: str
    parent: Optional[str] = None
    entries: list[BrowseEntry] = []


class BatchFolderAdd(BaseModel):
    paths: list[str]


class ScanResult(BaseModel):
    added: int
    updated: int
    errors: int


# ── Favorite ────────────────────────────────────────────────────────────────


class FavoriteOut(BaseModel):
    track_id: int
    added_at: datetime
    track: TrackOut

    class Config:
        orm_mode = True
