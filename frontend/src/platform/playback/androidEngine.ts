import { registerPlugin, Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import type { PlaybackAnalysisFrame, PlaybackEngine, PlaybackQueue, PlaybackSnapshot, PlaybackMode } from '../contracts/playback'
import { getTrackStreamUrl } from '../../api/client'
import { AndroidPlaybackTimeline, type AndroidPlaybackSnapshot } from './androidTimeline'
import { AndroidAnalysisFrames, type NativeAnalysisFrame } from './androidAnalysis'
import { normalizeEqualizerState, type EqualizerState } from '../../lib/equalizer'
import { reconcileResolvedPlaybackQueue } from './nativeQueueAck'

interface NativeQueue {
  tracks: { id: number; title: string; artist: string; album: string; uri: string; artwork?: string; duration: number; source_id?: string; local_key?: string }[]
  index: number; position: number; mode: PlaybackMode; generation: number
}
export interface AndroidPlaybackBridge {
  setQueue(queue: NativeQueue): Promise<AndroidPlaybackSnapshot | void>
  play(): Promise<void>
  pause(): Promise<void>
  seek(options: { position: number }): Promise<void>
  setVolume(options: { volume: number }): Promise<void>
  setMode(options: { mode: PlaybackMode }): Promise<void>
  setEqualizer(options: EqualizerState): Promise<void>
  setAnalysisEnabled(options: { enabled: boolean }): Promise<void>
  getState(): Promise<AndroidPlaybackSnapshot>
  addListener(event: 'state', listener: (state: AndroidPlaybackSnapshot) => void): Promise<PluginListenerHandle>
  addListener(event: 'analysis', listener: (frame: NativeAnalysisFrame) => void): Promise<PluginListenerHandle>
}
export class AndroidPlaybackEngine implements PlaybackEngine {
  readonly capabilities = { equalizer: true, spectrum: true, backgroundPlayback: true }
  readonly ownsQueue = true
  private bridge: AndroidPlaybackBridge
  private state: AndroidPlaybackSnapshot = { index: -1, position: 0, duration: 0, isPlaying: false, mode: 'sequential' }
  private listeners = new Set<(snapshot: PlaybackSnapshot) => void>()
  private initialization: Promise<void> | null = null
  private timeline: AndroidPlaybackTimeline
  private revision = 0
  private commandRevision = 0
  private queueRevision = 0
  private stateRead = 0
  private analysisFrames = new AndroidAnalysisFrames()
  private analysisListeners = new Set<(frame: PlaybackAnalysisFrame | null) => void>()
  private analysisHandle: PluginListenerHandle | undefined
  private analysisEnabled = false
  private hasAnalysis = false
  private analysisCommand = Promise.resolve()
  private foreground = true
  constructor(bridge?: AndroidPlaybackBridge, now?: () => number) {
    this.bridge = bridge ?? registerPlugin<AndroidPlaybackBridge>('Playback')
    this.timeline = new AndroidPlaybackTimeline(now)
  }
  initialize(): Promise<void> {
    if (!this.initialization) this.initialization = this.connect().catch((error) => { this.initialization = null; throw error })
    return this.initialization
  }
  private async connect(): Promise<void> {
    const handle = await this.bridge.addListener('state', (state) => this.receive(state))
    try { await this.resync() } catch (error) { await handle.remove(); throw error }
    if (typeof document !== 'undefined') {
      this.timeline.setForeground(document.visibilityState !== 'hidden')
      this.foreground = document.visibilityState !== 'hidden'
      document.addEventListener('visibilitychange', () => {
        const foreground = document.visibilityState !== 'hidden'
        this.foreground = foreground
        if (!foreground) this.resetAnalysis()
        this.timeline.setForeground(foreground)
        if (foreground) void this.resync().catch(() => { /* The native event stream can recover independently. */ })
      })
    }
    if (typeof window !== 'undefined') window.addEventListener('focus', () => { void this.resync().catch(() => {}) })
  }
  private async resync(): Promise<void> {
    const revision = this.revision
    const commandRevision = this.commandRevision
    const read = ++this.stateRead
    const snapshot = await this.bridge.getState()
    if (read !== this.stateRead || commandRevision !== this.commandRevision) return
    if (revision !== this.revision) {
      // getState also restores the queue, but its delayed position must not rewind
      // a newer native event. Attach queue metadata only for the same generation.
      const sameQueue = snapshot.generation === this.state.generation
      const tracks = sameQueue && !this.state.tracks && snapshot.tracks ? this.mapTracks(snapshot.tracks) : undefined
      const equalizer = sameQueue && !this.state.equalizer ? snapshot.equalizer : undefined
      if (tracks || equalizer) {
        this.state = { ...this.state, ...(tracks ? { tracks } : {}), ...(equalizer ? { equalizer } : {}) }
        this.listeners.forEach((listener) => listener(this.state))
      }
      return
    }
    this.receive(snapshot)
  }
  private receive(state: AndroidPlaybackSnapshot): void {
    if (!state || !Number.isFinite(state.position) || !Number.isInteger(state.index) || typeof state.isPlaying !== 'boolean') return
    if (state.generation !== undefined && this.state.generation !== undefined && state.generation < this.state.generation) return
    if (state.sequence !== undefined && this.state.sequence !== undefined && state.sequence < this.state.sequence) return
    if (state.tracks) state = { ...state, tracks: this.mapTracks(state.tracks) }
    else if (state.generation === this.state.generation && this.state.tracks) state = { ...state, tracks: this.state.tracks }
    if (!state.equalizer && state.generation === this.state.generation && this.state.equalizer) state = { ...state, equalizer: this.state.equalizer }
    if (state.generation !== this.state.generation || state.index !== this.state.index || !state.isPlaying || state.isAdvancing === false || state.isBuffering || state.ended || state.error) this.resetAnalysis()
    this.revision++
    this.state = state
    this.timeline.update(state)
    this.listeners.forEach((listener) => listener(state))
  }
  private mapTracks(tracks: NonNullable<PlaybackSnapshot['tracks']>): NonNullable<PlaybackSnapshot['tracks']> {
    return tracks.map((track) => ({
      ...track,
      cover_url: nativeCover(track.cover_url),
      artist: track.artist ? { ...track.artist, cover_url: nativeCover(track.artist.cover_url) } : null,
      album: track.album ? { ...track.album, cover_url: nativeCover(track.album.cover_url) } : null,
    }))
  }
  async setQueue(queue: PlaybackQueue): Promise<void> {
    await this.initialize()
    this.commandRevision++
    const revision = ++this.queueRevision
    this.state = { ...this.state, generation: queue.generation, index: queue.index, position: queue.position, duration: queue.tracks[queue.index]?.duration ?? 0, isPlaying: false, isAdvancing: false, ended: false, error: null, tracks: this.mapTracks(queue.tracks) }
    this.timeline.update(this.state)
    this.resetAnalysis()
    const stateRevision = this.revision
    const acknowledgement = await this.bridge.setQueue({ ...queue, tracks: queue.tracks.map((track) => ({ id: track.id, title: track.title, artist: track.artist?.name ?? '', album: track.album?.title ?? '', uri: track.playback_url ?? getTrackStreamUrl(track.id, track.source_id), artwork: track.cover_url, duration: track.duration, source_id: track.source_id, local_key: track.local_key })) })
    if (revision !== this.queueRevision || this.state.generation !== queue.generation || acknowledgement?.generation !== queue.generation) return
    const resolved = reconcileResolvedPlaybackQueue(queue.tracks, queue.index, acknowledgement.resolvedTracks, acknowledgement.resolvedIndices, acknowledgement.resolvedIndex)
    if (!resolved || resolved.tracks === queue.tracks) return
    const nativeIndex = this.revision !== stateRevision && this.state.index >= 0 && this.state.index < resolved.tracks.length ? this.state.index : resolved.index
    this.state = { ...this.state, tracks: this.mapTracks(resolved.tracks), index: nativeIndex }
    // ACK metadata may be placeholders and its position may already be stale.
    // Preserve the current clock and communicate only the confirmed identities.
    this.listeners.forEach((listener) => listener({ ...this.state, resolvedTracks: acknowledgement.resolvedTracks, resolvedIndices: acknowledgement.resolvedIndices, resolvedIndex: acknowledgement.resolvedIndex, requestedIndex: queue.index, resolvedCurrentIndex: nativeIndex }))
  }
  async play(): Promise<void> { await this.initialize(); await this.bridge.play() }
  async pause(): Promise<void> {
    await this.initialize()
    this.commandRevision++
    this.state = { ...this.state, position: this.getPosition(), isAdvancing: false }
    this.timeline.update(this.state)
    this.resetAnalysis()
    await this.bridge.pause()
  }
  async seek(position: number): Promise<void> {
    await this.initialize()
    const safe = Math.max(0, Number.isFinite(position) ? position : 0)
    this.commandRevision++
    this.state = { ...this.state, position: safe, isAdvancing: false }
    this.timeline.update(this.state)
    this.resetAnalysis()
    await this.bridge.seek({ position: safe })
  }
  async setVolume(volume: number): Promise<void> { await this.initialize(); await this.bridge.setVolume({ volume }) }
  async setMode(mode: PlaybackMode): Promise<void> { await this.initialize(); await this.bridge.setMode({ mode }) }
  async setEqualizer(equalizer: EqualizerState): Promise<void> {
    await this.initialize()
    await this.bridge.setEqualizer(normalizeEqualizerState(equalizer))
  }
  getPosition(): number { return this.timeline.getPosition() }
  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  subscribeAnalysis(listener: (frame: PlaybackAnalysisFrame | null) => void): () => void {
    this.analysisListeners.add(listener)
    listener(null)
    this.reconcileAnalysis()
    return () => {
      this.analysisListeners.delete(listener)
      this.reconcileAnalysis()
    }
  }
  private resetAnalysis(): void {
    if (!this.hasAnalysis) return
    this.hasAnalysis = false
    this.analysisListeners.forEach((listener) => listener(null))
  }
  private reconcileAnalysis(): void {
    // Serialize setup and teardown so a rapid hide/show cannot leave native sampling
    // enabled without a consumer, or disable a newer subscription behind its back.
    this.analysisCommand = this.analysisCommand.catch(() => {}).then(async () => {
      if (this.analysisListeners.size) {
        await this.initialize()
        if (!this.analysisListeners.size) return
        if (!this.analysisHandle) this.analysisHandle = await this.bridge.addListener('analysis', (value) => {
          if (!this.analysisEnabled || !this.analysisListeners.size) return
          const frame = this.analysisFrames.read(value, this.state, this.foreground)
          if (frame) {
            this.hasAnalysis = true
            this.analysisListeners.forEach((listener) => listener(frame))
          }
        })
        if (this.analysisListeners.size) {
          if (!this.analysisEnabled) {
            await this.bridge.setAnalysisEnabled({ enabled: true })
            this.analysisEnabled = true
          }
          return
        }
      }
      try {
        if (this.analysisEnabled || this.analysisHandle) await this.bridge.setAnalysisEnabled({ enabled: false })
      } finally {
        this.analysisEnabled = false
        const handle = this.analysisHandle
        this.analysisHandle = undefined
        await handle?.remove()
      }
    }).catch((error) => {
      this.analysisEnabled = false
      this.resetAnalysis()
      // Visualization failure must not stop otherwise healthy native playback.
      console.warn('Native audio analysis is unavailable.', error)
    })
  }
}

function nativeCover(url: string | undefined): string | undefined {
  return url?.startsWith('file://') ? Capacitor.convertFileSrc(url) : url
}
