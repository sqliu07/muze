import type { EqualizerState } from '../../lib/equalizer'
import { DEFAULT_EQUALIZER_BANDS, equalizerPreampDb } from '../../lib/equalizer'
import type { PlaybackEngine, PlaybackQueue, PlaybackSnapshot, PlaybackMode } from '../contracts/playback'
import { getTrackStreamUrl } from '../../api/client'

/** One audio element and graph per runtime, independent of React renders. */
export class WebAudioEngine implements PlaybackEngine {
  readonly capabilities = { equalizer: true, spectrum: true, backgroundPlayback: true }
  readonly ownsQueue = false
  readonly audio: HTMLAudioElement
  private context: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private preamp: GainNode | null = null
  private filters: BiquadFilterNode[] = []
  private analyser: AnalyserNode | null = null
  private connectedEQ = false
  private equalizer: EqualizerState | null = null
  private queue: PlaybackQueue | null = null
  private listeners = new Set<(snapshot: PlaybackSnapshot) => void>()
  private initialized = false
  private frame: number | null = null
  private lastTime = -1
  constructor(audio?: HTMLAudioElement) {
    this.audio = audio ?? new Audio()
    this.audio.preload = 'auto'
    this.audio.crossOrigin = 'anonymous'
  }
  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    this.audio.addEventListener('playing', () => { this.emit(); this.startFrame() })
    this.audio.addEventListener('pause', () => { this.stopFrame(); this.emit() })
    this.audio.addEventListener('timeupdate', () => { if (this.audio.paused) this.emit() })
    this.audio.addEventListener('ended', () => { this.stopFrame(); this.emit({ ended: true }) })
    this.audio.addEventListener('error', () => { this.stopFrame(); this.emit({ error: '无法播放该文件，请检查文件是否可用或格式是否支持。' }) })
    this.audio.addEventListener('loadedmetadata', () => {
      if (this.queue?.position) this.audio.currentTime = Math.min(this.queue.position, this.audio.duration)
      this.emit()
    })
  }
  async setQueue(queue: PlaybackQueue): Promise<void> {
    await this.initialize()
    this.audio.pause()
    this.queue = queue
    const track = queue.tracks[queue.index]
    if (!track) { this.audio.removeAttribute('src'); this.audio.load(); return }
    this.audio.src = track.playback_url ?? getTrackStreamUrl(track.id, track.source_id)
    this.audio.load()
    this.updateMediaSession()
  }
  async play(): Promise<void> {
    if (!this.queue?.tracks[this.queue.index]) return
    this.ensureGraph()
    if (this.context?.state === 'suspended') await this.context.resume()
    await this.audio.play()
  }
  pause(): void { this.audio.pause() }
  seek(position: number): void {
    const safe = Math.max(0, Number.isFinite(position) ? position : 0)
    if (this.queue) this.queue.position = safe
    if (this.audio.readyState > 0) this.audio.currentTime = safe
    this.emit()
  }
  setVolume(volume: number): void { this.audio.volume = Math.max(0, Math.min(1, volume)) }
  setMode(mode: PlaybackMode): void { if (this.queue) this.queue.mode = mode }
  getPosition(): number { return Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0 }
  getAudioContext(): AudioContext {
    if (!this.context) this.context = new AudioContext()
    return this.context
  }
  getAnalyser(): AnalyserNode | null { return this.analyser }
  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit(extra: Partial<PlaybackSnapshot> = {}): void {
    const snapshot: PlaybackSnapshot = { index: this.queue?.index ?? -1, position: this.getPosition(), duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0, isPlaying: !this.audio.paused && !this.audio.ended, mode: this.queue?.mode ?? 'sequential', generation: this.queue?.generation, ...extra }
    this.listeners.forEach((listener) => listener(snapshot))
    if (typeof navigator !== 'undefined' && navigator.mediaSession) navigator.mediaSession.playbackState = snapshot.isPlaying ? 'playing' : 'paused'
  }
  private startFrame(): void {
    this.stopFrame()
    const tick = () => {
      const time = this.getPosition()
      if (Math.abs(time - this.lastTime) >= 0.1) { this.lastTime = time; this.emit() }
      if (!this.audio.paused && !this.audio.ended) this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }
  private stopFrame(): void { if (this.frame !== null) cancelAnimationFrame(this.frame); this.frame = null }
  private ensureGraph(): void {
    if (this.source) return
    const context = this.getAudioContext()
    this.source = context.createMediaElementSource(this.audio)
    this.preamp = context.createGain()
    this.filters = DEFAULT_EQUALIZER_BANDS.map((band) => {
      const filter = context.createBiquadFilter()
      filter.type = 'peaking'; filter.frequency.value = Math.min(band.frequency, context.sampleRate / 2 - 1); filter.Q.value = 0.85
      return filter
    })
    const limiter = context.createDynamicsCompressor()
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 18; limiter.attack.value = 0.003; limiter.release.value = 0.16
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.4
    this.source.connect(this.analyser)
    let previous: AudioNode = this.preamp
    for (const filter of this.filters) { previous.connect(filter); previous = filter }
    previous.connect(limiter); limiter.connect(this.analyser); this.analyser.connect(context.destination)
    if (this.equalizer) this.setEqualizer(this.equalizer)
  }
  setEqualizer(equalizer: EqualizerState): void {
    this.equalizer = equalizer
    if (!this.source || !this.preamp || !this.analyser || !this.context) return
    if (this.connectedEQ !== equalizer.enabled) { this.source.disconnect(); this.source.connect(equalizer.enabled ? this.preamp : this.analyser); this.connectedEQ = equalizer.enabled }
    this.preamp.gain.setTargetAtTime(Math.pow(10, equalizerPreampDb(equalizer, this.context.sampleRate) / 20), this.context.currentTime, 0.01)
    this.filters.forEach((filter, index) => { filter.gain.setTargetAtTime(equalizer.enabled ? equalizer.bands[index]?.gain ?? 0 : 0, this.context!.currentTime, 0.01) })
  }
  private updateMediaSession(): void {
    const track = this.queue?.tracks[this.queue.index]
    if (!track || typeof navigator === 'undefined' || !navigator.mediaSession) return
    if (typeof MediaMetadata !== 'undefined') navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist?.name ?? '', album: track.album?.title ?? '', artwork: track.cover_url ? [{ src: track.cover_url }] : [] })
  }
}
