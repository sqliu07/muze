import assert from "node:assert/strict"
import test from "node:test"
import { RhythmTracker } from "./rhythm.ts"

test("rhythm tracker estimates tempo from repeated spectral onsets", () => {
  const tracker = new RhythmTracker()
  const spectrum = new Uint8Array(128)
  let result = tracker.update(
    { bassEnergy: 0, bassSmoothed: 0, spectrumData: spectrum },
    0
  )

  for (let timestamp = 50; timestamp <= 5_000; timestamp += 50) {
    const onBeat = timestamp % 500 < 100
    spectrum.fill(onBeat ? 220 : 12)
    result = tracker.update(
      {
        bassEnergy: onBeat ? 0.95 : 0.05,
        bassSmoothed: onBeat ? 0.72 : 0.08,
        spectrumData: spectrum,
      },
      timestamp
    )
  }

  assert.ok(result.bpm !== null)
  assert.ok(result.bpm! >= 105 && result.bpm! <= 135)
  assert.ok(result.speedMultiplier >= 0.9)
})

test("rhythm tracker remains restrained for steady low energy", () => {
  const tracker = new RhythmTracker()
  const spectrum = new Uint8Array(128).fill(8)
  let result
  for (let timestamp = 0; timestamp <= 2_000; timestamp += 50) {
    result = tracker.update(
      { bassEnergy: 0.03, bassSmoothed: 0.03, spectrumData: spectrum },
      timestamp
    )
  }
  assert.ok(result!.pulse < 0.2)
  assert.ok(result!.intensityMultiplier < 1.1)
})
