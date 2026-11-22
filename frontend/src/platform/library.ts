import axios from 'axios'
import { registerPlugin, Capacitor } from '@capacitor/core'
import type { TrackOut } from '../types/api.ts'
import type { LibraryProvider, LibrarySource, LibraryMethod, LibraryQuery, LibraryMediaKind, LibraryPermission, LibraryScanProgress } from './contracts/library.ts'
import { sourceIdentity } from './contracts/models.ts'
import { getRuntimePlatform } from './runtime.ts'
import { SOURCE_SETTINGS_KEY, SAME_ORIGIN_SOURCE, createRemoteSource, localLibrarySource, readSourceSettings } from './sourceSettings.ts'
import { handleNativeOnlineRequest } from './onlineMetadata.ts'

export const remoteApi = axios.create({ baseURL: '/api', timeout: 30000 })
const listeners = new Set<() => void>()
const providers = new Map<string, LibraryProvider>()
const nativeMediaUrls = new Map<string, string>()
let settings: ReturnType<typeof readSourceSettings> | undefined

function getSettings() {
  if (!settings) {
    let raw: string | null = null
    try { raw = localStorage.getItem(SOURCE_SETTINGS_KEY) } catch { /* Private-mode storage can be unavailable. */ }
    settings = readSourceSettings(raw, getRuntimePlatform())
  }
  return settings
}

export function getLibrarySources(): LibrarySource[] {
  const local = localLibrarySource(getRuntimePlatform())
  return [...(local ? [local] : []), ...getSettings().remotes]
}

export function getActiveLibrarySource(): LibrarySource {
  return getLibrarySources().find((source) => source.id === getSettings().activeSourceId) ?? SAME_ORIGIN_SOURCE
}

export function getLibrarySourceId(): string { return getActiveLibrarySource().id }

export function subscribeLibrarySource(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function saveSettings() {
  try { localStorage.setItem(SOURCE_SETTINGS_KEY, JSON.stringify(getSettings())) } catch { /* Session-only selection is still useful. */ }
  for (const listener of listeners) listener()
}

export function selectLibrarySource(sourceId: string): void {
  if (!getLibrarySources().some((source) => source.id === sourceId)) throw new Error('音乐源不可用')
  getSettings().activeSourceId = sourceId
  saveSettings()
}

export function addRemoteLibrarySource(name: string, baseUrl: string): LibrarySource {
  const source = createRemoteSource(name, baseUrl)
  const current = getSettings()
  const index = current.remotes.findIndex((remote) => remote.id === source.id)
  if (index >= 0) current.remotes[index] = source
  else current.remotes.push(source)
  saveSettings()
  return source
}

export class RemoteLibraryProvider implements LibraryProvider {
  readonly source: LibrarySource
  constructor(source: LibrarySource = SAME_ORIGIN_SOURCE) { this.source = { ...source } }
  async request<T>(method: LibraryMethod, path: string, query?: LibraryQuery, body?: unknown): Promise<T> {
    const { data } = await remoteApi.request<T>({
      method, url: path, params: query, data: body, baseURL: this.source.baseUrl,
      timeout: this.source.id === SAME_ORIGIN_SOURCE.id ? 30000 : 3000,
    })
    return data
  }
  mediaUrl(id: number, kind: LibraryMediaKind): string {
    const route = kind === 'track' ? `tracks/${id}/stream`
      : kind === 'cover' ? `tracks/${id}/cover`
      : kind === 'album' ? `albums/${id}/cover` : `artists/${id}/cover`
    return `${this.source.baseUrl}/${route}`
  }
}

interface AndroidLibraryPlugin {
  request(options: { method: LibraryMethod; path: string; query: LibraryQuery; body: unknown }): Promise<{ data: unknown }>
  mediaUrl(options: { id: number; kind: LibraryMediaKind }): Promise<{ url: string }>
  openSettings(): Promise<void>
}

async function androidBridge() {
  return { plugin: registerPlugin<AndroidLibraryPlugin>('LocalLibrary'), Capacitor }
}

export class NativeLibraryProvider implements LibraryProvider {
  readonly source: LibrarySource
  constructor(source: LibrarySource) { this.source = { ...source } }
  async request<T>(method: LibraryMethod, path: string, query: LibraryQuery = {}, body: unknown = null): Promise<T> {
    if (this.source.platform === 'windows') {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke<T>('library_request', { method, path, query, body })
    }
    const { plugin } = await androidBridge()
    const response = await plugin.request({ method, path, query, body })
    return response.data as T
  }
  mediaUrl(id: number, kind: LibraryMediaKind): string {
    if (this.source.platform === 'windows') {
      return `http://muze-media.localhost/${kind}/${id}`
    }
    // Track IDs are resolved to content URIs by the Android service, never by React.
    return kind === 'track' ? `muze-native://track/${id}` : nativeMediaUrls.get(`${this.source.id}:${kind}:${id}`) ?? ''
  }
}

export function getLibraryProvider(sourceId = getLibrarySourceId()): LibraryProvider {
  let provider = providers.get(sourceId)
  if (!provider) {
    const source = getLibrarySources().find((item) => item.id === sourceId)
    if (!source) throw new Error('该音乐源已不可用，请重新连接')
    provider = source.kind === 'remote' ? new RemoteLibraryProvider(source) : new NativeLibraryProvider(source)
    providers.set(sourceId, provider)
  }
  return provider
}

function annotateEntities(value: unknown, provider: LibraryProvider): unknown {
  if (Array.isArray(value)) return value.map((item) => annotateEntities(item, provider))
  if (!value || typeof value !== 'object') return value
  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(input)) output[key] = annotateEntities(item, provider)
  if (typeof output.id === 'number') {
    const isTrack = 'duration' in output && 'format' in output
    const isAlbum = 'total_tracks' in output
    const isArtist = 'name' in output && 'cover_path' in output && !isTrack && !isAlbum
    if (isTrack || isAlbum || isArtist || 'track_count' in output || 'track_id' in output) output.source_id = provider.source.id
    if (isTrack) {
      output.playback_url = provider.mediaUrl(output.id as number, 'track')
      if (provider.source.platform !== 'android') output.cover_url = provider.mediaUrl(output.id as number, 'cover')
      if (provider.source.kind === 'local') output.file_path = ''
    }
    if ((isAlbum || isArtist) && provider.source.platform !== 'android') {
      output.cover_url = provider.mediaUrl(output.id as number, isAlbum ? 'album' : 'artist')
    }
    if (provider.source.kind === 'local' && 'cover_path' in output) {
      output.cover_path = output.cover_path ? `cover:${output.id}` : null
    }
  }
  return output
}

async function prepareAndroidCovers(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') return
  const { Capacitor } = await androidBridge()
  function visit(item: unknown) {
    if (Array.isArray(item)) { item.forEach(visit); return }
    if (!item || typeof item !== 'object') return
    const entity = item as Record<string, unknown>
    if (typeof entity.cover_url === 'string' && entity.cover_url.startsWith('file://')) {
      entity.cover_url = Capacitor.convertFileSrc(entity.cover_url)
    }
    if (typeof entity.id === 'number' && typeof entity.cover_url === 'string' && entity.cover_url) {
      const kind = 'duration' in entity ? 'cover' : 'total_tracks' in entity ? 'album' : 'artist'
      nativeMediaUrls.set(`${entity.source_id}:${kind}:${entity.id}`, entity.cover_url)
    }
    Object.values(entity).forEach(visit)
  }
  visit(value)
}

export async function requestLibrary<T>(method: LibraryMethod, path: string, query?: LibraryQuery, body?: unknown, sourceId?: string): Promise<T> {
  // Capture ownership before awaiting: browsing a new source cannot relabel an in-flight response.
  const provider = getLibraryProvider(sourceId)
  const online = provider.source.kind === 'local' ? await handleNativeOnlineRequest(provider, method, path, query, body) : { handled: false as const }
  const raw = online.handled ? online.data : await provider.request<unknown>(method, path, query, body)
  const data = annotateEntities(raw, provider)
  if (provider.source.platform === 'android') await prepareAndroidCovers(data)
  return data as T
}

export function getTrackSourceId(track: Pick<TrackOut, 'source_id'>): string {
  return track.source_id ?? SAME_ORIGIN_SOURCE.id
}

export function trackIdentity(track: Pick<TrackOut, 'id' | 'source_id' | 'local_key'>): string {
  return sourceIdentity(track)
}

export function getTrackMediaUrl(track: Pick<TrackOut, 'id' | 'source_id' | 'playback_url'>): string {
  return track.playback_url || getLibraryProvider(getTrackSourceId(track)).mediaUrl(track.id, 'track')
}

export function getLibraryMediaUrl(id: number, kind: LibraryMediaKind, sourceId?: string): string {
  return getLibraryProvider(sourceId).mediaUrl(id, kind)
}

export function getLibraryWebSocketUrl(): string | null {
  const source = getActiveLibrarySource()
  if (source.kind === 'local' || typeof location === 'undefined') return null
  const base = new URL(source.baseUrl ?? '/api', location.href)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  base.pathname = base.pathname.replace(/\/api\/?$/, '/ws')
  return base.toString()
}

export function getLocalLibraryPermission(): Promise<LibraryPermission> {
  return requestLibrary('GET', '/library/permission')
}

export function requestLocalLibraryPermission(): Promise<LibraryPermission> {
  return requestLibrary('POST', '/library/permission')
}

export async function openLocalPermissionSettings(): Promise<void> {
  if (getRuntimePlatform() !== 'android') return
  const { plugin } = await androidBridge()
  await plugin.openSettings()
}

export function getLibraryScanProgress(): Promise<LibraryScanProgress> {
  return requestLibrary('GET', '/library/progress')
}

export function cancelLibraryScan(): Promise<void> {
  return requestLibrary('POST', '/library/cancel')
}

export async function pickLocalMusicFolder(): Promise<{ added: number; updated: number; errors: number; cancelled?: boolean }> {
  return requestLibrary('POST', '/library/pick')
}
