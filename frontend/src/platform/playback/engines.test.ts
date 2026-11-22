import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import type { TrackOut } from '../../types/api.ts'
import type { PlaybackQueue, PlaybackSnapshot } from '../contracts/playback.ts'
import type { WebAudioEngine as WebEngine } from './webAudioEngine.ts'
import type { AndroidPlaybackBridge, AndroidPlaybackEngine as AndroidEngine } from './androidEngine.ts'
import { createEqualizerState } from '../../lib/equalizer.ts'
import type { NativeAnalysisFrame } from './androidAnalysis.ts'

// Bundle the actual modules to exercise their aliases and dependencies with Node's
// existing test runner, without introducing a second browser or test framework.
async function loadEngine<T>(entry: string): Promise<T> {
  const result = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false })
  const module = { exports: {} }
  const execute = new Script(`(function(require, module, exports) { ${result.outputFiles[0].text}\n})`).runInThisContext()
  execute(createRequire(import.meta.url), module, module.exports)
  return module.exports as T
}

const { WebAudioEngine } = await loadEngine<{ WebAudioEngine: typeof WebEngine }>('./webAudioEngine.ts')
const { AndroidPlaybackEngine } = await loadEngine<{ AndroidPlaybackEngine: typeof AndroidEngine }>('./androidEngine.ts')

function track(id = 4, sourceId = 'remote:same-origin'): TrackOut {
  return {
    id, source_id: sourceId, local_key: `file-${id}`, title: `Song ${id}`,
    playback_url: sourceId.startsWith('local:') ? `content://media/external/audio/media/${id}` : `https://nas.example/api/tracks/${id}/stream`,
    cover_url: 'https://nas.example/cover.jpg', file_path: '', artist_id: 2, album_id: 3,
    artist: { id: 2, name: 'Artist', cover_path: null },
    album: { id: 3, title: 'Album', artist_id: 2, artist: null, year: 2026, genre: null, cover_path: null, total_tracks: 1 },
    duration: 180, bitrate: null, format: 'flac', track_number: 1, disc_number: 1,
    year: 2026, genre: null, has_cover: true, play_count: 0, file_missing: false,
    date_added: '2026-09-30', is_favorite: false,
  }
}

function queue(generation = 1, position = 0): PlaybackQueue {
  return { tracks: [track()], index: 0, position, generation, mode: 'sequential' }
}

class FakeAudio extends EventTarget {
  preload = ''
  crossOrigin = ''
  src = ''
  paused = true
  ended = false
  currentTime = 0
  duration = Number.NaN
  readyState = 0
  volume = 1
  loads = 0
  plays = 0
  listeners = new Map<string, number>()
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) + 1)
    super.addEventListener(type, listener, options)
  }
  async play() { this.plays++; this.paused = false; this.ended = false; this.dispatchEvent(new Event('playing')) }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')) } }
  load() { this.loads++; this.currentTime = 0; this.duration = Number.NaN; this.readyState = 0; this.ended = false }
  removeAttribute(name: string) { if (name === 'src') this.src = '' }
  metadata(duration: number) { this.readyState = 1; this.duration = duration; this.dispatchEvent(new Event('loadedmetadata')) }
  finish() { this.currentTime = this.duration; this.ended = true; this.paused = true; this.dispatchEvent(new Event('ended')) }
}

class FakeParam {
  value = 0
  targets: number[] = []
  setTargetAtTime(value: number) { this.value = value; this.targets.push(value) }
}
class FakeNode {
  connections: FakeNode[] = []
  gain = new FakeParam()
  frequency = new FakeParam()
  Q = new FakeParam()
  threshold = new FakeParam()
  knee = new FakeParam()
  ratio = new FakeParam()
  attack = new FakeParam()
  release = new FakeParam()
  type = ''
  fftSize = 0
  smoothingTimeConstant = 0
  connect(node: FakeNode) { this.connections.push(node); return node }
  disconnect() { this.connections = [] }
}
class FakeContext {
  static instances: FakeContext[] = []
  state = 'suspended'
  sampleRate = 48_000
  currentTime = 0
  destination = new FakeNode()
  sources: FakeNode[] = []
  filters: FakeNode[] = []
  gains: FakeNode[] = []
  analysers: FakeNode[] = []
  compressors: FakeNode[] = []
  constructor() { FakeContext.instances.push(this) }
  async resume() { this.state = 'running' }
  createMediaElementSource() { const node = new FakeNode(); this.sources.push(node); return node }
  createGain() { const node = new FakeNode(); this.gains.push(node); return node }
  createBiquadFilter() { const node = new FakeNode(); this.filters.push(node); return node }
  createAnalyser() { const node = new FakeNode(); this.analysers.push(node); return node }
  createDynamicsCompressor() { const node = new FakeNode(); this.compressors.push(node); return node }
}

function installBrowser(t: { after: (callback: () => void) => void }) {
  const previous = { AudioContext: globalThis.AudioContext, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame }
  FakeContext.instances = []
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  globalThis.AudioContext = FakeContext as unknown as typeof AudioContext
  globalThis.requestAnimationFrame = (callback) => { frames.set(++id, callback); return id }
  globalThis.cancelAnimationFrame = (frame) => { frames.delete(frame) }
  t.after(() => { Object.assign(globalThis, previous) })
  return frames
}

test('web playback restores metadata position, seeks safely and publishes audio events', async (t) => {
  const frames = installBrowser(t)
  const audio = new FakeAudio()
  const engine = new WebAudioEngine(audio as unknown as HTMLAudioElement)
  const snapshots: PlaybackSnapshot[] = []
  const unsubscribe = engine.subscribe((state) => snapshots.push(state))
  await Promise.all([engine.initialize(), engine.initialize()])
  assert.equal(audio.listeners.get('playing'), 1)
  assert.equal(audio.listeners.get('loadedmetadata'), 1)
  await engine.setQueue(queue(3, 45))
  audio.metadata(30)
  assert.equal(engine.getPosition(), 30, 'persisted positions must stay inside a shorter recording')
  assert.equal(snapshots[snapshots.length - 1]?.generation, 3)
  assert.equal(snapshots[snapshots.length - 1]?.duration, 30)
  engine.seek(-12)
  assert.equal(engine.getPosition(), 0)
  engine.seek(Number.NaN)
  assert.equal(engine.getPosition(), 0)
  engine.seek(12)
  await engine.play()
  assert.equal(snapshots[snapshots.length - 1]?.isPlaying, true)
  assert.equal(frames.size, 1)
  engine.pause()
  assert.equal(frames.size, 0)
  assert.equal(snapshots[snapshots.length - 1]?.isPlaying, false)
  assert.equal(snapshots[snapshots.length - 1]?.position, 12)
  const beforeUnsubscribe = snapshots.length
  unsubscribe()
  engine.seek(14)
  assert.equal(snapshots.length, beforeUnsubscribe)
})

test('web playback creates one graph and a real equalizer bypass across repeated tracks', async (t) => {
  installBrowser(t)
  const audio = new FakeAudio()
  const engine = new WebAudioEngine(audio as unknown as HTMLAudioElement)
  engine.setEqualizer(createEqualizerState('bass', true))
  await engine.setQueue(queue())
  audio.metadata(180)
  await engine.play()
  const context = FakeContext.instances[0]
  assert.equal(context.state, 'running')
  assert.equal(context.sources.length, 1)
  assert.equal(context.filters.length, 10)
  assert.equal(context.analysers.length, 1)
  assert.equal(context.compressors.length, 1)
  assert.deepEqual(context.sources[0].connections, [context.gains[0]])
  assert.ok(context.gains[0].gain.value < 1, 'boosted EQ must reserve headroom')
  engine.setEqualizer(createEqualizerState('flat', false))
  assert.deepEqual(context.sources[0].connections, [context.analysers[0]])
  await engine.setQueue({ ...queue(2), mode: 'repeat-one' })
  audio.metadata(180)
  await engine.play()
  engine.pause()
  await engine.play()
  assert.equal(FakeContext.instances.length, 1)
  assert.equal(context.sources.length, 1)
  assert.equal(context.filters.length, 10)
  assert.equal(audio.plays, 3)
})

test('web repeat-one reloads the same track with a fresh generation and emits ended once', async (t) => {
  installBrowser(t)
  const audio = new FakeAudio()
  const engine = new WebAudioEngine(audio as unknown as HTMLAudioElement)
  const snapshots: PlaybackSnapshot[] = []
  engine.subscribe((state) => snapshots.push(state))
  await engine.setQueue({ ...queue(7), mode: 'repeat-one' })
  audio.metadata(180)
  await engine.play()
  audio.finish()
  assert.equal(snapshots.filter((state) => state.ended).length, 1)
  assert.equal(snapshots[snapshots.length - 1]?.generation, 7)
  await engine.setQueue({ ...queue(8), mode: 'repeat-one' })
  audio.metadata(180)
  await engine.play()
  assert.equal(audio.loads, 2)
  assert.equal(engine.getPosition(), 0)
  assert.equal(snapshots[snapshots.length - 1]?.generation, 8)
  assert.equal(snapshots[snapshots.length - 1]?.isPlaying, true)
  await engine.setQueue({ ...queue(9), tracks: [], index: -1 })
  assert.equal(audio.src, '')
  assert.equal(audio.paused, true)
})

test('web defers pre-metadata seek and reports a playback failure with the current generation', async (t) => {
  const frames = installBrowser(t)
  const audio = new FakeAudio()
  const engine = new WebAudioEngine(audio as unknown as HTMLAudioElement)
  const snapshots: PlaybackSnapshot[] = []
  engine.subscribe((state) => snapshots.push(state))
  const item = track()
  delete item.playback_url
  await engine.setQueue({ ...queue(11, 40), tracks: [item] })
  assert.equal(audio.src, '/api/tracks/4/stream', 'tracks without a resolved URL use their provider route')
  engine.seek(18)
  assert.equal(audio.currentTime, 0, 'seek must wait until media metadata is available')
  audio.metadata(180)
  assert.equal(engine.getPosition(), 18)
  await engine.play()
  assert.equal(frames.size, 1)
  audio.dispatchEvent(new Event('error'))
  assert.equal(frames.size, 0)
  assert.equal(snapshots[snapshots.length - 1].generation, 11)
  assert.match(snapshots[snapshots.length - 1].error ?? '', /无法播放/)
})

class FakeBridge implements AndroidPlaybackBridge {
  listener: ((state: PlaybackSnapshot) => void) | undefined
  subscriptions = 0
  reads = 0
  queues: Parameters<AndroidPlaybackBridge['setQueue']>[0][] = []
  seeks: number[] = []
  volumes: number[] = []
  modes: string[] = []
  plays = 0
  pauses = 0
  async addListener(event: 'state' | 'analysis', listener: ((state: PlaybackSnapshot) => void) | ((frame: NativeAnalysisFrame) => void)) { this.subscriptions++; if (event === 'state') this.listener = listener as (state: PlaybackSnapshot) => void; return { remove: async () => {} } }
  async getState(): Promise<PlaybackSnapshot> { this.reads++; return { index: -1, position: 0, duration: 0, isPlaying: false, mode: 'sequential' } }
  async setQueue(value: Parameters<AndroidPlaybackBridge['setQueue']>[0]) { this.queues.push(value) }
  async play() { this.plays++ }
  async pause() { this.pauses++ }
  async seek({ position }: { position: number }) { this.seeks.push(position) }
  async setVolume({ volume }: { volume: number }) { this.volumes.push(volume) }
  async setMode({ mode }: Parameters<AndroidPlaybackBridge['setMode']>[0]) { this.modes.push(mode) }
  async setEqualizer() {}
  async setAnalysisEnabled() {}
  emit(state: Partial<PlaybackSnapshot> = {}) { this.listener?.({ index: 0, position: 1, duration: 180, isPlaying: true, mode: 'sequential', ...state }) }
}

test('Android initializes once and preserves mixed-source identity in the native queue', async () => {
  const bridge = new FakeBridge()
  const engine = new AndroidPlaybackEngine(bridge)
  await Promise.all([engine.initialize(), engine.initialize(), engine.play()])
  assert.equal(bridge.subscriptions, 1)
  assert.equal(bridge.reads, 1)
  assert.equal(bridge.plays, 1)
  await engine.setQueue({ tracks: [track(4, 'local:android'), track(4, 'remote:home')], index: 1, position: 42, generation: 6, mode: 'shuffle' })
  const native = bridge.queues[0]
  assert.equal(native.index, 1)
  assert.equal(native.position, 42)
  assert.equal(native.generation, 6)
  assert.equal(native.mode, 'shuffle')
  assert.equal(native.tracks[0].uri, 'content://media/external/audio/media/4')
  assert.equal(native.tracks[1].uri, 'https://nas.example/api/tracks/4/stream')
  assert.equal(native.tracks[0].source_id, 'local:android')
  assert.equal(native.tracks[1].source_id, 'remote:home')
  assert.equal(native.tracks[0].local_key, 'file-4')
  assert.equal(native.tracks[0].artist, 'Artist')
  assert.equal(native.tracks[0].album, 'Album')
  assert.equal(engine.capabilities.equalizer, true)
  assert.equal(engine.capabilities.spectrum, true)
  assert.equal(engine.ownsQueue, true)
})

test('Android rejects delayed old queue snapshots and keeps native transport controls', async () => {
  const bridge = new FakeBridge()
  const engine = new AndroidPlaybackEngine(bridge)
  const snapshots: PlaybackSnapshot[] = []
  await engine.initialize()
  const unsubscribe = engine.subscribe((state) => snapshots.push(state))
  await engine.setQueue(queue(5))
  bridge.emit({ generation: 4, position: 99 })
  assert.equal(snapshots.length, 0)
  bridge.emit({ generation: 5, position: 21 })
  assert.equal(engine.getPosition(), 21)
  assert.equal(snapshots.length, 1)
  await engine.setQueue(queue(6))
  bridge.emit({ generation: 5, position: 90 })
  assert.equal(engine.getPosition(), 0, 'a new queue must not inherit the previous song clock')
  bridge.emit({ generation: 6, position: 2, index: 0 })
  assert.equal(engine.getPosition(), 2)
  await engine.seek(-5)
  await engine.seek(15)
  await engine.pause()
  await engine.setVolume(0.4)
  await engine.setMode('repeat-one')
  assert.deepEqual(bridge.seeks, [0, 15])
  assert.equal(bridge.pauses, 1)
  assert.deepEqual(bridge.volumes, [0.4])
  assert.deepEqual(bridge.modes, ['repeat-one'])
  unsubscribe()
  bridge.emit({ generation: 6, position: 3 })
  assert.equal(snapshots.length, 2)
})

test('Android reconnects to an already playing native queue without resetting it', async () => {
  const bridge = new FakeBridge()
  const tracks = [track(4, 'local:android'), track(5, 'local:android')]
  const restored: PlaybackSnapshot = { tracks, index: 1, position: 78, duration: 180, isPlaying: true, mode: 'repeat-all', generation: 12 }
  bridge.getState = async () => restored
  const engine = new AndroidPlaybackEngine(bridge)
  const snapshots: PlaybackSnapshot[] = []
  engine.subscribe((state) => snapshots.push(state))
  await engine.initialize()
  assert.deepEqual(JSON.parse(JSON.stringify(snapshots[0])), JSON.parse(JSON.stringify(restored)))
  assert.equal(engine.getPosition(), 78)
  assert.equal(bridge.queues.length, 0)
  assert.equal(bridge.pauses, 0)
  assert.equal(bridge.plays, 0)
  bridge.emit({ generation: 11, position: 0 })
  assert.equal(engine.getPosition(), 78)
})
