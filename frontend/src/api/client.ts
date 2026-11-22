import { remoteApi, requestLibrary, getLibraryMediaUrl } from '@/platform/library'
import type { LibraryMethod, LibraryQuery } from '@/platform/contracts/library'
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

export const api = remoteApi

interface RequestOptions {
  params?: LibraryQuery
  sourceId?: string
}

async function libraryRequest<T>(method: LibraryMethod, path: string, body?: unknown, options?: RequestOptions): Promise<{ data: T }> {
  return { data: await requestLibrary<T>(method, path, options?.params, body, options?.sourceId) }
}

// Keep the existing API-shaped call surface while routing every library operation
// through the provider captured at request start.
const libraryApi = {
  get: <T = unknown>(path: string, options?: RequestOptions) => libraryRequest<T>('GET', path, undefined, options),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => libraryRequest<T>('POST', path, body, options),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => libraryRequest<T>('PUT', path, body, options),
  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => libraryRequest<T>('PATCH', path, body, options),
  delete: <T = unknown>(path: string, options?: RequestOptions) => libraryRequest<T>('DELETE', path, undefined, options),
}

// --- Tracks ---

export async function getTracks(params?: TracksParams, sourceId?: string): Promise<TrackListOut> {
  const { data } = await libraryApi.get<TrackListOut>('/tracks', { params: { ...params }, sourceId })
  return data
}

export async function getTrack(id: number, sourceId?: string): Promise<TrackOut> {
  const { data } = await libraryApi.get<TrackOut>(`/tracks/${id}`, { sourceId })
  return data
}

export async function updateTrack(id: number, payload: TrackUpdate, sourceId?: string): Promise<TrackOut> {
  const { data } = await libraryApi.patch<TrackOut>(`/tracks/${id}`, payload, { sourceId })
  return data
}

export async function searchTrackCover(id: number, sourceId?: string): Promise<TrackOut> {
  const { data } = await libraryApi.post<TrackOut>(`/tracks/${id}/cover/search`, undefined, { sourceId })
  return data
}

export async function searchTrackCoverCandidates(
  id: number,
  payload: TrackCoverSearch,
  sourceId?: string
): Promise<TrackCoverCandidate[]> {
  const { data } = await libraryApi.post<TrackCoverCandidate[]>(
    `/tracks/${id}/cover/candidates`,
    payload,
    { sourceId }
  )
  return data
}

export async function applyTrackCover(
  id: number,
  payload: TrackCoverApply,
  sourceId?: string
): Promise<TrackOut> {
  const { data } = await libraryApi.post<TrackOut>(`/tracks/${id}/cover`, payload, { sourceId })
  return data
}

export function getTrackStreamUrl(id: number, sourceId?: string): string {
  return getLibraryMediaUrl(id, 'track', sourceId)
}

export function getTrackCoverUrl(id: number, revision?: string | null, sourceId?: string): string {
  const url = getLibraryMediaUrl(id, 'cover', sourceId)
  return revision && url ? `${url}?v=${encodeURIComponent(revision)}` : url
}

export function getAlbumCoverUrl(id: number, sourceId?: string): string {
  return getLibraryMediaUrl(id, 'album', sourceId)
}

export function getArtistCoverUrl(id: number, sourceId?: string): string {
  return getLibraryMediaUrl(id, 'artist', sourceId)
}

// --- Albums ---

export async function getAlbums(params?: AlbumsParams, sourceId?: string): Promise<AlbumOut[]> {
  const { data } = await libraryApi.get<AlbumOut[]>('/albums', { params: { ...params }, sourceId })
  return data
}

export async function getAlbum(id: number, sourceId?: string): Promise<AlbumOut> {
  const { data } = await libraryApi.get<AlbumOut>(`/albums/${id}`, { sourceId })
  return data
}

export async function searchAlbumCoverCandidates(
  id: number,
  payload: TrackCoverSearch,
  sourceId?: string
): Promise<TrackCoverCandidate[]> {
  const { data } = await libraryApi.post<TrackCoverCandidate[]>(
    `/albums/${id}/cover/candidates`,
    payload,
    { sourceId }
  )
  return data
}

export async function applyAlbumCover(
  id: number,
  payload: TrackCoverApply,
  sourceId?: string
): Promise<AlbumOut> {
  const { data } = await libraryApi.post<AlbumOut>(`/albums/${id}/cover`, payload, { sourceId })
  return data
}

// --- Artists ---

export async function getArtists(sourceId?: string): Promise<ArtistOut[]> {
  const { data } = await libraryApi.get<ArtistOut[]>('/artists', { sourceId })
  return data
}

export async function getArtist(id: number, sourceId?: string): Promise<ArtistOut> {
  const { data } = await libraryApi.get<ArtistOut>(`/artists/${id}`, { sourceId })
  return data
}

// --- Playlists ---

export async function getPlaylists(sourceId?: string): Promise<PlaylistOut[]> {
  const { data } = await libraryApi.get<PlaylistOut[]>('/playlists', { sourceId })
  return data
}

export async function getPlaylist(id: number, sourceId?: string): Promise<PlaylistDetailOut> {
  const { data } = await libraryApi.get<PlaylistDetailOut>(`/playlists/${id}`, { sourceId })
  return data
}

export async function createPlaylist(payload: PlaylistCreate, sourceId?: string): Promise<PlaylistOut> {
  const { data } = await libraryApi.post<PlaylistOut>('/playlists', payload, { sourceId })
  return data
}

export async function updatePlaylist(id: number, payload: PlaylistUpdate, sourceId?: string): Promise<PlaylistOut> {
  const { data } = await libraryApi.put<PlaylistOut>(`/playlists/${id}`, payload, { sourceId })
  return data
}

export async function deletePlaylist(id: number, sourceId?: string): Promise<void> {
  await libraryApi.delete(`/playlists/${id}`, { sourceId })
}

export async function addTracksToPlaylist(id: number, trackIds: number[], sourceId?: string): Promise<void> {
  const payload: PlaylistTracksAdd = { track_ids: trackIds }
  await libraryApi.post(`/playlists/${id}/tracks`, payload, { sourceId })
}

export async function removeTrackFromPlaylist(playlistId: number, trackId: number, sourceId?: string): Promise<void> {
  await libraryApi.delete(`/playlists/${playlistId}/tracks/${trackId}`, { sourceId })
}

export async function reorderPlaylist(id: number, trackIds: number[], sourceId?: string): Promise<void> {
  const payload: PlaylistTracksReorder = { track_ids: trackIds }
  await libraryApi.patch(`/playlists/${id}/tracks/reorder`, payload, { sourceId })
}

// --- Favorites ---

export async function getFavorites(sourceId?: string): Promise<TrackOut[]> {
  const { data } = await libraryApi.get<TrackOut[]>('/favorites', { sourceId })
  return data
}

export async function addFavorite(trackId: number, sourceId?: string): Promise<void> {
  await libraryApi.post(`/favorites/${trackId}`, undefined, { sourceId })
}

export async function removeFavorite(trackId: number, sourceId?: string): Promise<void> {
  await libraryApi.delete(`/favorites/${trackId}`, { sourceId })
}

// --- Lyrics ---

export async function getLyrics(trackId: number, sourceId?: string): Promise<LyricsOut> {
  const { data } = await libraryApi.get<LyricsOut>(`/lyrics/${trackId}`, { sourceId })
  return data
}

export interface SearchLyricsOptions {
  refresh?: boolean
  allowUnsynced?: boolean
}

export async function searchLyrics(
  trackId: number,
  payload: LyricsSearch,
  options: SearchLyricsOptions = {},
  sourceId?: string
): Promise<LyricsOut> {
  const { data } = await libraryApi.post<LyricsOut>(`/lyrics/${trackId}/search`, payload, {
    sourceId,
    params: {
      refresh: options.refresh ? 1 : 0,
      allow_unsynced: options.allowUnsynced ? 1 : 0,
    },
  })
  return data
}

export async function saveLyrics(trackId: number, payload: LyricsUpdate, sourceId?: string): Promise<LyricsOut> {
  const { data } = await libraryApi.put<LyricsOut>(`/lyrics/${trackId}`, payload, { sourceId })
  return data
}

export async function restoreLyrics(trackId: number, sourceId?: string): Promise<LyricsOut> {
  const { data } = await libraryApi.post<LyricsOut>(`/lyrics/${trackId}/restore`, undefined, { sourceId })
  return data
}

export async function updateLyricsOffset(trackId: number, offsetMs: number, sourceId?: string): Promise<LyricsOut> {
  const { data } = await libraryApi.put<LyricsOut>(`/lyrics/${trackId}/offset`, { offset_ms: offsetMs }, { sourceId })
  return data
}

export async function translateLyrics(trackId: number, force = false, sourceId?: string): Promise<LyricsOut> {
  const { data } = await libraryApi.post<LyricsOut>(`/lyrics/${trackId}/translate`, null, { params: { force }, sourceId })
  return data
}

export interface LyricsStatus {
  total: number
  synced: number
  pending: number
  has_original: number
}

export async function getLyricsStatus(sourceId?: string): Promise<LyricsStatus> {
  const { data } = await libraryApi.get<LyricsStatus>('/lyrics/status', { sourceId })
  return data
}

export async function searchLddcCandidates(
  trackId: number,
  payload: LyricsSearch,
  limit = 8,
  sourceId?: string
): Promise<LyricsCandidate[]> {
  const { data } = await libraryApi.post<LyricsCandidate[]>(
    `/lyrics/${trackId}/search/lddc-candidates`,
    payload,
    { params: { limit }, sourceId }
  )
  return data
}

// --- Library ---

export async function scanLibrary(path?: string, sourceId?: string): Promise<ScanResult> {
  const { data } = await libraryApi.post<ScanResult>('/library/scan', { path }, { sourceId })
  return data
}

export async function getFolders(sourceId?: string): Promise<WatchFolderOut[]> {
  const { data } = await libraryApi.get<WatchFolderOut[]>('/library/folders', { sourceId })
  return data
}

export async function addFolder(payload: FolderAdd, sourceId?: string): Promise<WatchFolderOut> {
  const { data } = await libraryApi.post<WatchFolderOut>('/library/folders', payload, { sourceId })
  return data
}

export async function removeFolder(id: number, sourceId?: string): Promise<void> {
  await libraryApi.delete(`/library/folders/${id}`, { sourceId })
}

export async function refreshLibrary(sourceId?: string): Promise<ScanResult> {
  const { data } = await libraryApi.post<ScanResult>('/library/refresh', undefined, { sourceId })
  return data
}

export async function clearLibrary(sourceId?: string): Promise<void> {
  await libraryApi.delete('/library/clear', { sourceId })
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

export async function browseDirectories(path: string = '/', sourceId?: string): Promise<BrowseResult> {
  const { data } = await libraryApi.get<BrowseResult>('/library/browse', { params: { path }, sourceId })
  return data
}

export async function addFoldersBatch(paths: string[], sourceId?: string): Promise<WatchFolderOut[]> {
  const { data } = await libraryApi.post<WatchFolderOut[]>('/library/folders/batch', { paths }, { sourceId })
  return data
}

// --- Search ---

export interface SearchResult {
  artists: ArtistOut[]
  albums: AlbumOut[]
  tracks: TrackOut[]
}

export async function searchAll(q: string, limit = 10, sourceId?: string): Promise<SearchResult> {
  const { data } = await libraryApi.get<SearchResult>('/search', { params: { q, limit }, sourceId })
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

export async function fetchArtistImages(sourceId?: string): Promise<{ success: number; total: number; failed: number }> {
  const { data } = await libraryApi.post<{ success: number; total: number; failed: number }>('/artists/batch-fetch-images', undefined, { sourceId })
  return data
}

export async function getArtistImageFetchStatus(sourceId?: string): Promise<ArtistImageFetchStatus> {
  const { data } = await libraryApi.get<ArtistImageFetchStatus>('/artists/fetch-status', { sourceId })
  return data
}

export async function fetchArtistImage(artistId: number, sourceId?: string): Promise<{ status: string; message: string }> {
  const { data } = await libraryApi.post<{ status: string; message: string }>(`/artists/${artistId}/fetch-image`, undefined, { sourceId })
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

export async function getSettings(sourceId?: string): Promise<AppSettings> {
  const { data } = await libraryApi.get<AppSettings>('/settings', { sourceId })
  return data
}

export async function updateSettings(payload: Partial<AppSettings>, sourceId?: string): Promise<AppSettings> {
  const { data } = await libraryApi.put<AppSettings>('/settings', payload, { sourceId })
  return data
}

export async function testDeepSeekConnection(sourceId?: string): Promise<DeepSeekTestResult> {
  const { data } = await libraryApi.post<DeepSeekTestResult>('/settings/deepseek/test', undefined, { sourceId })
  return data
}
