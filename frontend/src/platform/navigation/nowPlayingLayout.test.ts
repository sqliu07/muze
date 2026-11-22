import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'

// Render the real player layout with deterministic data and leaf components;
// this checks JSX wiring, not browser geometry, animations, gestures or native audio.
const key = '__muzePlayerLayoutTest'
const mocks: Record<string, string> = {
  store: `export const usePlayerStore=(selector)=>selector(globalThis.${key}.player); export const currentTrackSelector=(state)=>state.queue[state.currentIndex];`,
  ui: `export const useUIStore=(selector)=>selector({nowPlayingOpen:true,setNowPlayingOpen:()=>{}});`,
  hooks: `const mutation=()=>({mutate:()=>{},mutateAsync:async()=>[],isPending:false}); export const useLyrics=()=>({data:null}); export const useSearchLyrics=mutation; export const useRestoreLyrics=mutation; export const useSaveLyrics=mutation; export const useSearchLddcCandidates=mutation; export const useUpdateLyricsOffset=mutation; export const useToggleFavorite=mutation; export const usePlaylists=()=>({data:[]}); export const useAddTracksToPlaylist=mutation; export const useApplyTrackCover=mutation; export const useSearchTrackCover=mutation; export const useSearchTrackCoverCandidates=mutation;`,
  runtime: `export const getPlaybackCapabilities=()=>globalThis.${key}.capabilities;`,
  library: `export const trackIdentity=(track)=>track.source_id+':'+track.id;`,
  source: `export const useLibrarySource=()=>({id:'local:android'});`,
  audio: `export const seekAudio=()=>{};`,
  client: `export const getTrackCoverUrl=()=>'';`,
  colors: `export const useColorThief=()=>[[20,30,40]];`,
  artwork: `import {createElement} from 'react'; export default function Artwork(){return createElement('div',{'data-player-artwork':true})}`,
  lyrics: `import {createElement} from 'react'; export default function Lyrics(){return createElement('div',{'data-player-lyrics':true})}`,
  decorative: `export default function Decorative(){return null} export const SpectrumVisualizer=Decorative;`,
  equalizer: `import {createElement} from 'react'; export const EqualizerControl=()=>createElement('button',{'aria-label':'均衡器'});`,
  motion: `import {createElement,Fragment} from 'react'; export const AnimatePresence=({children})=>createElement(Fragment,null,children); export const useReducedMotion=()=>true; export const motion=new Proxy({}, {get:(_,tag)=>({children,initial,animate,exit,transition,layout,...props})=>createElement(tag,props,children)});`,
}
const boundaries: Record<string, string> = {
  '@/store/playerStore': 'store', '@/store/uiStore': 'ui',
  '@/platform/playback/runtime': 'runtime', '@/platform/library': 'library',
  '@/platform/useLibrarySource': 'source', '@/hooks/useAudio': 'audio',
  '@/api/client': 'client', '@/hooks/useColorThief': 'colors',
  './CoverArt': 'artwork', './LyricsView': 'lyrics',
  './SpectrumVisualizer': 'decorative', './ArtworkBackdrop': 'decorative',
  './BackgroundDebugPanel': 'decorative', '@/components/player/EqualizerControl': 'equalizer',
  'framer-motion': 'motion',
}
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../../components/nowplaying/NowPlayingPage.tsx', import.meta.url))],
  alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  jsx: 'automatic',
  plugins: [{ name: 'player-layout-boundaries', setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => {
      if (path === 'react') return { path, external: true }
      const boundary = path.startsWith('@/api/hooks/') ? 'hooks' : boundaries[path]
      return boundary ? { path: boundary, namespace: 'layout-test' } : undefined
    })
    builder.onLoad({ filter: /.*/, namespace: 'layout-test' }, ({ path }) => ({ contents: mocks[path], loader: 'js' }))
  } }],
})
const module = { exports: {} }
new Script(`(function(require,module,exports){${bundled.outputFiles[0].text}\n})`)
  .runInThisContext()(createRequire(import.meta.url), module, module.exports)
const Player = (module.exports as { default: () => ReturnType<typeof createElement> }).default

function renderPlayer(narrow: boolean, featuresUnavailable: boolean): string {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const noop = () => {}
  const track = { id: 7, source_id: 'local:android', title: 'Test song', artist: null, album: null, duration: 180, has_cover: false }
  Object.defineProperty(globalThis, key, { configurable: true, value: {
    capabilities: { equalizer: !featuresUnavailable, spectrum: !featuresUnavailable, backgroundPlayback: true },
    player: { queue: [track], currentIndex: 0, currentTime: 0, isPlaying: false, playbackError: null,
      setPlaying: noop, playNext: noop, playPrev: noop, toggleCurrentTrackFavorite: noop,
      setQueue: noop, removeFromQueue: noop, playMode: 'sequential', cyclePlayMode: noop },
  } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: narrow }) } })
  try { return renderToStaticMarkup(createElement(Player)) }
  finally {
    Reflect.deleteProperty(globalThis, key)
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
}

test('actual mobile player has bottom toggles instead of content tabs and honors unavailable capabilities', () => {
  const html = renderPlayer(true, true)
  assert.doesNotMatch(html, /role="tablist"|role="tabpanel"|mobile-player-tab-/)
  assert.equal((html.match(/aria-label="显示歌词"/g) ?? []).length, 2, 'both layouts wire the same visibility state')
  assert.equal((html.match(/aria-label="待播列表"/g) ?? []).length, 2, 'both layouts expose the queue sheet')
  assert.match(html, /aria-haspopup="dialog"/)
  assert.match(html, /data-player-artwork="true"/)
  assert.doesNotMatch(html, /data-player-lyrics="true"|aria-label="显示频谱"/)
})

test('actual desktop player retains initially visible lyrics and the Web spectrum action', () => {
  const html = renderPlayer(false, false)
  assert.doesNotMatch(html, /role="tablist"|role="tabpanel"|mobile-player-tab-/)
  assert.equal((html.match(/aria-label="隐藏歌词"/g) ?? []).length, 2)
  assert.match(html, /data-player-lyrics="true"/)
  assert.match(html, /aria-label="显示频谱"/)
})

test('a capable native mobile engine exposes real EQ and spectrum without the old unavailable notice', () => {
  const html = renderPlayer(true, false)
  assert.match(html, /aria-label="均衡器"/)
  assert.match(html, /aria-label="显示频谱"/)
  assert.match(html, /aria-label="显示歌词"/)
  assert.doesNotMatch(html, /暂不支持均衡器|role="tablist"|mobile-player-tab-/)
})
