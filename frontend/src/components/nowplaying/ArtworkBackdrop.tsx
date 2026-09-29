import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { subscribeAudioAnalysis } from "@/hooks/useAudioAnalyser"
import {
  DEFAULT_BACKGROUND_RHYTHM,
  getBackgroundDebugSettings,
  setBackgroundRhythmSnapshot,
  subscribeBackgroundDebugSettings,
} from "@/lib/backgroundDebug"
import { RhythmTracker } from "@/lib/rhythm"

type RGB = [number, number, number]

interface ArtworkBackdropProps {
  colors: RGB[]
  reducedMotion: boolean
}

function mix(left: RGB, right: RGB, rightWeight: number): RGB {
  return left.map((channel, index) =>
    Math.round(channel * (1 - rightWeight) + right[index] * rightWeight)
  ) as RGB
}

function rgb(color: RGB): string {
  return `rgb(${color.join(",")})`
}

/** Render album colors as one continuous field without displaying the artwork. */
export function ArtworkBackdrop({ colors, reducedMotion }: ArtworkBackdropProps) {
  const [debug, setDebug] = useState(getBackgroundDebugSettings)
  const reactiveLayerRef = useRef<HTMLDivElement>(null)
  const animatedLayerRef = useRef<HTMLDivElement>(null)
  const lastRhythmPublishRef = useRef(0)
  useEffect(() => subscribeBackgroundDebugSettings(setDebug), [])

  const base = colors[0] ?? [22, 24, 29]
  const accent = colors[1] ?? base
  const secondary = colors[2] ?? accent
  const intensity = debug.intensity
  const start = mix(base, accent, Math.min(0.98, 0.28 + 0.44 * intensity))
  const middle = mix(base, secondary, Math.min(0.98, 0.24 + 0.4 * intensity))
  const end = mix(
    base,
    mix(accent, secondary, 0.5),
    Math.min(0.9, 0.18 + 0.28 * intensity)
  )
  const paletteKey = colors.flat().join("-")
  const backgroundScale = 100 + 25 * intensity
  const duration = 14 / debug.speed

  useEffect(() => {
    const reactiveLayer = reactiveLayerRef.current
    const animatedLayer = animatedLayerRef.current
    if (!reactiveLayer || !animatedLayer) return

    const resetReactiveStyle = () => {
      reactiveLayer.style.transform = ""
      reactiveLayer.style.filter = ""
      const animation = animatedLayer.getAnimations()[0]
      if (animation) animation.playbackRate = 1
      setBackgroundRhythmSnapshot({ ...DEFAULT_BACKGROUND_RHYTHM })
    }
    if (!debug.audioReactive || reducedMotion) {
      resetReactiveStyle()
      return
    }

    const tracker = new RhythmTracker()
    const unsubscribe = subscribeAudioAnalysis((frame) => {
      const now = performance.now()
      const rhythm = tracker.update(frame, now)
      const scale = 1 + rhythm.pulse * 0.022 * debug.intensity
      const saturation = 1 + (rhythm.intensityMultiplier - 0.82) * 0.16
      const brightness = 1 + rhythm.pulse * 0.055
      reactiveLayer.style.transform = `scale(${scale.toFixed(4)})`
      reactiveLayer.style.filter = `saturate(${saturation.toFixed(4)}) brightness(${brightness.toFixed(4)})`

      const animation = animatedLayer.getAnimations()[0]
      if (animation) animation.playbackRate = rhythm.speedMultiplier
      if (now - lastRhythmPublishRef.current >= 200) {
        lastRhythmPublishRef.current = now
        setBackgroundRhythmSnapshot(rhythm)
      }
    })
    return () => {
      unsubscribe()
      resetReactiveStyle()
    }
  }, [debug.audioReactive, debug.intensity, paletteKey, reducedMotion])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden transition-colors duration-1000"
      style={{ backgroundColor: rgb(base) }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          ref={reactiveLayerRef}
          key={paletteKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.25 : 1.35, ease: "easeInOut" }}
          className="absolute inset-0"
          style={{ willChange: reducedMotion ? "opacity" : "opacity, transform, filter" }}
        >
          <div
            ref={animatedLayerRef}
            className={`absolute inset-[-10%] ${reducedMotion ? "" : "nowplaying-palette-drift"}`}
            style={{
              backgroundImage: `linear-gradient(125deg, ${rgb(start)} 0%, ${rgb(base)} 30%, ${rgb(middle)} 68%, ${rgb(end)} 100%)`,
              backgroundSize: `${backgroundScale}% ${backgroundScale}%`,
              animationDuration: `${duration}s`,
              animationPlayState: intensity === 0 ? "paused" : "running",
              backgroundPosition: intensity === 0 ? "50% 50%" : undefined,
              "--np-palette-sat-low": 1 - 0.04 * intensity,
              "--np-palette-sat-high": 1 + 0.12 * intensity,
              "--np-palette-bright-low": 1 - 0.04 * intensity,
              "--np-palette-bright-high": 1 + 0.04 * intensity,
              willChange: reducedMotion ? "opacity" : "background-position, filter",
            } as React.CSSProperties}
          />
        </motion.div>
      </AnimatePresence>

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(3,5,9,0.08) 0%, rgba(3,5,9,0.18) 48%, rgba(3,5,9,0.50) 100%), linear-gradient(90deg, rgba(3,5,9,0.08) 0%, transparent 48%, rgba(3,5,9,0.06) 100%)",
        }}
      />
    </div>
  )
}

export default ArtworkBackdrop
