import assert from 'node:assert/strict'
import test from 'node:test'
import { getRuntimePlatform } from './runtime.ts'

test('Android native detection works before the Capacitor module initializes', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { androidBridge: {} } })
    assert.equal(getRuntimePlatform(), 'android')
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: {} } })
    assert.equal(getRuntimePlatform(), 'windows')
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
    assert.equal(getRuntimePlatform(), 'web')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
