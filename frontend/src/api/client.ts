import axios from 'axios'
import type {
  TrackOut,
  TrackListOut,
  TrackCoverApply,
  TrackCoverCandidate,
  TrackCoverSearch,
  TrackUpdate,
  TracksParams,
  AlbumOut,
  AlbumsParams,
  ArtistOut,
  PlaylistOut,
  PlaylistDetailOut,
  PlaylistCreate,
  PlaylistUpdate,
  PlaylistTracksAdd,
  PlaylistTracksReorder,
  LyricsOut,
  LyricsSearch,
  LyricsUpdate,
  LyricsCandidate,
  WatchFolderOut,
  FolderAdd,
  ScanResult,
} from '@/types/api'

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// --- Tracks ---

export async function getTracks(params?: TracksParams): Promise<TrackListOut> {
  const { data } = await api.get<TrackListOut>('/tracks', { params })
  return data
}

export async function getTrack(id: number): Promise<TrackOut> {
  const { data } = await api.get<TrackOut>(`/tracks/${id}`)
  return data
}

export async function updateTrack(id: number, payload: TrackUpdate): Promise<TrackOut> {
  const { data } = await api.patch<TrackOut>(`/tracks/${id}`, payload)
  return data
}

export async function searchTrackCover(id: number): Promise<TrackOut> {
  const { data } = await api.post<TrackOut>(`/tracks/${id}/cover/search`)
  return data
}

export async function searchTrackCoverCandidates(
  id: number,
  payload: TrackCoverSearch
): Promise<TrackCoverCandidate[]> {
  const { data } = await api.post<TrackCoverCandidate[]>(
    `/tracks/${id}/cover/candidates`,
    payload
  )
  return data
}

export async function applyTrackCover(
  id: number,
  payload: TrackCoverApply
): Promise<TrackOut> {
  const { data } = await api.post<TrackOut>(`/tracks/${id}/cover`, payload)
  return data
}

export function getTrackStreamUrl(id: number): string {
  return `${api.defaults.baseURL}/tracks/${id}/stream`
}

export function getTrackCoverUrl(id: number, revision?: string | null): string {
  const url = `${api.defaults.baseURL}/tracks/${id}/cover`
  return revision ? `${url}?v=${encodeURIComponent(revision)}` : url
}

export function getAlbumCoverUrl(id: number): string {
  return `${api.defaults.baseURL}/albums/${id}/cover`
}

export function getArtistCoverUrl(id: number): string {
  return `${api.defaults.baseURL}/artists/${id}/cover`
}

// --- Albums ---

export async function getAlbums(params?: AlbumsParams): Promise<AlbumOut[]> {
  const { data } = await api.get<AlbumOut[]>('/albums', { params })
  return data
}

export async function getAlbum(id: number): Promise<AlbumOut> {
  const { data } = await api.get<AlbumOut>(`/albums/${id}`)
  return data
}

export async function searchAlbumCoverCandidates(
  id: number,
  payload: TrackCoverSearch
): Promise<TrackCoverCandidate[]> {
  const { data } = await api.post<TrackCoverCandidate[]>(
    `/albums/${id}/cover/candidates`,
    payload
  )
  return data
}

export async function applyAlbumCover(
  id: number,
  payload: TrackCoverApply
): Promise<AlbumOut> {
  const { data } = await api.post<AlbumOut>(`/albums/${id}/cover`, payload)
  return data
}

// --- Artists ---

export async function getArtists(): Promise<ArtistOut[]> {
  const { data } = await api.get<ArtistOut[]>('/artists')
  return data
}

export async function getArtist(id: number): Promise<ArtistOut> {
  const { data } = await api.get<ArtistOut>(`/artists/${id}`)
  return data
}

// --- Playlists ---

export async function getPlaylists(): Promise<PlaylistOut[]> {
  const { data } = await api.get<PlaylistOut[]>('/playlists')
  return data
}

export async function getPlaylist(id: number): Promise<PlaylistDetailOut> {
  const { data } = await api.get<PlaylistDetailOut>(`/playlists/${id}`)
  return data
}

export async function createPlaylist(payload: PlaylistCreate): Promise<PlaylistOut> {
  const { data } = await api.post<PlaylistOut>('/playlists', payload)
  return data
}

export async function updatePlaylist(id: number, payload: PlaylistUpdate): Promise<PlaylistOut> {
  const { data } = await api.put<PlaylistOut>(`/playlists/${id}`, payload)
  return data
}

export async function deletePlaylist(id: number): Promise<void> {
  await api.delete(`/playlists/${id}`)
}

export async function addTracksToPlaylist(id: number, trackIds: number[]): Promise<void> {
  const payload: PlaylistTracksAdd = { track_ids: trackIds }
  await api.post(`/playlists/${id}/tracks`, payload)
}

export async function removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<void> {
  await api.delete(`/playlists/${playlistId}/tracks/${trackId}`)
}

export async function reorderPlaylist(id: number, trackIds: number[]): Promise<void> {
  const payload: PlaylistTracksReorder = { track_ids: trackIds }
  await api.patch(`/playlists/${id}/tracks/reorder`, payload)
}

// --- Favorites ---

export async function getFavorites(): Promise<TrackOut[]> {
  const { data } = await api.get<TrackOut[]>('/favorites')
  return data
}

export async function addFavorite(trackId: number): Promise<void> {
  await api.post(`/favorites/${trackId}`)
}

export async function removeFavorite(trackId: number): Promise<void> {
  await api.delete(`/favorites/${trackId}`)
}

// --- Lyrics ---

export async function getLyrics(trackId: number): Promise<LyricsOut> {
  const { data } = await api.get<LyricsOut>(`/lyrics/${trackId}`)
  return data
}

export interface SearchLyricsOptions {
  refresh?: boolean
  allowUnsynced?: boolean
}

export async function searchLyrics(
  trackId: number,
  payload: LyricsSearch,
  options: SearchLyricsOptions = {}
): Promise<LyricsOut> {
  const { data } = await api.post<LyricsOut>(`/lyrics/${trackId}/search`, payload, {
    params: {
      refresh: options.refresh ? 1 : 0,
      allow_unsynced: options.allowUnsynced ? 1 : 0,
    },
  })
  return data
}

export async function saveLyrics(trackId: number, payload: LyricsUpdate): Promise<LyricsOut> {
  const { data } = await api.put<LyricsOut>(`/lyrics/${trackId}`, payload)
  return data
}

export async function restoreLyrics(trackId: number): Promise<LyricsOut> {
  const { data } = await api.post<LyricsOut>(`/lyrics/${trackId}/restore`)
  return data
}

export async function updateLyricsOffset(trackId: number, offsetMs: number): Promise<LyricsOut> {
  const { data } = await api.put<LyricsOut>(`/lyrics/${trackId}/offset`, { offset_ms: offsetMs })
  return data
}

export async function translateLyrics(trackId: number, force = false): Promise<LyricsOut> {
  const { data } = await api.post<LyricsOut>(`/lyrics/${trackId}/translate`, null, { params: { force } })
  return data
}

export interface LyricsStatus {
  total: number
  synced: number
  pending: number
  has_original: number
}

export async function getLyricsStatus(): Promise<LyricsStatus> {
  const { data } = await api.get<LyricsStatus>('/lyrics/status')
  return data
}

export async function searchLddcCandidates(
  trackId: number,
  payload: LyricsSearch,
  limit = 8
): Promise<LyricsCandidate[]> {
  const { data } = await api.post<LyricsCandidate[]>(
    `/lyrics/${trackId}/search/lddc-candidates`,
    payload,
    { params: { limit } }
  )
  return data
}

// --- Library ---

export async function scanLibrary(path: string): Promise<ScanResult> {
  const { data } = await api.post<ScanResult>('/library/scan', { path })
  return data
}

export async function getFolders(): Promise<WatchFolderOut[]> {
  const { data } = await api.get<WatchFolderOut[]>('/library/folders')
  return data
}

export async function addFolder(payload: FolderAdd): Promise<WatchFolderOut> {
  const { data } = await api.post<WatchFolderOut>('/library/folders', payload)
  return data
}

export async function removeFolder(id: number): Promise<void> {
  await api.delete(`/library/folders/${id}`)
}

export async function refreshLibrary(): Promise<ScanResult> {
  const { data } = await api.post<ScanResult>('/library/refresh')
  return data
}

export async function clearLibrary(): Promise<void> {
  await api.delete('/library/clear')
}

export interface BrowseEntry {
  name: string
  path: string
}

export interface BrowseResult {
  path: string
  parent: string | null
  entries: BrowseEntry[]
}

export async function browseDirectories(path: string = '/'): Promise<BrowseResult> {
  const { data } = await api.get<BrowseResult>('/library/browse', { params: { path } })
  return data
}

export async function addFoldersBatch(paths: string[]): Promise<WatchFolderOut[]> {
  const { data } = await api.post<WatchFolderOut[]>('/library/folders/batch', { paths })
  return data
}

// --- Search ---

export interface SearchResult {
  artists: ArtistOut[]
  albums: AlbumOut[]
  tracks: TrackOut[]
}

export async function searchAll(q: string, limit = 10): Promise<SearchResult> {
  const { data } = await api.get<SearchResult>('/search', { params: { q, limit } })
  return data
}

// --- Artist Images ---

export interface ArtistImageFetchStatus {
  running: boolean
  total: number
  processed: number
  success: number
  failed: number
  current_artist: string | null
}

export async function fetchArtistImages(): Promise<{ success: number; total: number; failed: number }> {
  const { data } = await api.post('/artists/batch-fetch-images')
  return data
}

export async function getArtistImageFetchStatus(): Promise<ArtistImageFetchStatus> {
  const { data } = await api.get('/artists/fetch-status')
  return data
}

export async function fetchArtistImage(artistId: number): Promise<{ status: string; message: string }> {
  const { data } = await api.post(`/artists/${artistId}/fetch-image`)
  return data
}

// --- Settings ---

export interface AppSettings {
  deepseek_api_key: string
  deepseek_configured: boolean
  deepseek_model: string
  translate_source: string
  translate_target: string
}

export interface DeepSeekTestResult {
  ok: boolean
  code: string
  message: string
}

export async function getSettings(): Promise<AppSettings> {
  const { data } = await api.get<AppSettings>('/settings')
  return data
}

export async function updateSettings(payload: Partial<AppSettings>): Promise<AppSettings> {
  const { data } = await api.put<AppSettings>('/settings', payload)
  return data
}

export async function testDeepSeekConnection(): Promise<DeepSeekTestResult> {
  const { data } = await api.post<DeepSeekTestResult>('/settings/deepseek/test')
  return data
}
