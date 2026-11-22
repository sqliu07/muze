import type { PlaybackAnalysisFrame } from '../contracts/playback'
import type { AndroidPlaybackSnapshot } from './androidTimeline'

export interface NativeAnalysisFrame {
  generation: number
  index: number
  sequence: number
  position: number
  sampleRate: number
  spectrumData: number[]
}

/** Validate the bridge before reusing one mutable FFT buffer for all consumers. */
export class AndroidAnalysisFrames {
  private readonly spectrumData = new Uint8Array(1024)
  private lastSequence = -1

  read(value: unknown, state: AndroidPlaybackSnapshot, foreground = true): PlaybackAnalysisFrame | null {
    if (!foreground || !state.isPlaying || state.isAdvancing === false || state.isBuffering || state.ended || state.error || state.index < 0) return null
    if (!value || typeof value !== 'object') return null
    const frame = value as Partial<NativeAnalysisFrame>
    if (!Number.isSafeInteger(frame.generation) || frame.generation! < 0 || frame.generation !== state.generation || frame.index !== state.index) return null
    if (!Number.isSafeInteger(frame.sequence) || frame.sequence! < 0 || frame.sequence! <= this.lastSequence) return null
    if (typeof frame.position !== 'number' || !Number.isFinite(frame.position) || frame.position < 0 || Math.abs(frame.position - state.position) > 0.35) return null
    if (typeof frame.sampleRate !== 'number' || !Number.isFinite(frame.sampleRate) || frame.sampleRate < 8000 || frame.sampleRate > 384000) return null
    if (!Array.isArray(frame.spectrumData) || frame.spectrumData.length !== this.spectrumData.length || !frame.spectrumData.every((bin) => Number.isInteger(bin) && bin >= 0 && bin <= 255)) return null
    this.lastSequence = frame.sequence!
    this.spectrumData.set(frame.spectrumData)
    return { spectrumData: this.spectrumData, sampleRate: frame.sampleRate, position: frame.position, generation: frame.generation!, index: frame.index!, sequence: frame.sequence! }
  }
}
