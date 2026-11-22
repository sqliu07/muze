import type { PlaybackSnapshot } from '../contracts/playback'

export interface AndroidPlaybackSnapshot extends PlaybackSnapshot {
  /** Actual Media3 advancement, distinct from the user's play intent while buffering. */
  isAdvancing?: boolean
  isBuffering?: boolean
  playbackSpeed?: number
  sequence?: number
}

/** Interpolate only the short interval between authoritative native position samples. */
export class AndroidPlaybackTimeline {
  private snapshot: AndroidPlaybackSnapshot | undefined
  private sampledAt = 0
  private advancing = false
  private foreground = true
  private readonly now: () => number

  constructor(now: () => number = () => performance.now()) { this.now = now }

  update(snapshot: AndroidPlaybackSnapshot): void {
    const previous = this.snapshot
    const sameItem = previous?.generation === snapshot.generation && previous?.index === snapshot.index
    // Older bridges lack actual advancement. Require observed movement rather than
    // treating play intent (which also covers buffering) as a running clock.
    const advancing = snapshot.isAdvancing ?? (
      sameItem && previous?.isPlaying === true && snapshot.position > previous.position
    )
    this.snapshot = snapshot
    this.sampledAt = this.now()
    this.advancing = advancing && snapshot.isPlaying && !snapshot.isBuffering && !snapshot.ended && !snapshot.error
  }

  setForeground(foreground: boolean): void {
    if (this.foreground === foreground) return
    this.foreground = foreground
    // Returning from suspension requires a fresh native sample before extrapolation.
    this.advancing = false
  }

  getPosition(): number {
    const snapshot = this.snapshot
    if (!snapshot) return 0
    const position = Number.isFinite(snapshot.position) ? Math.max(0, snapshot.position) : 0
    const speed = typeof snapshot.playbackSpeed === 'number' && Number.isFinite(snapshot.playbackSpeed) ? Math.max(0, snapshot.playbackSpeed) : 1
    // Native ticks arrive every 100 ms. Never manufacture seconds of playback if
    // the bridge stalls, the WebView sleeps, or buffering stops position updates.
    const elapsed = this.foreground && this.advancing ? Math.min(250, Math.max(0, this.now() - this.sampledAt)) / 1000 : 0
    const result = position + elapsed * speed
    return Number.isFinite(snapshot.duration) && snapshot.duration > 0 ? Math.min(snapshot.duration, result) : result
  }
}
