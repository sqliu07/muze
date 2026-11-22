import assert from 'node:assert/strict'
import test from 'node:test'
import { AndroidAnalysisFrames, type NativeAnalysisFrame } from './androidAnalysis.ts'
import type { AndroidPlaybackSnapshot } from './androidTimeline.ts'

const state: AndroidPlaybackSnapshot = { generation: 3, index: 1, position: 40, duration: 180, isPlaying: true, isAdvancing: true, mode: 'sequential' }
const frame = (extra: Partial<NativeAnalysisFrame> = {}): NativeAnalysisFrame => ({ generation: 3, index: 1, sequence: 1, position: 40, sampleRate: 48000, spectrumData: Array(1024).fill(128), ...extra })

test('native FFT accepts exactly 1024 byte bins and reuses its validated buffer', () => {
  const frames = new AndroidAnalysisFrames()
  const first = frames.read(frame(), state)!
  assert.equal(first.spectrumData.length, 1024)
  assert.equal(first.spectrumData[0], 128)
  const second = frames.read(frame({ sequence: 2, spectrumData: Array(1024).fill(64) }), state)!
  assert.equal(second.spectrumData, first.spectrumData)
  assert.equal(first.spectrumData[0], 64)
})

test('native FFT discards malformed, nonfinite or out-of-range bridge data without poisoning sequence', () => {
  const frames = new AndroidAnalysisFrames()
  const malformed: unknown[] = [null, {}, frame({ sampleRate: Number.NaN }), frame({ sampleRate: 0 }), frame({ sampleRate: 999999 }), frame({ position: Number.POSITIVE_INFINITY }), frame({ position: -1 }), frame({ sequence: -1 }), frame({ sequence: 1.5 }), frame({ spectrumData: [] }), frame({ spectrumData: Array(1024).fill(256) }), frame({ spectrumData: Array(1024).fill(Number.NaN) }), frame({ spectrumData: Array(1024).fill(0.5) })]
  malformed.forEach((value) => assert.equal(frames.read(value, state), null))
  assert.ok(frames.read(frame(), state), 'an invalid frame must not consume a valid sequence number')
})

test('native FFT rejects old queues, other tracks, repeated packets and pre-seek positions', () => {
  const frames = new AndroidAnalysisFrames()
  assert.equal(frames.read(frame({ generation: 2 }), state), null)
  assert.equal(frames.read(frame({ index: 0 }), state), null)
  assert.equal(frames.read(frame({ position: 30 }), state), null)
  assert.ok(frames.read(frame(), state))
  assert.equal(frames.read(frame(), state), null)
  assert.equal(frames.read(frame({ sequence: 0 }), state), null)
  assert.ok(frames.read(frame({ sequence: 2, position: 40.12 }), state))
})

test('native FFT is never accepted while hidden, paused, buffering, ended or waiting for seek acknowledgement', () => {
  const frames = new AndroidAnalysisFrames()
  for (const snapshot of [{ ...state, isPlaying: false }, { ...state, isAdvancing: false }, { ...state, isBuffering: true }, { ...state, ended: true }, { ...state, error: 'unavailable' }]) assert.equal(frames.read(frame(), snapshot), null)
  assert.equal(frames.read(frame(), state, false), null)
  assert.ok(frames.read(frame(), state))
})
