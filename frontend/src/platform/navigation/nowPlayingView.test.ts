import assert from 'node:assert/strict'
import test from 'node:test'
import { canHandlePlayerShortcut, createNowPlayingView, nowPlayingViewReducer } from './nowPlayingView.ts'

test('the player starts with mobile artwork and desktop lyrics without separate tab modes', () => {
  assert.deepEqual(createNowPlayingView(true), { lyricsVisible: false, queueOpen: false })
  assert.deepEqual(createNowPlayingView(false), { lyricsVisible: true, queueOpen: false })
})

test('the same lyrics toggle switches both layouts and never opens the queue', () => {
  for (const narrow of [true, false]) {
    const initial = createNowPlayingView(narrow)
    const toggled = nowPlayingViewReducer(initial, { type: 'toggle-lyrics' })
    assert.equal(toggled.lyricsVisible, !initial.lyricsVisible)
    assert.equal(toggled.queueOpen, false)
    assert.deepEqual(nowPlayingViewReducer(toggled, { type: 'toggle-lyrics' }), initial)
  }
})

test('opening and dismissing the queue restores artwork or lyrics without changing either', () => {
  for (const lyricsVisible of [true, false]) {
    const initial = { lyricsVisible, queueOpen: false }
    const opened = nowPlayingViewReducer(initial, { type: 'queue-open-changed', open: true })
    assert.deepEqual(opened, { lyricsVisible, queueOpen: true })
    assert.deepEqual(nowPlayingViewReducer(opened, { type: 'queue-open-changed', open: false }), initial)
  }
})

test('a lyrics visibility change remains independent from the queue sheet', () => {
  const opened = { lyricsVisible: false, queueOpen: true }
  assert.deepEqual(nowPlayingViewReducer(opened, { type: 'toggle-lyrics' }), {
    lyricsVisible: true,
    queueOpen: true,
  })
})

test('a focused dialog or menu keeps arrow and Escape keys from the underlying player', () => {
  const overlayTarget = { tagName: 'BUTTON', isContentEditable: false, closest: () => ({}) }
  assert.equal(canHandlePlayerShortcut(overlayTarget, false), false)
  const playerTarget = { tagName: 'BUTTON', isContentEditable: false, closest: () => null }
  assert.equal(canHandlePlayerShortcut(playerTarget, false), true)
  assert.equal(canHandlePlayerShortcut(playerTarget, true), false)
})

test('typing and selection fields keep their own keyboard interaction', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(canHandlePlayerShortcut({ tagName, isContentEditable: false, closest: () => null }, false), false)
  }
  assert.equal(canHandlePlayerShortcut({ tagName: 'DIV', isContentEditable: true, closest: () => null }, false), false)
  assert.equal(canHandlePlayerShortcut(null, false), true)
})
