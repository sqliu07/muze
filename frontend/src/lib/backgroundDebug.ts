export interface BackgroundDebugSettings {
  intensity: number
  speed: number
  audioReactive: boolean
}

export interface BackgroundRhythmSnapshot {
  bpm: number | null
  energy: number
  pulse: number
  speedMultiplier: number
  intensityMultiplier: number
}

interface BackgroundDebugApi {
  get: () => BackgroundDebugSettings
  set: (patch: Partial<BackgroundDebugSettings>) => BackgroundDebugSettings
  setIntensity: (value: number) => BackgroundDebugSettings
  setSpeed: (value: number) => BackgroundDebugSettings
  setAudioReactive: (value: boolean) => BackgroundDebugSettings
  getRhythm: () => BackgroundRhythmSnapshot
  reset: () => BackgroundDebugSettings
}

declare global {
  interface Window {
    muzeBackgroundDebug: BackgroundDebugApi
  }
}

const STORAGE_KEY = "muze-background-debug"
export const DEFAULT_BACKGROUND_DEBUG: BackgroundDebugSettings = {
  intensity: 1.3,
  speed: 1,
  audioReactive: true,
}
export const DEFAULT_BACKGROUND_RHYTHM: BackgroundRhythmSnapshot = {
  bpm: null,
  energy: 0,
  pulse: 0,
  speedMultiplier: 1,
  intensityMultiplier: 1,
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function normalizeBackgroundDebugSettings(
  value: Partial<BackgroundDebugSettings> | null | undefined
): BackgroundDebugSettings {
  const intensity = Number(value?.intensity)
  const speed = Number(value?.speed)
  return {
    intensity: clamp(
      Number.isFinite(intensity) ? intensity : DEFAULT_BACKGROUND_DEBUG.intensity,
      0,
      2
    ),
    speed: clamp(Number.isFinite(speed) ? speed : 1, 0.25, 3),
    audioReactive: typeof value?.audioReactive === "boolean"
      ? value.audioReactive
      : DEFAULT_BACKGROUND_DEBUG.audioReactive,
  }
}

function readSettings(): BackgroundDebugSettings {
  if (typeof window === "undefined") return { ...DEFAULT_BACKGROUND_DEBUG }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return normalizeBackgroundDebugSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_BACKGROUND_DEBUG }
  }
}

let settings = readSettings()
const listeners = new Set<(value: BackgroundDebugSettings) => void>()
let rhythm = { ...DEFAULT_BACKGROUND_RHYTHM }
const rhythmListeners = new Set<(value: BackgroundRhythmSnapshot) => void>()

function publish(next: BackgroundDebugSettings): BackgroundDebugSettings {
  settings = next
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  listeners.forEach((listener) => listener({ ...next }))
  return { ...next }
}

export function getBackgroundDebugSettings(): BackgroundDebugSettings {
  return { ...settings }
}

export function setBackgroundDebugSettings(
  patch: Partial<BackgroundDebugSettings>
): BackgroundDebugSettings {
  return publish(normalizeBackgroundDebugSettings({ ...settings, ...patch }))
}

export function resetBackgroundDebugSettings(): BackgroundDebugSettings {
  return publish({ ...DEFAULT_BACKGROUND_DEBUG })
}

export function subscribeBackgroundDebugSettings(
  listener: (value: BackgroundDebugSettings) => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getBackgroundRhythmSnapshot(): BackgroundRhythmSnapshot {
  return { ...rhythm }
}

export function setBackgroundRhythmSnapshot(
  value: BackgroundRhythmSnapshot
): BackgroundRhythmSnapshot {
  rhythm = { ...value }
  rhythmListeners.forEach((listener) => listener({ ...rhythm }))
  return { ...rhythm }
}

export function subscribeBackgroundRhythmSnapshot(
  listener: (value: BackgroundRhythmSnapshot) => void
): () => void {
  rhythmListeners.add(listener)
  return () => rhythmListeners.delete(listener)
}

if (typeof window !== "undefined") {
  window.muzeBackgroundDebug = {
    get: getBackgroundDebugSettings,
    set: setBackgroundDebugSettings,
    setIntensity: (intensity) => setBackgroundDebugSettings({ intensity }),
    setSpeed: (speed) => setBackgroundDebugSettings({ speed }),
    setAudioReactive: (audioReactive) => setBackgroundDebugSettings({ audioReactive }),
    getRhythm: getBackgroundRhythmSnapshot,
    reset: resetBackgroundDebugSettings,
  }
}
