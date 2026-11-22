import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { setImmediate } from 'node:timers/promises'
import { build } from 'esbuild'
import { createEqualizerState, normalizeEqualizerState, type EqualizerState } from '../../lib/equalizer.ts'
import type { TrackOut } from '../../types/api.ts'
import type { PlaybackEngine, PlaybackQueue, PlaybackSnapshot } from '../contracts/playback.ts'
import { reconcileResolvedPlaybackQueue } from './nativeQueueAck.ts'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((success, failure) => { resolve = success; reject = failure })
  return { promise, resolve, reject }
}

function track(id: number, source = 'local:android'): TrackOut {
  return {
    id, source_id: source, local_key: String(id), title: `Song ${id}`, file_path: '',
    artist_id: null, album_id: null, artist: null, album: null, duration: 180,
    bitrate: null, format: 'flac', track_number: null, disc_number: null, year: null,
    genre: null, has_cover: false, play_count: 0, file_missing: false,
    date_added: '2026-09-30', is_favorite: false,
  }
}

class ControlledEngine implements PlaybackEngine {
  readonly capabilities = { equalizer: false, spectrum: false, backgroundPlayback: true }
  ownsQueue = true
  initializeAction: () => Promise<void> = async () => {}
  equalizerAction: (equalizer: EqualizerState) => Promise<void> = async () => {}
  queueAction: (queue: PlaybackQueue) => Promise<void> = async () => {}
  playAction: () => Promise<void> = async () => {}
  private initialization: Promise<void> | undefined
  private listener: ((state: PlaybackSnapshot) => void) | undefined
  queues: PlaybackQueue[] = []
  played: number[] = []
  pauses = 0
  subscriptions = 0
  activeGeneration = 0
  equalizers: EqualizerState[] = []
  initialize() { return this.initialization ??= this.initializeAction() }
  async setQueue(queue: PlaybackQueue) { this.queues.push(queue); await this.queueAction(queue); this.activeGeneration = queue.generation }
  async play() { this.played.push(this.activeGeneration); await this.playAction() }
  pause() { this.pauses++ }
  seek() {}
  setVolume() {}
  setMode() {}
  async setEqualizer(equalizer: EqualizerState) { this.equalizers.push(equalizer); await this.equalizerAction(equalizer) }
  getPosition() { return 0 }
  subscribe(listener: (state: PlaybackSnapshot) => void) { this.subscriptions++; this.listener = listener; return () => { this.listener = undefined } }
  emit(snapshot: Partial<PlaybackSnapshot>) { this.listener?.({ index: 0, position: 0, duration: 180, isPlaying: false, mode: 'sequential', generation: this.activeGeneration, ...snapshot }) }
}

function mockStore() {
  let state = {
    queue: [] as TrackOut[], currentIndex: -1, currentTime: 0, isPlaying: false,
    playbackRequest: 0, playbackError: null as string | null, volume: 0.8,
    playMode: 'sequential', equalizer: createEqualizerState(),
  }
  let restorations = 0
  const actions = {
    setPlaying: (isPlaying: boolean) => { state = { ...state, isPlaying } },
    setCurrentTime: (currentTime: number) => { state = { ...state, currentTime } },
    setPlaybackError: (playbackError: string | null) => { state = { ...state, playbackError } },
    setQueue: (queue: TrackOut[], index = 0) => { state = { ...state, queue, currentIndex: queue.length ? index : -1, currentTime: 0, isPlaying: queue.length > 0, playbackRequest: state.playbackRequest + 1 } },
    playNext: () => {
      if (state.currentIndex === state.queue.length - 1) state = { ...state, isPlaying: false }
      else state = { ...state, currentIndex: state.currentIndex + 1, currentTime: 0, playbackRequest: state.playbackRequest + 1 }
    },
    playPrev: () => {},
    restoreNativePlayback: (snapshot: PlaybackSnapshot) => {
      restorations++
      state = { ...state, queue: snapshot.tracks ?? [], currentIndex: snapshot.index, currentTime: snapshot.position, isPlaying: snapshot.isPlaying, playbackRequest: snapshot.generation ?? 0, playMode: snapshot.mode }
      if (snapshot.equalizer) state = { ...state, equalizer: normalizeEqualizerState(snapshot.equalizer) }
    },
    restoreNativeEqualizer: (equalizer: EqualizerState) => { state = { ...state, equalizer: normalizeEqualizerState(equalizer) } },
    applyPlaybackSnapshot: (snapshot: PlaybackSnapshot) => { state = { ...state, currentIndex: snapshot.index, currentTime: snapshot.position, isPlaying: snapshot.isPlaying } },
    applyNativeQueueIdentities: (snapshot: PlaybackSnapshot) => {
      if (snapshot.generation !== state.playbackRequest) return
      const resolved = reconcileResolvedPlaybackQueue(state.queue, snapshot.requestedIndex ?? state.currentIndex, snapshot.resolvedTracks, snapshot.resolvedIndices, snapshot.resolvedIndex)
      if (!resolved) return
      const index = snapshot.resolvedCurrentIndex ?? resolved.index
      if (Number.isInteger(index) && index >= 0 && index < resolved.tracks.length) state = { ...state, queue: resolved.tracks, currentIndex: index }
    },
  }
  return { getState: () => ({ ...state, ...actions }), restorations: () => restorations }
}

async function coordinator(t: { after: (callback: () => void) => void }, engine = new ControlledEngine()) {
  const store = mockStore()
  let cursor = 0
  const dependencies: unknown[][] = []
  let effects: (() => void)[] = []
  const host = { store, engine, react: {
    useEffect: (effect: () => void, next: unknown[]) => {
      const index = cursor++
      const previous = dependencies[index]
      if (!previous || next.some((dependency, i) => !Object.is(dependency, previous[i]))) effects.push(effect)
      dependencies[index] = next
    },
    useCallback: (callback: unknown) => callback,
  } }
  const key = '__muzePlaybackCoordinatorTest'
  Object.defineProperty(globalThis, key, { configurable: true, value: host })
  t.after(() => { Reflect.deleteProperty(globalThis, key) })
  const modules: Record<string, string> = {
    react: `const h=globalThis.${key}; export const useEffect=h.react.useEffect; export const useCallback=h.react.useCallback;`,
    store: `const h=globalThis.${key}; export const usePlayerStore=Object.assign((selector)=>selector(h.store.getState()),{getState:h.store.getState});`,
    runtime: `const h=globalThis.${key}; export function getPlaybackEngine(){return h.engine;}`,
  }
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../../hooks/useAudio.ts', import.meta.url))],
    alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name: 'control-playback-boundaries', setup(builder) {
      builder.onResolve({ filter: /^(react|@\/store\/playerStore|@\/platform\/playback\/runtime)$|\/(store\/playerStore|platform\/playback\/runtime)$/ }, ({ path }) => ({
        path: path === 'react' ? 'react' : path.endsWith('playerStore') ? 'store' : 'runtime', namespace: 'test-boundary',
      }))
      builder.onLoad({ filter: /.*/, namespace: 'test-boundary' }, ({ path }) => ({ contents: modules[path], loader: 'js' }))
    } }],
  })
  const module = { exports: {} }
  const execute = new Script(`(function(require, module, exports) { ${result.outputFiles[0].text}\n})`).runInThisContext()
  execute(createRequire(import.meta.url), module, module.exports)
  const { useAudio: runAudio } = module.exports as { useAudio: () => unknown }
  const render = () => { cursor = 0; effects = []; runAudio(); effects.forEach((effect) => effect()) }
  const settle = async () => { await setImmediate(); await setImmediate() }
  return { engine, store, render, settle }
}

test('a delayed native initial snapshot cannot replace a queue selected while connecting', async (t) => {
  const engine = new ControlledEngine()
  const connecting = deferred()
  engine.initializeAction = async () => {
    await connecting.promise
    engine.emit({ tracks: [track(8)], index: 0, position: 77, isPlaying: true, generation: 9 })
  }
  const harness = await coordinator(t, engine)
  harness.render()
  await harness.settle()
  harness.store.getState().setQueue([track(2)])
  harness.render()
  connecting.resolve()
  await harness.settle()
  assert.equal(harness.store.restorations(), 0)
  assert.equal(harness.store.getState().queue[0].id, 2)
  assert.equal(harness.store.getState().currentTime, 0)
  assert.equal(engine.queues[0].tracks[0].id, 2)
  assert.deepEqual(engine.played, [1, 1])
  assert.equal(engine.subscriptions, 1)
})

test('native persisted equalizer is restored before applying JS settings even with an empty native queue', async (t) => {
  const engine = new ControlledEngine()
  const equalizer = createEqualizerState('vocal', true)
  engine.initializeAction = async () => { engine.emit({ index: -1, tracks: [], equalizer }) }
  const harness = await coordinator(t, engine)
  harness.render()
  await harness.settle()
  assert.deepEqual(harness.store.getState().equalizer, equalizer)
  assert.deepEqual(engine.equalizers, [equalizer], 'default disabled EQ must never overwrite the native persisted settings')
  assert.equal(harness.store.restorations(), 0)
})

test('active native queue restoration carries the persisted equalizer without reloading that queue', async (t) => {
  const engine = new ControlledEngine()
  const equalizer = createEqualizerState('rock', true)
  engine.initializeAction = async () => { engine.emit({ tracks: [track(8)], generation: 9, index: 0, position: 77, isPlaying: true, equalizer }) }
  const harness = await coordinator(t, engine)
  harness.render()
  await harness.settle()
  assert.equal(harness.store.restorations(), 1)
  assert.equal(harness.store.getState().currentTime, 77)
  assert.deepEqual(engine.equalizers, [equalizer])
  assert.equal(engine.queues.length, 0)
})

test('a rejected native equalizer application is caught and shown instead of becoming an unhandled rejection', async (t) => {
  const engine = new ControlledEngine()
  engine.equalizerAction = async () => { throw new Error('native DSP rejected settings') }
  const harness = await coordinator(t, engine)
  harness.render()
  await harness.settle()
  assert.equal(harness.store.getState().playbackError, '无法应用均衡器设置。')
})

test('pause during pending queue installation prevents the captured playing state from restarting audio', async (t) => {
  const harness = await coordinator(t)
  const installing = deferred()
  harness.engine.queueAction = () => installing.promise
  harness.store.getState().setQueue([track(1)])
  harness.render()
  await harness.settle()
  harness.store.getState().setPlaying(false)
  harness.render()
  installing.resolve()
  await harness.settle()
  assert.equal(harness.engine.played.length, 0)
  assert.ok(harness.engine.pauses > 0)
  assert.equal(harness.engine.queues.length, 1)
})

test('a new queue selected during installation is the only generation allowed to start playback', async (t) => {
  const harness = await coordinator(t)
  const installing = deferred()
  harness.engine.queueAction = (queue) => queue.generation === 1 ? installing.promise : Promise.resolve()
  harness.store.getState().setQueue([track(1)])
  harness.render()
  await harness.settle()
  harness.store.getState().setQueue([track(2)])
  harness.render()
  installing.resolve()
  await harness.settle()
  assert.deepEqual(harness.engine.queues.map((queue) => queue.generation), [1, 2])
  assert.deepEqual(harness.engine.played, [2])
})

test('a rejected queue installation retries that queue before playing instead of using an older native queue', async (t) => {
  const harness = await coordinator(t)
  let rejectFirst = true
  harness.engine.queueAction = async () => {
    if (rejectFirst) { rejectFirst = false; throw new Error('Media permission unavailable') }
  }
  harness.store.getState().setQueue([track(2)])
  harness.render()
  await harness.settle()
  assert.equal(harness.engine.played.length, 0)
  assert.equal(harness.store.getState().isPlaying, false)
  harness.render()
  await harness.settle()
  harness.store.getState().setPlaying(true)
  harness.render()
  await harness.settle()
  assert.equal(harness.engine.queues.length, 2)
  assert.deepEqual(harness.engine.played, [1])
})

test('a native final playback error leaves the store paused without advancing the queue twice', async (t) => {
  const harness = await coordinator(t)
  harness.store.getState().setQueue([track(1), track(2)])
  harness.render()
  await harness.settle()
  harness.engine.emit({ generation: 1, index: 1, position: 25, isPlaying: false, error: 'Native file unavailable' })
  assert.equal(harness.store.getState().isPlaying, false)
  assert.equal(harness.store.getState().currentIndex, 1)
  assert.equal(harness.store.getState().currentTime, 25)
  assert.equal(harness.store.getState().playbackError, 'Native file unavailable')
  assert.equal(harness.store.getState().playbackRequest, 1)
})

test('matching Android integer generations advance lyric time while zero and old queues cannot rewind it', async (t) => {
  const harness = await coordinator(t)
  harness.store.getState().setQueue([track(7)])
  harness.render()
  await harness.settle()
  assert.equal(harness.engine.queues[0].generation, 1)
  for (const position of [34.96, 36.62, 36.84, 40.06]) {
    harness.engine.emit({ generation: 1, position, isPlaying: true })
    assert.equal(harness.store.getState().currentTime, position)
  }
  harness.engine.emit({ generation: 0, position: 0, isPlaying: false })
  assert.equal(harness.store.getState().currentTime, 40.06)
  assert.equal(harness.store.getState().isPlaying, true)
  harness.store.getState().setQueue([track(8)])
  harness.render()
  await harness.settle()
  harness.engine.emit({ generation: 1, position: 41, isPlaying: true })
  assert.equal(harness.store.getState().currentTime, 0)
  harness.engine.emit({ generation: 2, position: 0.1, isPlaying: true })
  assert.equal(harness.store.getState().currentTime, 0.1)
})

test('web errors keep same-numbered local and remote files distinct when skipping unavailable tracks', async (t) => {
  const engine = new ControlledEngine()
  engine.ownsQueue = false
  const harness = await coordinator(t, engine)
  harness.store.getState().setQueue([track(7, 'remote:home'), track(7, 'local:windows'), track(8, 'local:windows')])
  harness.render()
  await harness.settle()
  engine.emit({ generation: 1, error: 'First source missing' })
  assert.equal(harness.store.getState().currentIndex, 1)
  harness.render()
  await harness.settle()
  engine.emit({ generation: 2, error: 'Second source missing' })
  assert.equal(harness.store.getState().currentIndex, 2)
  assert.equal(harness.store.getState().isPlaying, true)
  harness.render()
  await harness.settle()
  assert.deepEqual(engine.played, [1, 2, 3])
})

test('replacing a failed web queue does not count errors from the previous queue against the new one', async (t) => {
  const engine = new ControlledEngine()
  engine.ownsQueue = false
  const harness = await coordinator(t, engine)
  harness.store.getState().setQueue([track(1), track(2), track(3)])
  harness.render()
  await harness.settle()
  engine.emit({ generation: 1, error: 'Old queue failure' })
  harness.render()
  await harness.settle()
  harness.store.getState().setQueue([track(4), track(5)])
  harness.render()
  await harness.settle()
  engine.emit({ generation: 3, error: 'New queue first failure' })
  assert.equal(harness.store.getState().currentIndex, 1, 'the playable second track in the new queue must still be attempted')
  assert.equal(harness.store.getState().isPlaying, true)
})

test('native queue identity ACK updates the current API id without queue reload, playback replay or clock reset', async (t) => {
  const harness = await coordinator(t)
  const original = { ...track(4), playback_url: 'muze-native://track/4' }
  harness.store.getState().setQueue([original])
  harness.engine.queueAction = async (queue) => {
    harness.engine.emit({ generation: queue.generation, position: 0, isPlaying: false, resolvedTracks: [{ id: 99, source_id: 'local:android', local_key: original.local_key, playback_url: 'muze-native://track/99' }] })
  }
  harness.store.getState().setCurrentTime(73)
  harness.render()
  await harness.settle()
  assert.equal(harness.store.getState().queue[0].id, 99)
  assert.equal(harness.store.getState().queue[0].playback_url, 'muze-native://track/99')
  assert.equal(harness.store.getState().queue[0].title, original.title)
  assert.equal(harness.store.getState().currentTime, 73)
  assert.equal(harness.store.getState().isPlaying, true)
  assert.equal(harness.store.getState().playbackRequest, 1)
  harness.render()
  await harness.settle()
  assert.equal(harness.engine.queues.length, 1)
  assert.deepEqual(harness.engine.played, [1], 'canonical identity rerenders must not issue another transport command')
})

test('a pruned native queue ACK removes only nonselected rows without replaying or resetting the active song', async (t) => {
  const harness = await coordinator(t)
  harness.store.getState().setQueue([track(1), track(2), track(3)], 1)
  harness.store.getState().setCurrentTime(73)
  harness.engine.queueAction = async (queue) => {
    harness.engine.emit({ generation: queue.generation, requestedIndex: queue.index, resolvedTracks: [{ id: 22, source_id: 'local:android', local_key: '2', playback_url: 'muze-native://track/22' }, { id: 33, source_id: 'local:android', local_key: '3', playback_url: 'muze-native://track/33' }], resolvedIndices: [1, 2], resolvedIndex: 0, resolvedCurrentIndex: 0 })
  }
  harness.render()
  await harness.settle()
  assert.equal(harness.store.getState().queue.length, 2)
  assert.equal(harness.store.getState().currentIndex, 0)
  assert.equal(harness.store.getState().queue[0].id, 22)
  assert.equal(harness.store.getState().currentTime, 73)
  assert.equal(harness.store.getState().isPlaying, true)
  assert.equal(harness.store.getState().playbackRequest, 1)
  harness.render()
  await harness.settle()
  assert.equal(harness.engine.queues.length, 1)
  assert.deepEqual(harness.engine.played, [1])
})

test('a native unavailable-file rejection retains its readable message and never retries on the pause rerender', async (t) => {
  const harness = await coordinator(t)
  const message = '该歌曲已不在本地曲库中，请重新扫描后播放。'
  harness.engine.queueAction = async () => { throw Object.assign(new Error(message), { code: 'NOT_FOUND' }) }
  harness.store.getState().setQueue([track(1), track(2)])
  harness.render()
  await harness.settle()
  assert.equal(harness.store.getState().playbackError, message)
  assert.equal(harness.store.getState().isPlaying, false)
  assert.equal(harness.store.getState().currentIndex, 0)
  harness.render()
  await harness.settle()
  assert.equal(harness.engine.queues.length, 1)
  assert.equal(harness.engine.played.length, 0)
  harness.store.getState().setPlaying(true)
  harness.render()
  await harness.settle()
  assert.equal(harness.engine.queues.length, 2, 'an explicit Play still permits a bounded user-requested retry')
  harness.render()
  await harness.settle()
  assert.equal(harness.engine.queues.length, 2)
})

test('native play rejections retain readable errors while Web failures and HTML responses keep the generic fallback', async (t) => {
  const native = await coordinator(t)
  native.engine.playAction = async () => { throw new Error('当前音频格式无法解码。') }
  native.store.getState().setQueue([track(1)])
  native.render()
  await native.settle()
  assert.equal(native.store.getState().playbackError, '当前音频格式无法解码。')
  native.render()
  await native.settle()
  assert.equal(native.engine.played.length, 1)
  const webEngine = new ControlledEngine()
  webEngine.ownsQueue = false
  webEngine.queueAction = async () => { throw new Error('Internal upstream message') }
  const web = await coordinator(t, webEngine)
  web.store.getState().setQueue([track(1)])
  web.render()
  await web.settle()
  assert.equal(web.store.getState().playbackError, '无法开始播放，请检查文件或媒体权限。')
  const unsafe = await coordinator(t)
  unsafe.engine.queueAction = async () => { throw new Error('<html>upstream private response</html>') }
  unsafe.store.getState().setQueue([track(1)])
  unsafe.render()
  await unsafe.settle()
  assert.equal(unsafe.store.getState().playbackError, '无法开始播放，请检查文件或媒体权限。')
})
