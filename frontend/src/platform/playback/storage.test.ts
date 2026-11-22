import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlaybackStorage } from './storage.ts'

class RecordingStorage implements Storage {
  private values = new Map<string, string>()
  writes: { name: string; value: string }[] = []
  full = false
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(name: string) { return this.values.get(name) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(name: string) { this.values.delete(name) }
  setItem(name: string, value: string) {
    if (this.full) throw new DOMException('Quota exhausted', 'QuotaExceededError')
    this.writes.push({ name, value })
    this.values.set(name, value)
  }
}

function browserStorage(t: { after: (callback: () => void) => void }) {
  const storage = new RecordingStorage()
  const browser = Object.assign(new EventTarget(), { localStorage: storage })
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser })
  t.after(() => {
    browser.dispatchEvent(new Event('pagehide'))
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  return { storage, browser }
}

test('playback clock saves at most once a second while queue and settings changes save immediately', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10_000 })
  const { storage } = browserStorage(t)
  const persistence = createPlaybackStorage<{ queue: string[]; currentTime: number; volume: number }>()
  const queue = ['local:android:8']
  const initial = { state: { queue, currentTime: 0, volume: 0.8 }, version: 0 }
  persistence.setItem('player', initial)
  assert.equal(storage.writes.length, 1)
  for (let index = 1; index <= 9; index++) {
    t.mock.timers.tick(100)
    persistence.setItem('player', { ...initial, state: { ...initial.state, currentTime: index / 10 } })
  }
  assert.equal(storage.writes.length, 1, 'ten clock updates must not serialize a large queue ten times')
  t.mock.timers.tick(100)
  assert.equal(storage.writes.length, 2)
  assert.equal(JSON.parse(storage.writes[1].value).state.currentTime, 0.9)
  persistence.setItem('player', { ...initial, state: { ...initial.state, currentTime: 1, volume: 0.5 } })
  assert.equal(storage.writes.length, 3)
  assert.equal(JSON.parse(storage.writes[2].value).state.volume, 0.5)
  persistence.setItem('player', { ...initial, state: { ...initial.state, currentTime: 1, queue: ['local:android:9'] } })
  assert.equal(storage.writes.length, 4)
  assert.deepEqual(JSON.parse(storage.writes[3].value).state.queue, ['local:android:9'])
})

test('pagehide flushes the latest position and removal cancels a pending clock save', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 20_000 })
  const { storage, browser } = browserStorage(t)
  const persistence = createPlaybackStorage<{ currentTime: number }>()
  persistence.setItem('player', { state: { currentTime: 10 }, version: 0 })
  t.mock.timers.tick(100)
  persistence.setItem('player', { state: { currentTime: 10.1 }, version: 0 })
  persistence.setItem('player', { state: { currentTime: 10.2 }, version: 0 })
  assert.equal(storage.writes.length, 1)
  browser.dispatchEvent(new Event('pagehide'))
  assert.equal(JSON.parse(storage.getItem('player')!).state.currentTime, 10.2)
  t.mock.timers.tick(100)
  persistence.setItem('player', { state: { currentTime: 10.3 }, version: 0 })
  persistence.removeItem?.('player')
  t.mock.timers.tick(2000)
  assert.equal(storage.getItem('player'), null)
  assert.equal(storage.writes.length, 2)
})

test('corrupt or full browser storage does not prevent playback persistence from being used', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 30_000 })
  const { storage } = browserStorage(t)
  storage.setItem('player', '{bad json')
  const persistence = createPlaybackStorage<{ currentTime: number }>()
  assert.equal(persistence.getItem('player'), null)
  storage.full = true
  assert.doesNotThrow(() => persistence.setItem('player', { state: { currentTime: 3 }, version: 0 }))
  persistence.setItem('player', { state: { currentTime: 4 }, version: 0 })
  assert.doesNotThrow(() => t.mock.timers.tick(1000))
  storage.full = false
  persistence.setItem('player', { state: { currentTime: 5 }, version: 0 })
  t.mock.timers.tick(1000)
  assert.equal(JSON.parse(storage.getItem('player')!).state.currentTime, 5)
})
