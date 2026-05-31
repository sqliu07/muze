// 后端 API 类型定义

export interface ArtistOut {
  id: number
  name: string
  cover_path: string | null
  albums?: AlbumOut[]
}

export interface AlbumOut {
  id: number
  title: string
  artist_id: number | null
  artist: ArtistOut | null
  year: number | null
  genre: string | null
  cover_path: string | null
  total_tracks: number
  tracks?: TrackOut[]
}

export interface TrackOut {
  id: number
  file_path: string
  title: string
  artist_id: number | null
  album_id: number | null
  artist: ArtistOut | null
  album: AlbumOut | null
  duration: number
  bitrate: number | null
  format: string
  track_number: number | null
  disc_number: number | null
  year: number | null
  genre: string | null
  has_cover: boolean
  play_count: number
  file_missing: boolean
  date_added: string
  is_favorite: boolean
}

export interface TrackListOut {
  items: TrackOut[]
  total: number
  page: number
  limit: number
}

export interface TrackUpdate {
  title?: string
  artist_name?: string
  album_title?: string
  year?: number
  track_number?: number
  disc_number?: number
  genre?: string
}

export interface LyricsOut {
  id: number
  track_id: number
  source: string | null
  content: string | null
  synced: boolean
  updated_at: string
  original_content: string | null
  original_source: string | null
}

export interface LyricsSearch {
  title: string
  artist?: string
}

export interface LyricsUpdate {
  content: string
  source?: string
  synced?: boolean
}

export interface LyricsCandidate {
  source: string
  synced: boolean
  word_level: boolean
  preview: string
  content: string
  song_title: string
  song_artist: string
}

export interface PlaylistCreate {
  name: string
  description?: string
}

export interface PlaylistUpdate {
  name?: string
  description?: string
}

export interface PlaylistOut {
  id: number
  name: string
  description: string | null
  created_at: string
  updated_at: string
  track_count: number
}

export interface PlaylistDetailOut extends PlaylistOut {
  tracks: TrackOut[]
}

export interface PlaylistTracksAdd {
  track_ids: number[]
}

export interface PlaylistTracksReorder {
  track_ids: number[]
}

export interface FolderAdd {
  path: string
}

export interface WatchFolderOut {
  id: number
  path: string
  last_scanned: string | null
  active: boolean
}

export interface ScanResult {
  added: number
  updated: number
  errors: number
}

// 查询参数类型
export interface TracksParams {
  page?: number
  limit?: number
  sort?: string
  order?: 'asc' | 'desc'
  search?: string
  artist_id?: number
  album_id?: number
  genre?: string
  favorite?: boolean
}

export interface AlbumsParams {
  sort?: string
  artist_id?: number
}

export interface SearchResult {
  artists: ArtistOut[]
  albums: AlbumOut[]
  tracks: TrackOut[]
}
