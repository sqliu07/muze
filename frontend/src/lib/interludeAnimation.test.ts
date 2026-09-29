import assert from "node:assert/strict"
import test from "node:test"
import { interludeDotVisual, resolveInterludeMotion } from "./interludeAnimation.ts"

const timing = {
  interludeStart: 101.228,
  nextLineTime: 112.264,
  hideBefore: 2,
  exitDuration: 1.45,
  breatheDuration: 4.4,
}

test("interlude phases follow audio time and collapse only after dots disappear", () => {
  assert.equal(resolveInterludeMotion({ ...timing, currentTime: 101 }).phase, "hidden")
  assert.equal(resolveInterludeMotion({ ...timing, currentTime: 108 }).phase, "active")

  const exitStart = resolveInterludeMotion({ ...timing, currentTime: 110.264 })
  assert.equal(exitStart.phase, "exiting")
  assert.equal(exitStart.exitProgress, 0)

  const exitEnd = resolveInterludeMotion({ ...timing, currentTime: 111.714 })
  assert.equal(exitEnd.phase, "collapsing")
  assert.equal(exitEnd.exitProgress, 1)
  assert.equal(exitEnd.collapseProgress, 0)

  const after = resolveInterludeMotion({ ...timing, currentTime: 112.264 })
  assert.equal(after.phase, "hidden")
})

test("exit performs slow expansion, faster recoil, then disappears at minimum scale", () => {
  const visual = (progress: number) => interludeDotVisual({
    phase: "exiting",
    breathPhase: 0,
    exitProgress: progress,
    scaleMin: 0.9,
    scaleMax: 1.22,
  })

  assert.deepEqual(visual(0), { scale: 1, opacity: 0.62 })
  assert.deepEqual(visual(0.64), { scale: 1.22, opacity: 0.94 })
  assert.deepEqual(visual(1), { scale: 0.9, opacity: 0.62 })
  assert.ok(visual(0.9).scale > visual(0.99).scale)

  assert.deepEqual(interludeDotVisual({
    phase: "collapsing",
    breathPhase: 0,
    exitProgress: 1,
    scaleMin: 0.9,
    scaleMax: 1.22,
  }), { scale: 0.9, opacity: 0 })
})

test("active breathing reaches a neutral scale at the exit boundary", () => {
  const justBeforeExit = resolveInterludeMotion({ ...timing, currentTime: 110.263 })
  const visual = interludeDotVisual({
    phase: justBeforeExit.phase,
    breathPhase: justBeforeExit.breathPhase,
    exitProgress: justBeforeExit.exitProgress,
    scaleMin: 0.9,
    scaleMax: 1.22,
  })
  assert.ok(Math.abs(visual.scale - 1) < 0.001)
})
