import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_BACKGROUND_DEBUG,
  normalizeBackgroundDebugSettings,
} from "./backgroundDebug.ts"

test("background debug settings clamp unsafe values", () => {
  assert.deepEqual(
    normalizeBackgroundDebugSettings({ intensity: 99, speed: 0 }),
    { intensity: 2, speed: 0.25, audioReactive: true }
  )
  assert.deepEqual(normalizeBackgroundDebugSettings(null), DEFAULT_BACKGROUND_DEBUG)
})
