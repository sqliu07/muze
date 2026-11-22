import { useEffect, useCallback } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { getPlaybackEngine } from '@/platform/playback/runtime'
import { WebAudioEngine } from '@/platform/playback/webAudioEngine'
import type { PlaybackSnapshot } from '@/platform/contracts/playback'
import { trackIdentity } from '@/platform/library'

let attached = false
let lastRequest = -1
let command = Promise.resolve()
let applyingCommand = false
let failedNativeGeneration: number | null = null
const failed = new Set<string>()

function syncSnapshot(snapshot: PlaybackSnapshot) {
  const state = usePlayerStore.getState()
  if (getPlaybackEngine().ownsQueue && snapshot.resolvedTracks) {
    if (snapshot.generation === state.playbackRequest) state.applyNativeQueueIdentities(snapshot)
    return
  }
  if (getPlaybackEngine().ownsQueue && lastRequest < 0 && state.playbackRequest === 0 && snapshot.equalizer) state.restoreNativeEqualizer(snapshot.equalizer)
  if (getPlaybackEngine().ownsQueue && lastRequest < 0 && state.playbackRequest === 0 && snapshot.tracks?.length) {
    lastRequest = snapshot.generation ?? 0
    state.restoreNativePlayback(snapshot)
    return
  }
  if (snapshot.generation !== undefined && snapshot.generation !== state.playbackRequest) return
  if (snapshot.error) {
    if (getPlaybackEngine().ownsQueue) { state.setPlaybackError(snapshot.error); state.applyPlaybackSnapshot(snapshot); return }
    const track = state.queue[state.currentIndex]
    const identity = track ? trackIdentity(track) : `${state.playbackRequest}:${state.currentIndex}`
    if (!failed.has(identity)) {
      failed.add(identity)
      state.setPlaybackError(snapshot.error)
      if (state.playMode !== 'repeat-one' && failed.size < state.queue.length) state.playNext()
      else state.setPlaying(false)
    } else state.setPlaying(false)
    return
  }
  if (snapshot.ended && !getPlaybackEngine().ownsQueue) { failed.clear(); state.playNext(); return }
  if (snapshot.isPlaying && state.playbackError) state.setPlaybackError(null)
  if (getPlaybackEngine().ownsQueue) state.applyPlaybackSnapshot(applyingCommand ? { ...snapshot, isPlaying: state.isPlaying } : snapshot)
  else state.setCurrentTime(snapshot.position)
}

export function seekAudio(time: number) {
  const safe = Math.max(0, Number.isFinite(time) ? time : 0)
  usePlayerStore.getState().setCurrentTime(safe)
  void Promise.resolve(getPlaybackEngine().seek(safe)).catch(() => usePlayerStore.getState().setPlaybackError('无法跳转到该播放位置。'))
}
export function getAudioElement(): HTMLAudioElement | null { const engine = getPlaybackEngine(); return engine instanceof WebAudioEngine ? engine.audio : null }
export function getAudioAnalyserNode(): AnalyserNode | null { const engine = getPlaybackEngine(); return engine instanceof WebAudioEngine ? engine.getAnalyser() : null }
export function getAudioCurrentTime(): number { return getPlaybackEngine().getPosition() }

export function useAudio() {
  const queue = usePlayerStore((state) => state.queue)
  const queueCommandDependency = getPlaybackEngine().ownsQueue ? null : queue
  const playbackRequest = usePlayerStore((state) => state.playbackRequest)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const volume = usePlayerStore((state) => state.volume)
  const equalizer = usePlayerStore((state) => state.equalizer)
  const mode = usePlayerStore((state) => state.playMode)
  useEffect(() => { if (isPlaying) failed.clear() }, [isPlaying])
  useEffect(() => { failed.clear() }, [queue])
  useEffect(() => {
    const engine = getPlaybackEngine()
    if (!attached) {
      attached = true
      engine.subscribe(syncSnapshot)
      if (typeof navigator !== 'undefined' && navigator.mediaSession && !engine.ownsQueue) {
        navigator.mediaSession.setActionHandler('play', () => usePlayerStore.getState().setPlaying(true))
        navigator.mediaSession.setActionHandler('pause', () => usePlayerStore.getState().setPlaying(false))
        navigator.mediaSession.setActionHandler('nexttrack', () => usePlayerStore.getState().playNext())
        navigator.mediaSession.setActionHandler('previoustrack', () => usePlayerStore.getState().playPrev())
        navigator.mediaSession.setActionHandler('seekto', (event) => seekAudio(event.seekTime ?? 0))
      }
    }
    let attemptedGeneration = playbackRequest
    command = command.catch(() => {}).then(async () => {
      await engine.initialize()
      const state = usePlayerStore.getState()
      attemptedGeneration = state.playbackRequest
      // A failed native command stops until an explicit Play request. The pause
      // rerender and queued metadata changes must not retry an unavailable file.
      if (engine.ownsQueue && failedNativeGeneration === state.playbackRequest) {
        if (!state.isPlaying) return
        failedNativeGeneration = null
      }
      applyingCommand = true
      try {
      if (lastRequest !== state.playbackRequest) {
        await engine.setQueue({ tracks: state.queue, index: state.currentIndex, position: state.currentTime, mode: state.playMode, generation: state.playbackRequest })
        lastRequest = state.playbackRequest
      }
      const latest = usePlayerStore.getState()
      if (latest.playbackRequest !== state.playbackRequest) return
      if (latest.isPlaying) await engine.play()
      else await engine.pause()
      } finally { applyingCommand = false }
    }).catch((error: unknown) => {
      if (usePlayerStore.getState().playbackRequest !== attemptedGeneration) return
      if (engine.ownsQueue) failedNativeGeneration = attemptedGeneration
      const message = engine.ownsQueue && error instanceof Error && error.message.trim().length <= 500 && !/[<>]/.test(error.message) && [...error.message].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127) ? error.message.trim() : ''
      usePlayerStore.getState().setPlaybackError(message || '无法开始播放，请检查文件或媒体权限。')
      usePlayerStore.getState().setPlaying(false)
    })
  }, [queueCommandDependency, playbackRequest, isPlaying])
  useEffect(() => { void getPlaybackEngine().setVolume(volume) }, [volume])
  useEffect(() => {
    let active = true
    void Promise.resolve().then(async () => {
      const engine = getPlaybackEngine()
      await engine.initialize()
      if (active) await engine.setEqualizer(usePlayerStore.getState().equalizer)
    }).catch(() => { if (active) usePlayerStore.getState().setPlaybackError('无法应用均衡器设置。') })
    return () => { active = false }
  }, [equalizer])
  useEffect(() => { void getPlaybackEngine().setMode(mode) }, [mode])
  const seek = useCallback((time: number) => seekAudio(time), [])
  return { audio: getAudioElement(), seek }
}
