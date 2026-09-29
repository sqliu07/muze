export type EqualizerPresetName = keyof typeof EQUALIZER_PRESETS
export type EqualizerPreset = EqualizerPresetName | "custom"

export interface EqualizerBand {
  frequency: number
  label: string
  gain: number
}

export interface EqualizerState {
  enabled: boolean
  preset: EqualizerPreset
  preamp: number
  bands: EqualizerBand[]
}

export const DEFAULT_EQUALIZER_BANDS: EqualizerBand[] = [
  { frequency: 32, label: "32", gain: 0 },
  { frequency: 64, label: "64", gain: 0 },
  { frequency: 125, label: "125", gain: 0 },
  { frequency: 250, label: "250", gain: 0 },
  { frequency: 500, label: "500", gain: 0 },
  { frequency: 1000, label: "1k", gain: 0 },
  { frequency: 2000, label: "2k", gain: 0 },
  { frequency: 4000, label: "4k", gain: 0 },
  { frequency: 8000, label: "8k", gain: 0 },
  { frequency: 16000, label: "16k", gain: 0 },
]

export const EQUALIZER_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  vocal: [-2, -1, -1, 0, 2, 3, 2, 1, 0, -1],
  bass: [5, 4, 3, 2, 1, 0, -1, -1, -2, -2],
  rock: [3, 3, 2, 1, -1, -1, 1, 2, 3, 3],
  pop: [-1, 1, 2, 2, 1, 0, 0, 1, 2, 2],
  jazz: [2, 1, 1, 1, 0, 0, 1, 1, 2, 2],
  classical: [2, 2, 1, 0, 0, 0, 0, 1, 2, 2],
  electronic: [4, 3, 2, 0, -1, 0, 1, 2, 3, 4],
  acoustic: [1, 2, 1, 1, 0, 1, 2, 2, 1, 1],
  treble: [-3, -2, -2, -1, 0, 1, 2, 3, 4, 4],
} as const

export const EQUALIZER_PRESET_PREAMPS: Record<EqualizerPresetName, number> = {
  flat: 0,
  vocal: -2,
  bass: -4,
  rock: -3,
  pop: -2,
  jazz: -2,
  classical: -2,
  electronic: -4,
  acoustic: -2,
  treble: -3,
}

export function createEqualizerState(
  preset: EqualizerPresetName = "flat",
  enabled = false
): EqualizerState {
  return {
    enabled,
    preset,
    preamp: EQUALIZER_PRESET_PREAMPS[preset],
    bands: DEFAULT_EQUALIZER_BANDS.map((band, index) => ({
      ...band,
      gain: EQUALIZER_PRESETS[preset][index] ?? 0,
    })),
  }
}

export function clampGain(gain: number): number {
  return Number.isFinite(gain) ? Math.max(-12, Math.min(12, gain)) : 0
}

export function normalizeEqualizerState(value: unknown): EqualizerState {
  if (!value || typeof value !== "object") {
    return createEqualizerState()
  }
  const maybe = value as Partial<EqualizerState>
  const preset =
    typeof maybe.preset === "string" && Object.prototype.hasOwnProperty.call(EQUALIZER_PRESETS, maybe.preset)
      ? (maybe.preset as EqualizerPresetName)
      : "flat"
  const normalized = createEqualizerState(preset, Boolean(maybe.enabled))
  normalized.preamp = clampGain(Number(maybe.preamp ?? normalized.preamp))

  if (Array.isArray(maybe.bands)) {
    normalized.preset = maybe.preset === "custom" ? "custom" : normalized.preset
    normalized.bands = normalized.bands.map((defaultBand) => {
      const saved = maybe.bands?.find(
        (band) => band && typeof band === "object" && band.frequency === defaultBand.frequency
      )
      return {
        ...defaultBand,
        gain: clampGain(Number(saved?.gain ?? defaultBand.gain)),
      }
    })
  }

  return normalized
}

/** Peak of the cascaded peaking filters (Q = 0.85), including overlapping bands. */
export function equalizerPeakDb(bands: EqualizerBand[], sampleRate: number): number {
  const coefficients = bands.map(({ frequency, gain }) => {
    const amplitude = 10 ** (clampGain(gain) / 40)
    const omega = 2 * Math.PI * Math.min(frequency, sampleRate / 2 - 1) / sampleRate
    const alpha = Math.sin(omega) / (2 * 0.85)
    return [1 + alpha * amplitude, -2 * Math.cos(omega), 1 - alpha * amplitude,
      1 + alpha / amplitude, -2 * Math.cos(omega), 1 - alpha / amplitude]
  })
  let peak = 0
  for (let i = 0; i <= 1024; i++) {
    const frequency = 10 * (sampleRate / 20) ** (i / 1024)
    const omega = 2 * Math.PI * frequency / sampleRate
    const cos = Math.cos(omega)
    const sin = Math.sin(omega)
    const cos2 = Math.cos(2 * omega)
    const sin2 = Math.sin(2 * omega)
    let db = 0
    for (const [b0, b1, b2, a0, a1, a2] of coefficients) {
      const numerator = (b0 + b1 * cos + b2 * cos2) ** 2 + (b1 * sin + b2 * sin2) ** 2
      const denominator = (a0 + a1 * cos + a2 * cos2) ** 2 + (a1 * sin + a2 * sin2) ** 2
      db += 10 * Math.log10(Math.max(1e-20, numerator) / Math.max(1e-20, denominator))
    }
    peak = Math.max(peak, db)
  }
  return peak
}

export function equalizerPreampDb(equalizer: EqualizerState, sampleRate: number): number {
  if (!equalizer.enabled) return 0
  const peak = equalizerPeakDb(equalizer.bands, sampleRate)
  // Reserve 1 dB for interpolation/transients when boosting. Flat stays unity gain.
  return Math.min(equalizer.preamp, -peak - (peak > 0.01 ? 1 : 0))
}
