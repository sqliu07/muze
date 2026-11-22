import { useEffect, useState } from "react"
import { getAudioAnalyserNode, getAudioElement } from "@/hooks/useAudio"
import { bassEnergy as computeBassEnergy } from "@/lib/spectrum"
import { getPlaybackEngine } from "@/platform/playback/runtime"
import type { PlaybackEngine } from "@/platform/contracts/playback"

export interface AudioAnalyserResult {
  bassEnergy: number
  bassSmoothed: number
  /** Shared mutable buffer: read inside the frame callback, never copy every frame. */
  spectrumData: Uint8Array
  sampleRate: number
}

const frame: AudioAnalyserResult = {
  bassEnergy: 0, bassSmoothed: 0, spectrumData: new Uint8Array(0), sampleRate: 48000,
}
const listeners = new Set<(frame: AudioAnalyserResult) => void>()
let stopSampling: (() => void) | undefined

/** Native PCM frames already have a bounded sampling rate; do not poll a second player. */
function startNativeSampling(engine: PlaybackEngine): () => void {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
  let unsubscribe: (() => void) | undefined
  const notify = () => listeners.forEach((callback) => callback(frame))
  const clear = () => {
    frame.spectrumData.fill(0)
    frame.bassEnergy = 0
    frame.bassSmoothed = 0
    notify()
  }
  const update = () => {
    const enabled = !document.hidden && !motion.matches
    if (!enabled) {
      unsubscribe?.()
      unsubscribe = undefined
      clear()
    } else if (!unsubscribe) {
      unsubscribe = engine.subscribeAnalysis?.((next) => {
        if (!next) { clear(); return }
        frame.spectrumData = next.spectrumData
        frame.sampleRate = next.sampleRate
        frame.bassEnergy = computeBassEnergy(next.spectrumData, next.sampleRate)
        frame.bassSmoothed += (frame.bassEnergy - frame.bassSmoothed) * 0.35
        notify()
      })
    }
  }
  document.addEventListener("visibilitychange", update)
  motion.addEventListener("change", update)
  update()
  return () => {
    unsubscribe?.()
    document.removeEventListener("visibilitychange", update)
    motion.removeEventListener("change", update)
    clear()
  }
}

/** One polling loop for all visible consumers; no AudioContext is created by rendering. */
export function subscribeAudioAnalysis(listener: (frame: AudioAnalyserResult) => void): () => void {
  listeners.add(listener)
  const engine = getPlaybackEngine()
  if (!stopSampling && engine.subscribeAnalysis) stopSampling = startNativeSampling(engine)
  if (!stopSampling) {
    const audio = getAudioElement()
    if (!audio) {
      listener(frame)
      return () => listeners.delete(listener)
    }
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let raf: number | null = null
    let lastFrame = -Infinity
    let data = new Uint8Array(0)
    const notify = () => listeners.forEach((callback) => callback(frame))
    const canSample = () => !audio.paused && !audio.ended && !document.hidden && !motion.matches
    const tick = (now: number) => {
      raf = null
      if (!canSample()) return
      if (now - lastFrame >= 1000 / 30) {
        lastFrame = now
        const node = getAudioAnalyserNode()
        if (node && node.context.state === "running") {
          if (data.length !== node.frequencyBinCount) data = new Uint8Array(node.frequencyBinCount)
          node.getByteFrequencyData(data)
          frame.spectrumData = data
          frame.sampleRate = node.context.sampleRate
          frame.bassEnergy = computeBassEnergy(data, frame.sampleRate)
          frame.bassSmoothed += (frame.bassEnergy - frame.bassSmoothed) * 0.35
          notify()
        }
      }
      raf = requestAnimationFrame(tick)
    }
    const update = () => {
      if (raf !== null) cancelAnimationFrame(raf)
      raf = null
      if (canSample()) {
        lastFrame = -Infinity
        raf = requestAnimationFrame(tick)
      } else {
        data.fill(0)
        frame.bassEnergy = 0
        frame.bassSmoothed = 0
        notify()
      }
    }
    const events = ["playing", "pause", "ended", "emptied"] as const
    events.forEach((event) => audio.addEventListener(event, update))
    document.addEventListener("visibilitychange", update)
    motion.addEventListener("change", update)
    stopSampling = () => {
      if (raf !== null) cancelAnimationFrame(raf)
      events.forEach((event) => audio.removeEventListener(event, update))
      document.removeEventListener("visibilitychange", update)
      motion.removeEventListener("change", update)
      frame.spectrumData.fill(0)
      frame.bassEnergy = 0
      frame.bassSmoothed = 0
    }
    update()
  }
  listener(frame)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      stopSampling?.()
      stopSampling = undefined
    }
  }
}

/** Compatibility for prototype readouts. Canvas consumers subscribe without React state. */
export function useAudioAnalyser(active = true): AudioAnalyserResult {
  const [result, setResult] = useState<AudioAnalyserResult>(() => ({ ...frame }))
  useEffect(() => {
    if (!active) return
    let lastUpdate = -Infinity
    return subscribeAudioAnalysis((next) => {
      const now = performance.now()
      if (now - lastUpdate >= 100 || next.bassEnergy === 0) {
        lastUpdate = now
        setResult({ ...next })
      }
    })
  }, [active])
  return result
}

export default useAudioAnalyser
