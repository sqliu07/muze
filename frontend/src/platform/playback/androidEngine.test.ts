import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import type { AndroidPlaybackBridge, AndroidPlaybackEngine as AndroidEngine } from './androidEngine.ts'
import type { AndroidPlaybackSnapshot } from './androidTimeline.ts'
import type { TrackOut } from '../../types/api.ts'
import type { NativeAnalysisFrame } from './androidAnalysis.ts'
import type { PlaybackAnalysisFrame } from '../contracts/playback.ts'
import { createEqualizerState, type EqualizerState } from '../../lib/equalizer.ts'

const result = await build({ entryPoints: [fileURLToPath(new URL('./androidEngine.ts', import.meta.url))], alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false })
const module = { exports: {} }
new Script(`(function(require, module, exports) { ${result.outputFiles[0].text}\n})`).runInThisContext()(createRequire(import.meta.url), module, module.exports)
const { AndroidPlaybackEngine } = module.exports as { AndroidPlaybackEngine: typeof AndroidEngine }

function snapshot(extra: Partial<AndroidPlaybackSnapshot> = {}): AndroidPlaybackSnapshot {
  return { index: 0, position: 10, duration: 180, isPlaying: true, isAdvancing: true, mode: 'sequential', generation: 1, ...extra }
}

class Bridge implements AndroidPlaybackBridge {
  listener: ((state: AndroidPlaybackSnapshot) => void) | undefined
  analysisListener: ((frame: NativeAnalysisFrame) => void) | undefined
  analysisEnabled: boolean[] = []
  equalizers: EqualizerState[] = []
  queueAction: (queue: Parameters<AndroidPlaybackBridge['setQueue']>[0]) => Promise<AndroidPlaybackSnapshot | void> = async () => {}
  reads = 0
  current = snapshot()
  read: () => Promise<AndroidPlaybackSnapshot> = async () => this.current
  async addListener(event: 'state' | 'analysis', listener: ((state: AndroidPlaybackSnapshot) => void) | ((frame: NativeAnalysisFrame) => void)) {
    if (event === 'analysis') { this.analysisListener = listener as (frame: NativeAnalysisFrame) => void; return { remove: async () => { this.analysisListener = undefined } } }
    this.listener = listener as (state: AndroidPlaybackSnapshot) => void
    return { remove: async () => { this.listener = undefined } }
  }
  async getState() { this.reads++; return this.read() }
  async setQueue(queue: Parameters<AndroidPlaybackBridge['setQueue']>[0]) { return this.queueAction(queue) }
  async play() {}
  async pause() {}
  async seek() {}
  async setVolume() {}
  async setMode() {}
  async setEqualizer(equalizer: EqualizerState) { this.equalizers.push(equalizer) }
  async setAnalysisEnabled({ enabled }: { enabled: boolean }) { this.analysisEnabled.push(enabled) }
  emit(state: AndroidPlaybackSnapshot) { this.current = state; this.listener?.(state) }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

test('Android lyric frame clock advances between ticks and bounds a missing bridge stream', async () => {
  let time = 0
  const bridge = new Bridge()
  const engine = new AndroidPlaybackEngine(bridge, () => time)
  await engine.initialize()
  time = 16
  assert.equal(engine.getPosition(), 10.016)
  time = 50
  assert.equal(engine.getPosition(), 10.05)
  time = 100
  bridge.emit(snapshot({ position: 10.1 }))
  time = 150
  assert.equal(engine.getPosition(), 10.15)
  time = 30_000
  assert.equal(engine.getPosition(), 10.35, 'a missing event stream cannot fabricate continued playback')
})

function nativeFrame(sequence: number, extra: Partial<NativeAnalysisFrame> = {}): NativeAnalysisFrame {
  return { generation: 1, index: 0, sequence, position: 10, sampleRate: 48000, spectrumData: Array(1024).fill(128), ...extra }
}

const settle = async () => { await new Promise((resolve) => setImmediate(resolve)) }

test('Android forwards all ten equalizer bands and propagates a native DSP rejection to the caller', async () => {
  const bridge = new Bridge()
  const engine = new AndroidPlaybackEngine(bridge)
  const equalizer = createEqualizerState('bass', true)
  await engine.setEqualizer(equalizer)
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.equalizers[0])), equalizer)
  assert.equal(bridge.equalizers[0].bands.length, 10)
  assert.equal(engine.capabilities.equalizer, true)
  bridge.setEqualizer = async () => { throw new Error('DSP failed') }
  await assert.rejects(engine.setEqualizer(equalizer), /DSP failed/)
})

test('Android native FFT shares one bridge subscription and tears it down after the last consumer', async () => {
  const bridge = new Bridge()
  const engine = new AndroidPlaybackEngine(bridge)
  const seen: (PlaybackAnalysisFrame | null)[] = []
  const stop = engine.subscribeAnalysis((frame) => seen.push(frame))
  const stopSecond = engine.subscribeAnalysis(() => {})
  await settle()
  assert.deepEqual(bridge.analysisEnabled, [true])
  bridge.analysisListener?.(nativeFrame(1))
  assert.equal(seen[seen.length - 1]?.spectrumData.length, 1024)
  assert.equal(seen[seen.length - 1]?.spectrumData[0], 128)
  const before = seen.length
  bridge.analysisListener?.(nativeFrame(1))
  bridge.analysisListener?.(nativeFrame(2, { generation: 0 }))
  assert.equal(seen.length, before)
  stopSecond()
  await settle()
  assert.deepEqual(bridge.analysisEnabled, [true])
  stop()
  await settle()
  assert.deepEqual(bridge.analysisEnabled, [true, false])
  assert.equal(bridge.analysisListener, undefined)
})

test('an analysis listener installed after its consumer disappears is removed without enabling native sampling', async () => {
  const bridge = new Bridge()
  const registration = deferred<void>()
  const addListener = bridge.addListener.bind(bridge)
  bridge.addListener = async (event, listener) => {
    if (event === 'analysis') await registration.promise
    return addListener(event, listener)
  }
  const engine = new AndroidPlaybackEngine(bridge)
  const stop = engine.subscribeAnalysis(() => {})
  await settle()
  stop()
  registration.resolve()
  await settle()
  assert.deepEqual(bridge.analysisEnabled, [false])
  assert.equal(bridge.analysisListener, undefined)
})

test('Android seek, pause and queue transitions clear old FFT data until fresh native state arrives', async () => {
  const bridge = new Bridge()
  const engine = new AndroidPlaybackEngine(bridge)
  const seen: (PlaybackAnalysisFrame | null)[] = []
  const stop = engine.subscribeAnalysis((frame) => seen.push(frame))
  await settle()
  bridge.analysisListener?.(nativeFrame(1))
  await engine.seek(60)
  assert.equal(seen[seen.length - 1], null)
  bridge.analysisListener?.(nativeFrame(2, { position: 60 }))
  assert.equal(seen[seen.length - 1], null)
  bridge.emit(snapshot({ position: 60 }))
  bridge.analysisListener?.(nativeFrame(3))
  assert.equal(seen[seen.length - 1], null, 'pre-seek FFT position cannot reappear')
  bridge.analysisListener?.(nativeFrame(4, { position: 60 }))
  assert.equal(seen[seen.length - 1]?.position, 60)
  await engine.pause()
  bridge.analysisListener?.(nativeFrame(5, { position: 60 }))
  assert.equal(seen[seen.length - 1], null)
  await engine.setQueue({ tracks: [], index: -1, position: 0, mode: 'sequential', generation: 2 })
  bridge.analysisListener?.(nativeFrame(6))
  assert.equal(seen[seen.length - 1], null)
  stop()
  await settle()
})

test('Android never extrapolates while paused, buffering or ended', async () => {
  let time = 0
  const bridge = new Bridge()
  const engine = new AndroidPlaybackEngine(bridge, () => time)
  await engine.initialize()
  for (const state of [snapshot({ isPlaying: false }), snapshot({ isBuffering: true }), snapshot({ isAdvancing: false }), snapshot({ ended: true })]) {
    bridge.emit(state)
    time += 1000
    assert.equal(engine.getPosition(), 10)
  }
  bridge.emit(snapshot({ position: 179.98 }))
  time += 100
  assert.equal(engine.getPosition(), 180, 'interpolation cannot run beyond track duration')
})

test('Android pause, seek and a new song immediately stop the old interpolated clock', async () => {
  let time = 0
  const bridge = new Bridge()
  const engine = new AndroidPlaybackEngine(bridge, () => time)
  await engine.initialize()
  time = 50
  await engine.pause()
  time = 100
  assert.equal(engine.getPosition(), 10.05)
  await engine.seek(60)
  time = 200
  assert.equal(engine.getPosition(), 60)
  bridge.emit(snapshot({ position: 60.1 }))
  time = 250
  assert.equal(engine.getPosition(), 60.15)
  await engine.setQueue({ tracks: [], index: -1, generation: 2, position: 0, mode: 'sequential' })
  time = 300
  bridge.emit(snapshot({ generation: 1, position: 61 }))
  assert.equal(engine.getPosition(), 0)
  bridge.emit(snapshot({ generation: 2, index: 1, position: 4 }))
  time = 350
  assert.equal(engine.getPosition(), 4.05)
  bridge.emit(snapshot({ generation: 2, index: 2, position: 0 }))
  assert.equal(engine.getPosition(), 0, 'native next-track transitions reset the time origin too')
})

test('Android delayed getState cannot rewind an event, but still restores same-queue metadata', async () => {
  let time = 0
  const pending = deferred<AndroidPlaybackSnapshot>()
  const bridge = new Bridge()
  bridge.read = () => pending.promise
  const engine = new AndroidPlaybackEngine(bridge, () => time)
  const seen: AndroidPlaybackSnapshot[] = []
  engine.subscribe((state) => seen.push(state))
  const initialization = engine.initialize()
  await Promise.resolve()
  time = 100
  bridge.emit(snapshot({ position: 90, sequence: 8 }))
  pending.resolve(snapshot({ position: 89, sequence: 7, tracks: [{ id: 1 } as TrackOut], equalizer: createEqualizerState('rock', true) }))
  await initialization
  time = 116
  assert.equal(engine.getPosition(), 90.016)
  assert.equal(seen[seen.length - 1]?.position, 90)
  assert.equal(seen[seen.length - 1]?.tracks?.[0].id, 1)
  assert.equal(seen[seen.length - 1]?.equalizer?.preset, 'rock', 'late initial settings still attach without rewinding playback time')
  bridge.emit(snapshot({ position: 88, sequence: 6 }))
  assert.equal(engine.getPosition(), 90.016, 'old delivered events must not roll the clock back')
})

test('Android old bridges require actual position movement before clock interpolation', async () => {
  let time = 0
  const bridge = new Bridge()
  bridge.current = snapshot({ isAdvancing: undefined })
  const engine = new AndroidPlaybackEngine(bridge, () => time)
  await engine.initialize()
  time = 50
  assert.equal(engine.getPosition(), 10)
  bridge.emit(snapshot({ isAdvancing: undefined, position: 10.1 }))
  time = 100
  assert.equal(engine.getPosition(), 10.15)
  bridge.emit(snapshot({ isAdvancing: undefined, position: 10.1 }))
  time = 150
  assert.equal(engine.getPosition(), 10.1, 'play intent without position movement may be buffering')
})

test('Android foreground resync uses audio position after suspension and rejects older read ordering', async (t) => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  class Visibility extends EventTarget {
    visibilityState = 'visible'
    set(value: string) { this.visibilityState = value; this.dispatchEvent(new Event('visibilitychange')) }
  }
  const document = new Visibility()
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  t.after(() => { if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document') })
  let time = 0
  const bridge = new Bridge()
  const engine = new AndroidPlaybackEngine(bridge, () => time)
  await engine.initialize()
  document.set('hidden')
  time = 30_000
  assert.equal(engine.getPosition(), 10)
  const older = deferred<AndroidPlaybackSnapshot>()
  bridge.read = () => older.promise
  document.set('visible')
  assert.equal(engine.getPosition(), 10, 'resume waits for native time, not hidden wall clock elapsed')
  document.set('hidden')
  const newest = deferred<AndroidPlaybackSnapshot>()
  bridge.read = () => newest.promise
  document.set('visible')
  newest.resolve(snapshot({ position: 40, sequence: 20 }))
  await new Promise((resolve) => setImmediate(resolve))
  older.resolve(snapshot({ position: 39, sequence: 19 }))
  await new Promise((resolve) => setImmediate(resolve))
  time = 30_016
  assert.equal(engine.getPosition(), 40.016)
  assert.equal(bridge.reads, 3)
})

function queueTrack(id: number, localKey = 'media:external:1234'): TrackOut {
  return { id, source_id: 'local:android', local_key: localKey, playback_url: `muze-native://track/${id}`, title: '七百年後', format: 'FLAC', duration: 262, artist: { id: 2, name: '陳奕迅', cover_path: null }, album: null } as TrackOut
}

test('Android queue ACK repairs canonical DB ids without adopting placeholders or rewinding a newer clock', async () => {
  let time = 0
  const bridge = new Bridge()
  const pending = deferred<AndroidPlaybackSnapshot>()
  bridge.queueAction = () => pending.promise
  const engine = new AndroidPlaybackEngine(bridge, () => time)
  const seen: AndroidPlaybackSnapshot[] = []
  engine.subscribe((state) => seen.push(state))
  const original = queueTrack(4)
  const installing = engine.setQueue({ tracks: [original], index: 0, position: 42, generation: 2, mode: 'sequential' })
  await settle()
  bridge.emit(snapshot({ generation: 2, position: 45 }))
  time = 16
  const position = engine.getPosition()
  pending.resolve(snapshot({ generation: 2, position: 0, isPlaying: false, tracks: [{ id: 99, format: 'AUDIO', title: '' } as TrackOut], resolvedTracks: [{ id: 99, source_id: 'local:android', local_key: original.local_key, playback_url: 'muze-native://track/99' }] }))
  await installing
  assert.equal(engine.getPosition(), position)
  assert.equal(seen[seen.length - 1].position, 45)
  assert.equal(seen[seen.length - 1].isPlaying, true)
  assert.equal(seen[seen.length - 1].tracks?.[0].id, 99)
  assert.equal(seen[seen.length - 1].tracks?.[0].format, 'FLAC')
  assert.equal(seen[seen.length - 1].tracks?.[0].title, original.title)
  assert.equal(seen[seen.length - 1].tracks?.[0].artist?.id, 2)
})

test('Android ignores an old queue ACK but reconciles metadata after a seek without resetting the clock', async () => {
  const bridge = new Bridge()
  const older = deferred<AndroidPlaybackSnapshot>()
  bridge.queueAction = async (queue) => queue.generation === 2 ? older.promise : snapshot({ generation: queue.generation, resolvedTracks: [{ id: 77, source_id: 'local:android', local_key: 'new-file', playback_url: 'muze-native://track/77' }] })
  const engine = new AndroidPlaybackEngine(bridge)
  const seen: AndroidPlaybackSnapshot[] = []
  engine.subscribe((state) => seen.push(state))
  const oldQueue = engine.setQueue({ tracks: [queueTrack(4)], index: 0, position: 0, generation: 2, mode: 'sequential' })
  await settle()
  await engine.setQueue({ tracks: [queueTrack(5, 'new-file')], index: 0, position: 12, generation: 3, mode: 'sequential' })
  older.resolve(snapshot({ generation: 2, resolvedTracks: [{ id: 99, source_id: 'local:android', local_key: 'media:external:1234', playback_url: 'muze-native://track/99' }] }))
  await oldQueue
  assert.equal(seen[seen.length - 1].generation, 3)
  assert.equal(seen[seen.length - 1].tracks?.[0].id, 77)
  assert.equal(engine.getPosition(), 12)
  const before = seen.length
  const late = deferred<AndroidPlaybackSnapshot>()
  bridge.queueAction = () => late.promise
  const installing = engine.setQueue({ tracks: [queueTrack(4)], index: 0, position: 0, generation: 4, mode: 'sequential' })
  await settle()
  await engine.seek(60)
  late.resolve(snapshot({ generation: 4, resolvedTracks: [{ id: 99, source_id: 'local:android', local_key: 'media:external:1234', playback_url: 'muze-native://track/99' }] }))
  await installing
  assert.equal(seen.length, before + 1)
  assert.equal(seen[seen.length - 1].tracks?.[0].id, 99)
  assert.equal(engine.getPosition(), 60)
})

test('Android pruned queue ACK remaps the selected row but preserves a newer native auto-advanced index', async () => {
  for (const advanced of [false, true]) {
    const bridge = new Bridge()
    const pending = deferred<AndroidPlaybackSnapshot>()
    bridge.queueAction = () => pending.promise
    const engine = new AndroidPlaybackEngine(bridge)
    const seen: AndroidPlaybackSnapshot[] = []
    engine.subscribe((state) => seen.push(state))
    const tracks = [queueTrack(4, 'missing-file'), queueTrack(5, 'selected-file'), queueTrack(6, 'next-file')]
    const installing = engine.setQueue({ tracks, index: 1, position: 42, generation: 2, mode: 'sequential' })
    await settle()
    if (advanced) bridge.emit(snapshot({ generation: 2, index: 1, position: 58, isPlaying: true, isAdvancing: false }))
    else await engine.pause()
    const position = engine.getPosition()
    pending.resolve(snapshot({ generation: 2, index: 0, position: 0, resolvedTracks: [{ id: 55, source_id: 'local:android', local_key: 'selected-file', playback_url: 'muze-native://track/55' }, { id: 66, source_id: 'local:android', local_key: 'next-file', playback_url: 'muze-native://track/66' }], resolvedIndices: [1, 2], resolvedIndex: 0 }))
    await installing
    const acknowledgement = seen[seen.length - 1]
    assert.equal(acknowledgement.tracks?.length, 2)
    assert.equal(acknowledgement.index, advanced ? 1 : 0)
    assert.equal(acknowledgement.resolvedCurrentIndex, advanced ? 1 : 0)
    assert.equal(acknowledgement.requestedIndex, 1)
    assert.equal(acknowledgement.tracks?.[acknowledgement.index].id, advanced ? 66 : 55)
    assert.equal(engine.getPosition(), position)
  }
})
