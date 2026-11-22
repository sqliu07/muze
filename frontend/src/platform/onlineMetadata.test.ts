import assert from 'node:assert/strict'
import test from 'node:test'
import type { LyricsCandidate, LyricsOut, TrackOut } from '../types/api.ts'
import type { LibraryMethod, LibraryProvider, LibraryQuery } from './contracts/library.ts'
import { extractTranslationLines, handleNativeOnlineRequest, isAllowedArtworkUrl, OnlineMetadataError, parseDeepSeekTranslation, scoreLyricsCandidate, yrcToVerbatimLrc } from './onlineMetadata.ts'
import { parseLrc } from '../lib/lrcParser.ts'
import { requestLibrary } from './library.ts'

const fixtureTrack = {
  id: 7, title: '七百年后', duration: 262.36, format: 'flac',
  artist: { id: 3, name: '陈奕迅', cover_path: null },
  album: { id: 5, title: 'H³M', total_tracks: 10, cover_path: null },
} as TrackOut

type Gateway = (url: URL, body: Record<string, unknown>) => { status: number; body: unknown }
class MemoryProvider implements LibraryProvider {
  source = { id: 'local:android', kind: 'local' as const, name: 'Local', platform: 'android' as const }
  requests: { method: string; path: string; body: unknown }[] = []
  track = { ...fixtureTrack }
  lyrics = { id: 1, track_id: 7, source: 'embedded', content: '[00:01.100]first[00:01.400] line\n[00:03.000]second line', synced: true, translated_content: null } as LyricsOut
  configured = true
  gateway: Gateway
  constructor(gateway: Gateway) { this.gateway = gateway }
  mediaUrl(id: number): string { return `muze-native://track/${id}` }
  async request<T>(method: LibraryMethod, path: string, _query?: LibraryQuery, body?: unknown): Promise<T> {
    this.requests.push({ method, path, body })
    let result: unknown
    if (path === '/tracks/7' && method === 'GET') result = this.track
    else if (path === '/lyrics/7' && method === 'GET') result = this.lyrics
    else if (path === '/lyrics/7' && method === 'PUT') { this.lyrics = { ...this.lyrics, ...(body as object) }; result = this.lyrics }
    else if (path === '/settings') result = { deepseek_configured: this.configured, deepseek_api_key: '********', deepseek_model: 'deepseek-flash' }
    else if (path === '/online/http') { const options = body as Record<string, unknown>; result = this.gateway(new URL(options.url as string), options) }
    else if (path === '/tracks/7/cover') result = { ...this.track, has_cover: true }
    else throw new Error(`Unexpected raw route ${method} ${path}`)
    return result as T
  }
}

function candidate(overrides: Partial<LyricsCandidate> = {}): LyricsCandidate {
  return { source: 'netease', synced: true, word_level: true, preview: '', content: '[00:01.000]你[00:01.500]好[00:02.000]', translated_content: null, song_title: '七百年后', song_artist: '陈奕迅', duration_seconds: 262.36, ...overrides }
}

test('real word duration survives YRC conversion without averaging or a visual lead', () => {
  const content = yrcToVerbatimLrc('[17750,2210](17750,510,0)你(18260,230,0)那(18490,400,0)太(18890,240,0)空(19130,830,0)舱')
  assert.ok(content)
  const line = parseLrc(content)[0]
  assert.equal(line.words?.[0].start, 17.75)
  assert.equal(line.words?.[0].end, 18.26)
  assert.equal(line.words?.[4].start, 19.13)
  assert.equal(line.words?.[4].end, 19.96)
  assert.equal(yrcToVerbatimLrc('[0,100](0,600,0)bad'), null)
})

test('Android searches the native LDDC-compatible KRC provider and keeps exact held word ends', async () => {
  class AndroidProvider extends MemoryProvider {
    async request<T>(method: LibraryMethod, path: string, query?: LibraryQuery, body?: unknown): Promise<T> {
      if (path === '/online/kugou/candidates') {
        assert.equal(method, 'GET')
        assert.deepEqual(query, { title: '七百年后', artist: '陈奕迅', duration: 262.36, limit: 3 })
        return [candidate({ source: 'lddc:kg', content: '[00:36.620]存[00:36.840][00:38.290]缸[00:40.060]' })] as T
      }
      return super.request<T>(method, path, query, body)
    }
  }
  const provider = new AndroidProvider((url) => ({ status: 200, body: url.hostname === 'lrclib.net'
    ? [{ trackName: fixtureTrack.title, artistName: fixtureTrack.artist!.name, duration: 262.36, syncedLyrics: '[00:32.640]缤纷星空抛低我寄存繁荣垃圾缸' }]
    : { code: 200, result: { songs: [] } } }))
  const result = await handleNativeOnlineRequest(provider, 'POST', '/lyrics/7/search', { refresh: 1 }, { title: fixtureTrack.title, artist: fixtureTrack.artist!.name })
  assert.ok(result.handled)
  assert.equal((result.data as LyricsOut).source, 'lddc:kg')
  const words = parseLrc((result.data as LyricsOut).content!)[0].words!
  assert.deepEqual(words.map(({ start, end }) => ({ start, end })), [{ start: 36.62, end: 36.84 }, { start: 38.29, end: 40.06 }])
})

test('Android KRC candidates retain edition and timing anomaly checks before automatic replacement', async () => {
  class AndroidProvider extends MemoryProvider {
    async request<T>(method: LibraryMethod, path: string, query?: LibraryQuery, body?: unknown): Promise<T> {
      if (path === '/online/kugou/candidates') return [candidate({ source: 'lddc:kg', song_title: '七百年后 (Live)', duration_seconds: 274 })] as T
      return super.request<T>(method, path, query, body)
    }
  }
  const provider = new AndroidProvider((url) => ({ status: 200, body: url.hostname === 'lrclib.net' ? [] : { code: 200, result: { songs: [] } } }))
  await assert.rejects(handleNativeOnlineRequest(provider, 'POST', '/lyrics/7/search', { refresh: 1 }, { title: fixtureTrack.title, artist: fixtureTrack.artist!.name }), (error: unknown) =>
    error instanceof OnlineMetadataError && error.code === 'confirmation_required')
  assert.equal(provider.requests.some((request) => request.method === 'PUT'), false)
})

test('studio duration and edition outrank even word-timed live lyrics', () => {
  const studio = scoreLyricsCandidate(candidate({ word_level: false }), fixtureTrack, 'H³M')
  const live = scoreLyricsCandidate(candidate({ song_title: '七百年后 (Live)', duration_seconds: 274.8 }), fixtureTrack, 'DUO 2010演唱会')
  assert.ok(studio.score > live.score)
  assert.equal(studio.confident, true)
  assert.equal(live.confident, false)
  assert.equal(scoreLyricsCandidate(candidate({ duration_seconds: 180 }), fixtureTrack).confident, false)
})

test('collapsed long-hold and instant boundaries cannot be auto-applied merely because metadata matches', () => {
  const bad = candidate({ content: '[00:36.220]寄[00:36.450]存[00:38.280]繁[00:38.340]荣[00:39.860]垃[00:39.920]圾[00:39.980]缸[00:40.040]' })
  const normal = candidate({ content: '[00:36.420]寄[00:36.620]存[00:36.840]繁[00:37.220]荣[00:37.600]垃[00:37.890]圾[00:38.290]缸[00:40.060]' })
  const rejected = scoreLyricsCandidate(bad, fixtureTrack, 'H³M')
  const preferred = scoreLyricsCandidate(normal, fixtureTrack, 'H³M')
  assert.ok(preferred.score > rejected.score)
  assert.equal(rejected.confident, false)
  assert.equal(preferred.confident, true)
})

test('line-synced lyrics require explicit confirmation and never receive synthetic word timings', async () => {
  const provider = new MemoryProvider((url) => url.hostname === 'lrclib.net'
    ? { status: 200, body: [{ trackName: 'Line only test', artistName: '陈奕迅', albumName: 'H³M', duration: 262.36, syncedLyrics: '[00:01.00]First line' }] }
    : { status: 200, body: { result: { songs: [] }, code: 200 } })
  const body = { title: 'Line only test', artist: '陈奕迅' }
  await assert.rejects(handleNativeOnlineRequest(provider, 'POST', '/lyrics/7/search', { refresh: 1 }, body), (error: unknown) => {
    assert.ok(error instanceof OnlineMetadataError)
    assert.equal(error.response.status, 409)
    assert.equal((error.response.data.detail as { synced: boolean }).synced, true)
    return true
  })
  assert.equal(provider.requests.filter((request) => request.method === 'PUT').length, 0)
  const applied = await handleNativeOnlineRequest(provider, 'POST', '/lyrics/7/search', { allow_unsynced: 1 }, body)
  assert.equal(applied.handled, true)
  assert.equal(provider.lyrics.content, '[00:01.000]First line')
  assert.equal(parseLrc(provider.lyrics.content!)[0].words, undefined)
})

test('native searches fetch real NetEase word candidates and store the matched recording', async () => {
  const provider = new MemoryProvider((url) => {
    if (url.hostname === 'lrclib.net') return { status: 200, body: [] }
    if (url.pathname.endsWith('/search/get')) return { status: 200, body: { code: 200, result: { songs: [
      { id: 64439, name: '七百年后 (Live)', duration: 274800, artists: [{ name: '陈奕迅' }], album: { name: 'DUO演唱会' } },
      { id: 64815, name: '七百年后', duration: 262360, artists: [{ name: '陈奕迅' }], album: { name: 'H³M' } },
    ] } } }
    return { status: 200, body: { code: 200, yrc: { lyric: url.searchParams.get('id') === '64815' ? '[1000,1300](1000,400,0)你(1400,900,0)好' : '[4000,1400](4000,500,0)Live(4500,900,0)word' } } }
  })
  const result = await handleNativeOnlineRequest(provider, 'POST', '/lyrics/7/search/lddc-candidates', { refresh: 1 }, { title: '七百年后', artist: '陈奕迅' })
  assert.equal(result.handled, true)
  if (!result.handled) return
  const candidates = result.data as LyricsCandidate[]
  assert.equal(candidates[0].duration_seconds, 262.36)
  assert.equal(candidates[0].word_level, true)
  await handleNativeOnlineRequest(provider, 'POST', '/lyrics/7/search', {}, { title: '七百年后', artist: '陈奕迅' })
  assert.equal(provider.lyrics.source, 'netease')
  assert.equal(parseLrc(provider.lyrics.content!)[0].words?.[1].end, 2.3)
})

test('iTunes cover lookup deduplicates trusted artwork and applies via the native bounded downloader', async () => {
  const url = 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/album/100x100bb.jpg'
  const provider = new MemoryProvider(() => ({ status: 200, body: { results: [
    { artworkUrl100: url, collectionName: 'H³M', artistName: '陈奕迅' },
    { artworkUrl100: url, collectionName: 'duplicate', artistName: '陈奕迅' },
    { artworkUrl100: 'https://mzstatic.com.evil.example/100x100bb.jpg', collectionName: 'bad' },
  ] } }))
  const candidates = await handleNativeOnlineRequest(provider, 'POST', '/tracks/7/cover/candidates', {}, { title: 'H³M', artist: '陈奕迅' })
  assert.ok(candidates.handled)
  assert.equal((candidates.data as TrackOut[]).length, 1)
  await handleNativeOnlineRequest(provider, 'POST', '/tracks/7/cover/search')
  const applied = provider.requests.find((request) => request.path === '/tracks/7/cover')?.body as { image_url: string }
  assert.equal(applied.image_url, url.replace('100x100bb', '600x600bb'))
  assert.equal(isAllowedArtworkUrl('http://is1-ssl.mzstatic.com/a.jpg'), false)
  assert.equal(isAllowedArtworkUrl('https://user:pass@is1-ssl.mzstatic.com/a.jpg'), false)
})

test('Chinese cover lookup normalizes album typography and searches an appropriate storefront', async () => {
  const provider = new MemoryProvider((url) => {
    assert.equal(url.searchParams.get('country'), 'HK')
    assert.equal(url.searchParams.get('term'), '陈奕迅 H3M')
    return { status: 200, body: { results: [{ artworkUrl100: 'https://is1-ssl.mzstatic.com/image/100x100bb.jpg', collectionName: 'H3M', artistName: '陳奕迅' }] } }
  })
  const result = await handleNativeOnlineRequest(provider, 'POST', '/tracks/7/cover/candidates', {}, { title: 'H³M', artist: '陈奕迅' })
  assert.ok(result.handled)
  assert.equal((result.data as unknown[]).length, 1)
})

function deepseekResponse(rows: unknown, finish = 'stop') {
  return { choices: [{ finish_reason: finish, message: { content: JSON.stringify({ lines: rows }) } }] }
}

test('DeepSeek maps IDs rather than response order and rejects omissions or invented timestamps', () => {
  assert.deepEqual(parseDeepSeekTranslation(deepseekResponse([{ id: 2, text: '第二行' }, { id: 0, text: '第一行' }]), [0, 2]), ['第一行', '第二行'])
  for (const response of [
    deepseekResponse([{ id: 0, text: 'first' }, { id: 0, text: 'duplicate' }]),
    deepseekResponse([{ id: 0, text: 'only one' }]),
    deepseekResponse([{ id: 0, text: '[00:12.000]timestamp' }, { id: 2, text: 'second' }]),
    deepseekResponse([{ id: 0, text: 'first' }, { id: 2, text: 'second' }], 'length'),
    { choices: [{ finish_reason: 'stop', message: { content: '{broken' } }] },
  ]) assert.throws(() => parseDeepSeekTranslation(response, [0, 2]), OnlineMetadataError)
})

test('translation preserves repeated chorus timestamps and skips lyric metadata', () => {
  assert.deepEqual(extractTranslationLines('[ar:artist]\n[00:10.00][01:10.00]Chorus\n\n[00:20.00]Last'), [
    { id: 1, prefix: '[00:10.00][01:10.00]', text: 'Chorus' },
    { id: 3, prefix: '[00:20.00]', text: 'Last' },
  ])
})

test('translation keeps the original timestamps and only delegates key injection to native code', async () => {
  const provider = new MemoryProvider((_url, options) => {
    assert.equal(options.deepseek, true)
    assert.equal(JSON.stringify(options).includes('********'), false)
    const payload = options.body as { response_format: { type: string }; messages: { content: string }[] }
    assert.equal(payload.response_format.type, 'json_object')
    assert.deepEqual(JSON.parse(payload.messages[1].content), { lines: [{ id: 0, text: 'first line' }, { id: 1, text: 'second line' }] })
    return { status: 200, body: deepseekResponse([{ id: 1, text: '第二行' }, { id: 0, text: '第一行' }]) }
  })
  const original = provider.lyrics.content
  await handleNativeOnlineRequest(provider, 'POST', '/lyrics/7/translate')
  assert.equal(provider.lyrics.content, original)
  assert.equal(provider.lyrics.translated_content, '[00:01.100]第一行\n[00:03.000]第二行')
})

test('failed translation never overwrites local lyrics and settings test classifies authentication safely', async () => {
  const provider = new MemoryProvider(() => ({ status: 200, body: deepseekResponse([{ id: 0, text: 'missing second line' }]) }))
  await assert.rejects(handleNativeOnlineRequest(provider, 'POST', '/lyrics/7/translate'), OnlineMetadataError)
  assert.equal(provider.requests.some((request) => request.method === 'PUT'), false)
  provider.gateway = () => ({ status: 401, body: { message: 'secret upstream token must not escape' } })
  const result = await handleNativeOnlineRequest(provider, 'POST', '/settings/deepseek/test')
  assert.ok(result.handled)
  assert.deepEqual(result.data, { ok: false, code: 'authentication', message: 'DeepSeek API 密钥无效，请在设置中重新填写。' })
  provider.configured = false
  const missing = await handleNativeOnlineRequest(provider, 'POST', '/settings/deepseek/test')
  assert.ok(missing.handled)
  assert.equal((missing.data as { code: string }).code, 'missing_key')
})

test('remote providers and unrelated native methods are left to their existing transport', async () => {
  const provider = new MemoryProvider(() => { throw new Error('No request expected') })
  assert.deepEqual(await handleNativeOnlineRequest(provider, 'GET', '/lyrics/7'), { handled: false })
  assert.deepEqual(await handleNativeOnlineRequest({ ...provider, source: { id: 'remote:demo', kind: 'remote', name: 'NAS' }, request: provider.request, mediaUrl: provider.mediaUrl }, 'POST', '/lyrics/7/search'), { handled: false })
  assert.equal(provider.requests.length, 0)
})

test('the public native library dispatcher intercepts searches instead of invoking unsupported raw routes', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const rawPaths: string[] = []
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    __TAURI_INTERNALS__: { invoke: async (command: string, options: { method: string; path: string; body: Record<string, unknown> }) => {
      assert.equal(command, 'library_request')
      rawPaths.push(options.path)
      if (options.path === '/tracks/7') return { ...fixtureTrack, title: 'Dispatcher test' }
      if (options.path === '/lyrics/7' && options.method === 'PUT') return { id: 1, track_id: 7, ...options.body }
      assert.equal(options.path, '/online/http')
      const url = new URL(options.body.url as string)
      return { status: 200, body: url.hostname === 'lrclib.net'
        ? JSON.stringify([{ trackName: 'Dispatcher test', artistName: '陈奕迅', duration: 262.36, syncedLyrics: '[00:01.000]First[00:01.400] word[00:02.000]' }])
        : { code: 200, result: { songs: [] } } }
    } },
  } })
  try {
    const result = await requestLibrary<LyricsOut>('POST', '/lyrics/7/search', { refresh: 1 }, { title: 'Dispatcher test', artist: '陈奕迅' }, 'local:windows')
    assert.equal(result.source, 'lrclib')
    assert.equal(result.source_id, 'local:windows')
    assert.equal(rawPaths.includes('/lyrics/7/search'), false)
    assert.equal(rawPaths.includes('/lyrics/7'), true)
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
