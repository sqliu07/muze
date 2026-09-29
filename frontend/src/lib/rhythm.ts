export interface RhythmInput {
  bassEnergy: number
  bassSmoothed: number
  spectrumData: Uint8Array
}

export interface RhythmState {
  bpm: number | null
  energy: number
  pulse: number
  speedMultiplier: number
  intensityMultiplier: number
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Lightweight onset/BPM tracker driven by bass energy and positive spectral flux. */
export class RhythmTracker {
  private previousSpectrum = new Uint8Array(0)
  private fastEnergy = 0
  private slowEnergy = 0
  private pulse = 0
  private lastTimestamp: number | null = null
  private lastBeatAt: number | null = null
  private beatIntervals: number[] = []
  private bpm: number | null = null

  update(input: RhythmInput, timestampMs: number): RhythmState {
    const elapsed = this.lastTimestamp === null
      ? 1 / 30
      : clamp((timestampMs - this.lastTimestamp) / 1000, 1 / 120, 0.2)
    this.lastTimestamp = timestampMs

    let flux = 0
    let samples = 0
    if (this.previousSpectrum.length !== input.spectrumData.length) {
      this.previousSpectrum = new Uint8Array(input.spectrumData.length)
    } else {
      for (let index = 1; index < input.spectrumData.length; index += 4) {
        const current = input.spectrumData[index]
        flux += Math.max(0, current - this.previousSpectrum[index]) / 255
        samples += 1
      }
    }
    this.previousSpectrum.set(input.spectrumData)
    const spectralFlux = samples ? clamp(flux / samples * 6) : 0
    const energy = clamp(
      input.bassSmoothed * 0.58 + input.bassEnergy * 0.22 + spectralFlux * 0.38
    )

    const fastAlpha = 1 - Math.exp(-elapsed / 0.08)
    const slowAlpha = 1 - Math.exp(-elapsed / 1.15)
    this.fastEnergy += (energy - this.fastEnergy) * fastAlpha
    this.slowEnergy += (energy - this.slowEnergy) * slowAlpha
    this.pulse *= Math.exp(-elapsed / 0.24)

    const onset = Math.max(0, this.fastEnergy - this.slowEnergy)
    const threshold = Math.max(0.035, this.slowEnergy * 0.2)
    const enoughSeparation = this.lastBeatAt === null || timestampMs - this.lastBeatAt >= 260
    if (onset > threshold && enoughSeparation) {
      if (this.lastBeatAt !== null) {
        const interval = timestampMs - this.lastBeatAt
        if (interval >= 280 && interval <= 1500) {
          this.beatIntervals.push(interval)
          if (this.beatIntervals.length > 8) this.beatIntervals.shift()
          const typicalInterval = median(this.beatIntervals)
          let bpm = 60_000 / typicalInterval
          while (bpm < 70) bpm *= 2
          while (bpm > 150) bpm /= 2
          this.bpm = bpm
        }
      }
      this.lastBeatAt = timestampMs
      this.pulse = 1
    } else {
      this.pulse = Math.max(this.pulse, clamp(onset * 3.5))
    }

    const speedMultiplier = this.bpm === null
      ? clamp(0.82 + this.slowEnergy * 0.9, 0.75, 1.4)
      : clamp(this.bpm / 108, 0.7, 1.75)
    const intensityMultiplier = clamp(
      0.82 + this.slowEnergy * 1.05 + this.pulse * 0.58,
      0.82,
      2
    )

    return {
      bpm: this.bpm,
      energy: this.slowEnergy,
      pulse: this.pulse,
      speedMultiplier,
      intensityMultiplier,
    }
  }
}
