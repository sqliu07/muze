import assert from "node:assert/strict"
import test from "node:test"
import { bassEnergy, logarithmicBins, sampleSpectrum } from "./spectrum.ts"

test("logarithmic bins increase monotonically within the FFT range", () => {
  const bins = logarithmicBins(1024, 48_000, 64)
  assert.equal(bins.length, 64)
  assert.ok(bins[0] >= 0)
  assert.ok(bins[bins.length - 1] <= 1023)
  for (let index = 1; index < bins.length; index += 1) {
    assert.ok(bins[index] > bins[index - 1])
  }
})

test("spectrum samples interpolate and normalize byte values", () => {
  assert.equal(sampleSpectrum(Uint8Array.from([0, 255]), 0.5), 0.5)
  assert.equal(sampleSpectrum(new Uint8Array(0), 1), 0)
})

test("bass energy reads only low-frequency bins", () => {
  const data = new Uint8Array(1024)
  data.fill(255, 1, 7)
  assert.ok(bassEnergy(data, 48_000) > 0)
  data.fill(0)
  data[500] = 255
  assert.equal(bassEnergy(data, 48_000), 0)
})
