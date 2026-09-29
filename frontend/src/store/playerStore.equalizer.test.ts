import assert from "node:assert/strict"
import test from "node:test"
import {
  clampGain,
  createEqualizerState,
  equalizerPreampDb,
  EQUALIZER_PRESETS,
  normalizeEqualizerState,
} from "../lib/equalizer.ts"

test("all presets retain ten gains and independent band state", () => {
  for (const preset of Object.keys(EQUALIZER_PRESETS) as (keyof typeof EQUALIZER_PRESETS)[]) {
    const state = createEqualizerState(preset, true)
    assert.equal(state.enabled, true)
    assert.deepEqual(state.bands.map((band) => band.gain), [...EQUALIZER_PRESETS[preset]])
    state.bands[0].gain = 12
    assert.equal(createEqualizerState(preset).bands[0].gain, EQUALIZER_PRESETS[preset][0])
  }
})

test("custom persistence retains gains by frequency, independent of array order", () => {
  const result = normalizeEqualizerState({ enabled: true, preset: "custom", preamp: -4, bands: [{ frequency: 16000, gain: 4 }, { frequency: 32, gain: -3 }] })
  assert.equal(result.preset, "custom")
  assert.equal(result.preamp, -4)
  assert.equal(result.bands[0].gain, -3)
  assert.equal(result.bands[9].gain, 4)
  assert.equal(result.bands.length, 10)
})

test("EQ gain is bounded and missing persistence defaults to neutral", () => {
  assert.equal(clampGain(40), 12)
  assert.equal(clampGain(-40), -12)
  assert.deepEqual(normalizeEqualizerState(null), createEqualizerState())
})

test("boosted presets reserve headroom while bypass remains unity", () => {
  const boosted = createEqualizerState("bass", true)
  assert.ok(equalizerPreampDb(boosted, 48_000) < -1)
  assert.equal(equalizerPreampDb({ ...boosted, enabled: false }, 48_000), 0)
})
