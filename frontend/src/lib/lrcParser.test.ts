import assert from "node:assert/strict"
import test from "node:test"
import { parseLrc } from "./lrcParser.ts"

test("verbatim LRC preserves explicit word end timestamps and gaps", () => {
  const [line] = parseLrc(
    "[00:01.000]长[00:02.400][00:02.800]音[00:03.200]"
  )
  assert.deepEqual(line.words, [
    { start: 1, end: 2.4, text: "长" },
    { start: 2.8, end: 3.2, text: "音" },
  ])
})

test("a word end timestamp can also be the next word start", () => {
  const [line] = parseLrc("[00:01.000]你[00:01.200]好[00:01.500]")
  assert.deepEqual(line.words, [
    { start: 1, end: 1.2, text: "你" },
    { start: 1.2, end: 1.5, text: "好" },
  ])
})
