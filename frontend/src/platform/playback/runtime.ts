import type { PlaybackEngine } from '../contracts/playback'
import { getRuntimePlatform } from '../runtime'
import { AndroidPlaybackEngine } from './androidEngine'
import { WebAudioEngine } from './webAudioEngine'

let engine: PlaybackEngine | undefined
export function getPlaybackEngine(): PlaybackEngine {
  if (!engine) engine = getRuntimePlatform() === 'android' ? new AndroidPlaybackEngine() : new WebAudioEngine()
  return engine
}
export function getPlaybackCapabilities() {
  return { equalizer: true, spectrum: true, backgroundPlayback: true }
}
