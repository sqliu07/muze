import type { TrackOut } from '../../types/api'
import type { EqualizerState } from '../../lib/equalizer'

export type PlaybackMode = 'sequential' | 'repeat-all' | 'repeat-one' | 'shuffle'
export interface PlaybackCapabilities { equalizer: boolean; spectrum: boolean; backgroundPlayback: boolean }
export interface ResolvedPlaybackTrack {
  id: number
  source_id: string
  local_key?: string
  playback_url: string
}
export interface PlaybackSnapshot {
  index: number
  position: number
  duration: number
  isPlaying: boolean
  mode: PlaybackMode
  generation?: number
  error?: string | null
  ended?: boolean
  tracks?: TrackOut[]
  equalizer?: EqualizerState
  /** Identity-only acknowledgement, never a request to reload the queue or clock. */
  resolvedTracks?: ResolvedPlaybackTrack[]
  /** Surviving row positions in the original submitted queue, in ascending order. */
  resolvedIndices?: number[]
  /** Submitted selected row mapped into the surviving queue. */
  resolvedIndex?: number
  /** Engine-only ACK context: original selection and latest native mapped selection. */
  requestedIndex?: number
  resolvedCurrentIndex?: number
}
export interface PlaybackAnalysisFrame {
  spectrumData: Uint8Array
  sampleRate: number
  generation: number
  index: number
  sequence: number
  position: number
}
export interface PlaybackQueue { tracks: TrackOut[]; index: number; position: number; mode: PlaybackMode; generation: number }
export interface PlaybackEngine {
  readonly capabilities: PlaybackCapabilities
  readonly ownsQueue: boolean
  initialize(): Promise<void>
  setQueue(queue: PlaybackQueue): Promise<void>
  play(): Promise<void>
  pause(): void | Promise<void>
  seek(position: number): void | Promise<void>
  setVolume(volume: number): void | Promise<void>
  setMode(mode: PlaybackMode): void | Promise<void>
  setEqualizer(equalizer: EqualizerState): void | Promise<void>
  getPosition(): number
  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void
  /** Native PCM analysis. Null clears visuals after pause, seek or a source change. */
  subscribeAnalysis?(listener: (frame: PlaybackAnalysisFrame | null) => void): () => void
}
