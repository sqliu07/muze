import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import type { PlaybackAnalysisFrame } from '../contracts/playback.ts'
import type { AudioAnalyserResult } from '../../hooks/useAudioAnalyser.ts'

async function analysisHarness(t: { after: (callback: () => void) => void }, native = true) {
  class Visibility extends EventTarget {
    hidden = false
    setHidden(value: boolean) { this.hidden = value; this.dispatchEvent(new Event('visibilitychange')) }
  }
  class Motion extends EventTarget {
    matches = false
    setReduced(value: boolean) { this.matches = value; this.dispatchEvent(new Event('change')) }
  }
  class Audio extends EventTarget { paused = true; ended = false }
  const document = new Visibility()
  const motion = new Motion()
  const audio = new Audio()
  const callbacks = new Map<number, FrameRequestCallback>()
  let frameId = 0
  let nativeListener: ((frame: PlaybackAnalysisFrame | null) => void) | undefined
  let starts = 0
  let stops = 0
  let audioReads = 0
  const engine = native ? {
    subscribeAnalysis(listener: (frame: PlaybackAnalysisFrame | null) => void) {
      nativeListener = listener
      starts++
      return () => { nativeListener = undefined; stops++ }
    },
  } : {}
  const node = { context: { state: 'running', sampleRate: 48000 }, frequencyBinCount: 1024, getByteFrequencyData(data: Uint8Array) { data.fill(128) } }
  const key = '__muzeAudioAnalysisTest'
  const previous = new Map(['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', key].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => motion } })
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { callbacks.set(++frameId, callback); return frameId } })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: (id: number) => callbacks.delete(id) })
  Object.defineProperty(globalThis, key, { configurable: true, value: { engine, getAudio: () => { audioReads++; return native ? null : audio }, node } })
  t.after(() => { previous.forEach((descriptor, name) => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name) }) })
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL('../../hooks/useAudioAnalyser.ts', import.meta.url))], alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name: 'audio-analysis-boundaries', setup(builder) {
      builder.onResolve({ filter: /^@\/(hooks\/useAudio|platform\/playback\/runtime)$/ }, ({ path }) => ({ path, namespace: 'analysis-test' }))
      builder.onLoad({ filter: /.*/, namespace: 'analysis-test' }, ({ path }) => ({ contents: path.endsWith('runtime')
        ? `const h=globalThis.${key}; export const getPlaybackEngine=()=>h.engine;`
        : `const h=globalThis.${key}; export const getAudioElement=h.getAudio; export const getAudioAnalyserNode=()=>h.node;`, loader: 'js' }))
    } }],
  })
  const module = { exports: {} }
  new Script(`(function(require,module,exports){${bundled.outputFiles[0].text}\n})`).runInThisContext()(createRequire(import.meta.url), module, module.exports)
  const { subscribeAudioAnalysis: subscribe } = module.exports as { subscribeAudioAnalysis: (listener: (frame: AudioAnalyserResult) => void) => () => void }
  return { subscribe, document, motion, audio, callbacks, starts: () => starts, stops: () => stops, audioReads: () => audioReads, emit: () => nativeListener?.({ spectrumData: new Uint8Array(1024).fill(128), sampleRate: 48000, generation: 1, index: 0, sequence: 1, position: 10 }) }
}

test('native spectrum shares one real PCM subscription and suspends for background and reduced motion', async (t) => {
  const harness = await analysisHarness(t)
  let latest: AudioAnalyserResult | undefined
  const stop = harness.subscribe((frame) => { latest = { ...frame } })
  const stopSecond = harness.subscribe(() => {})
  assert.equal(harness.starts(), 1)
  assert.equal(harness.audioReads(), 0, 'Android analysis must not request a Web Audio element')
  harness.emit()
  assert.equal(latest?.spectrumData.length, 1024)
  assert.ok(latest!.bassEnergy > 0)
  assert.ok(latest!.bassSmoothed > 0)
  harness.document.setHidden(true)
  assert.equal(harness.stops(), 1)
  assert.equal(latest?.bassEnergy, 0)
  assert.ok(latest!.spectrumData.every((bin) => bin === 0))
  harness.document.setHidden(false)
  assert.equal(harness.starts(), 2)
  harness.motion.setReduced(true)
  assert.equal(harness.stops(), 2)
  harness.motion.setReduced(false)
  assert.equal(harness.starts(), 3)
  stopSecond()
  assert.equal(harness.stops(), 2)
  stop()
  assert.equal(harness.stops(), 3)
  assert.equal(harness.callbacks.size, 0, 'native bridge ticks replace the Web RAF polling loop')
})

test('Web spectrum keeps its existing AudioContext polling and clears on pause', async (t) => {
  const harness = await analysisHarness(t, false)
  let latest: AudioAnalyserResult | undefined
  const stop = harness.subscribe((frame) => { latest = { ...frame } })
  assert.equal(harness.audioReads(), 1)
  assert.equal(harness.callbacks.size, 0)
  harness.audio.paused = false
  harness.audio.dispatchEvent(new Event('playing'))
  assert.equal(harness.callbacks.size, 1)
  const [id, tick] = harness.callbacks.entries().next().value!
  harness.callbacks.delete(id)
  tick(100)
  assert.equal(latest?.spectrumData.length, 1024)
  assert.ok(latest!.bassEnergy > 0)
  harness.audio.paused = true
  harness.audio.dispatchEvent(new Event('pause'))
  assert.equal(latest?.bassEnergy, 0)
  assert.equal(harness.callbacks.size, 0)
  assert.equal(harness.starts(), 0)
  stop()
})
