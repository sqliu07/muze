import { useEffect, useCallback } from "react"
import {
  DEFAULT_EQUALIZER_BANDS,
  usePlayerStore,
  currentTrackSelector,
  type EqualizerState,
} from "@/store/playerStore"
import { getTrackStreamUrl } from "@/api/client"
import { equalizerPreampDb } from "@/lib/equalizer"

// 全局唯一的 Audio 实例
const audio = new Audio()
let audioContext: AudioContext | null = null
let mediaSourceNode: MediaElementAudioSourceNode | null = null
let preampNode: GainNode | null = null
let equalizerFilters: BiquadFilterNode[] | null = null
let limiterNode: DynamicsCompressorNode | null = null
let analyserNode: AnalyserNode | null = null
let initialized = false
let previousTrackId: number | null = null
let pendingCanPlayHandler: (() => void) | null = null
let rafId: number | null = null
let lastSyncedTime = -1
let equalizerConnected = false

function clearPendingCanPlayHandler() {
  if (pendingCanPlayHandler) {
    audio.removeEventListener("canplay", pendingCanPlayHandler)
    pendingCanPlayHandler = null
  }
}

function stopRafSync() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

function syncCurrentTimeFrame() {
  const t = audio.currentTime
  // 避免极小抖动引发无意义的全局状态更新
  if (Math.abs(t - lastSyncedTime) >= 0.1) {
    usePlayerStore.getState().setCurrentTime(t)
    lastSyncedTime = t
  }
  if (!audio.paused && !audio.ended) {
    rafId = requestAnimationFrame(syncCurrentTimeFrame)
  } else {
    stopRafSync()
  }
}

function startRafSync() {
  stopRafSync()
  rafId = requestAnimationFrame(syncCurrentTimeFrame)
}

function initializeAudio() {
  if (initialized) return
  initialized = true
  audio.preload = "auto"
  audio.addEventListener("playing", startRafSync)
  audio.addEventListener("pause", stopRafSync)

  audio.addEventListener("timeupdate", () => {
    if (audio.ended) {
      return
    }
    // 播放中由 RAF 驱动更平滑；timeupdate 仅作暂停/非 RAF 场景兜底，避免双通道抖动。
    const isPlaying = usePlayerStore.getState().isPlaying
    if (!isPlaying || rafId === null) {
      usePlayerStore.getState().setCurrentTime(audio.currentTime)
      lastSyncedTime = audio.currentTime
    }
  })
  audio.addEventListener("ended", () => {
    usePlayerStore.getState().playNext()
  })
  audio.addEventListener("error", () => {
    usePlayerStore.getState().setPlaying(false)
  })
}

function ensureAudioGraph(): void {
  const ctx = getAudioContext()
  if (mediaSourceNode) return

  mediaSourceNode = ctx.createMediaElementSource(audio)
  preampNode = ctx.createGain()
  preampNode.gain.value = 1
  equalizerFilters = DEFAULT_EQUALIZER_BANDS.map((band) => {
    const filter = ctx.createBiquadFilter()
    filter.type = "peaking"
    filter.frequency.value = Math.min(band.frequency, ctx.sampleRate / 2 - 1)
    filter.Q.value = 0.85
    filter.gain.value = 0
    return filter
  })
  limiterNode = ctx.createDynamicsCompressor()
  limiterNode.threshold.value = -1
  limiterNode.knee.value = 0
  limiterNode.ratio.value = 18
  limiterNode.attack.value = 0.003
  limiterNode.release.value = 0.16
  analyserNode = ctx.createAnalyser()
  analyserNode.fftSize = 2048
  analyserNode.smoothingTimeConstant = 0.4

  mediaSourceNode.connect(analyserNode)
  let previous: AudioNode = preampNode
  for (const filter of equalizerFilters) {
    previous.connect(filter)
    previous = filter
  }
  previous.connect(limiterNode)
  limiterNode.connect(analyserNode)
  analyserNode.connect(ctx.destination)
  applyEqualizer(usePlayerStore.getState().equalizer)
}

function applyEqualizer(equalizer: EqualizerState): void {
  if (!equalizerFilters) return
  if (mediaSourceNode && preampNode && analyserNode && equalizerConnected !== equalizer.enabled) {
    // A real bypass avoids the compressor's attenuation and look-ahead latency.
    mediaSourceNode.disconnect()
    mediaSourceNode.connect(equalizer.enabled ? preampNode : analyserNode)
    equalizerConnected = equalizer.enabled
  }
  if (preampNode) {
    const preampDb = equalizerPreampDb(equalizer, preampNode.context.sampleRate)
    const preampGain = Math.pow(10, preampDb / 20)
    preampNode.gain.setTargetAtTime(
      preampGain,
      preampNode.context.currentTime,
      0.01
    )
  }
  equalizerFilters.forEach((filter, index) => {
    const targetGain = equalizer.enabled ? equalizer.bands[index]?.gain ?? 0 : 0
    filter.gain.setTargetAtTime(targetGain, filter.context.currentTime, 0.01)
  })
}

export function seekAudio(time: number) {
  audio.currentTime = time
  usePlayerStore.getState().setCurrentTime(time)
  lastSyncedTime = time
}

export function getAudioElement(): HTMLAudioElement {
  return audio
}

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

export function getAudioAnalyserNode(): AnalyserNode | null {
  return analyserNode
}

export function getAudioCurrentTime(): number {
  return Number.isFinite(audio.currentTime) ? audio.currentTime : 0
}

export function useAudio() {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const equalizer = usePlayerStore((s) => s.equalizer)
  const trackId = usePlayerStore((s) => currentTrackSelector(s)?.id ?? null)
  const setPlaying = usePlayerStore((s) => s.setPlaying)

  useEffect(() => {
    initializeAudio()
  }, [])

  useEffect(() => {
    if (isPlaying) {
      startRafSync()
    } else {
      stopRafSync()
    }
    return () => {
      stopRafSync()
    }
  }, [isPlaying])

  // 曲目切换 + 播放/暂停（合并为一个 effect，避免双 play）
  useEffect(() => {
    if (trackId === null) return

    const isNewTrack = previousTrackId !== trackId
    previousTrackId = trackId

    if (isNewTrack) {
      clearPendingCanPlayHandler()
      stopRafSync()
      usePlayerStore.getState().setCurrentTime(0)
      lastSyncedTime = 0
      audio.src = getTrackStreamUrl(trackId)
      audio.load()
    }

    if (isPlaying) {
      const attemptPlay = () => {
        ensureAudioGraph()
        const ctx = getAudioContext()
        if (ctx.state === "suspended") {
          ctx.resume()
        }
        audio.play().catch(() => setPlaying(false))
      }
      if (isNewTrack) {
        // 避免 canplay 竞态：已可播则立即播放，否则等待一次 canplay。
        if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          attemptPlay()
        } else {
          pendingCanPlayHandler = () => {
            attemptPlay()
            clearPendingCanPlayHandler()
          }
          audio.addEventListener("canplay", pendingCanPlayHandler)
        }
      } else {
        attemptPlay()
      }
    } else {
      clearPendingCanPlayHandler()
      audio.pause()
    }
  }, [trackId, isPlaying, setPlaying])

  // 音量控制
  useEffect(() => {
    audio.volume = volume
  }, [volume])

  useEffect(() => {
    applyEqualizer(equalizer)
  }, [equalizer])

  const seek = useCallback(
    (time: number) => seekAudio(time),
    []
  )

  return { audio, seek }
}
