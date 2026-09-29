import assert from "node:assert/strict"
import test from "node:test"
import { wordFillProgress } from "./lyricAnimation.ts"

test("word fill respects timestamp boundaries", () => {
  assert.equal(wordFillProgress(0.9, 1, 2), 0)
  assert.equal(wordFillProgress(2, 1, 2), 1)
  const midpoint = wordFillProgress(1.5, 1, 2)
  assert.ok(midpoint > 0.5 && midpoint < 0.7)
})

test("a held syllable fills more slowly for the same elapsed time", () => {
  const shortSyllable = wordFillProgress(1.25, 1, 1.5)
  const heldSyllable = wordFillProgress(1.25, 1, 2)
  assert.ok(heldSyllable < shortSyllable)
})

test("a syllable only completes at its explicit end boundary", () => {
  assert.ok(wordFillProgress(1.499, 1, 1.5) < 1)
  assert.equal(wordFillProgress(1.5, 1, 1.5), 1)
  assert.equal(wordFillProgress(0.99, 1, 1.5), 0)
})
