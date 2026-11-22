import assert from 'node:assert/strict'
import test from 'node:test'
import { createRemoteSource, normalizeRemoteBaseUrl, readSourceSettings } from './sourceSettings.ts'
import { sameSourceEntity, sourceIdentity } from './contracts/models.ts'

test('fresh installs browse the local library while web keeps its current service', () => {
  assert.equal(readSourceSettings(null, 'windows').activeSourceId, 'local:windows')
  assert.equal(readSourceSettings(null, 'android').activeSourceId, 'local:android')
  assert.equal(readSourceSettings(null, 'web').activeSourceId, 'remote:same-origin')
})

test('endpoint identity survives label changes and separates local and remote integer IDs', () => {
  const first = createRemoteSource('NAS', 'http://192.168.5.2:8000')
  const renamed = createRemoteSource('Home music', 'http://192.168.5.2:8000/api/')
  assert.equal(first.id, renamed.id)
  assert.equal(first.baseUrl, 'http://192.168.5.2:8000/api')
  assert.notEqual(first.id, createRemoteSource('Other', 'http://192.168.5.3:8000').id)
  assert.notEqual(sourceIdentity({ id: 1, source_id: first.id }), sourceIdentity({ id: 1, source_id: 'local:android' }))
  assert.equal(sameSourceEntity({ id: 4, source_id: 'local:android', local_key: 'external:20' }, { id: 7, source_id: 'local:android', local_key: 'external:20' }), true)
})

test('server profiles reject embedded credentials and insecure public endpoints', () => {
  for (const value of ['http://user:secret@192.168.1.2', 'http://music.example.com', 'file:///music', 'https://music.example.com/?token=secret']) {
    assert.throws(() => normalizeRemoteBaseUrl(value))
  }
  assert.equal(normalizeRemoteBaseUrl('https://music.example.com/muze/'), 'https://music.example.com/muze/api')
  assert.equal(normalizeRemoteBaseUrl('http://[::1]:8000'), 'http://[::1]:8000/api')
  assert.equal(normalizeRemoteBaseUrl('http://[fd12:3456::1]:8000'), 'http://[fd12:3456::1]:8000/api')
})

test('invalid saved profiles cannot restore an unsafe or unavailable provider', () => {
  const settings = readSourceSettings(JSON.stringify({
    activeSourceId: 'local:windows',
    remotes: [{ name: 'bad', baseUrl: 'https://user:password@host.example' }],
  }), 'android')
  assert.equal(settings.activeSourceId, 'local:android')
  assert.equal(settings.remotes.length, 0)
  assert.equal(readSourceSettings('{', 'windows').activeSourceId, 'local:windows')
})
