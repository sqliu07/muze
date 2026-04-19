import { useEffect, useCallback } from "react"
import { usePlayerStore, currentTrackSelector } from "@/store/playerStore"
import { getTrackStreamUrl } from "@/api/client"

// 全局唯一的 Audio 实例
const audio = new Audio()
let initialized = false
let previousTrackId: number | null = null
let pendingCanPlayHandler: (() => void) | null = null
let rafId: number | null = null
let lastSyncedTime = -1

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
  if (Math.abs(t - lastSyncedTime) >= 0.01) {
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

export function seekAudio(time: number) {
  audio.currentTime = time
  usePlayerStore.getState().setCurrentTime(time)
  lastSyncedTime = time
}

export function getAudioCurrentTime(): number {
  return Number.isFinite(audio.currentTime) ? audio.currentTime : 0
}

export function useAudio() {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
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

  const seek = useCallback(
    (time: number) => seekAudio(time),
    []
  )

  return { audio, seek }
}
