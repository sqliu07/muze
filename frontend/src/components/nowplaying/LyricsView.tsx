import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef } from "react"
import useLyricSync from "@/hooks/useLyricSync"
import { getAudioCurrentTime } from "@/hooks/useAudio"
import type { LyricsOut } from "@/types/api"

interface LyricsViewProps {
  lyrics: LyricsOut | null | undefined
  onSeek?: (time: number) => void
}

const LYRIC_ROW_HEIGHT = 92

function LyricsView({ lyrics, onSeek }: LyricsViewProps) {
  const {
    lines,
    currentIndex,
    interludeProgress,
    interludeAfterIndex,
    currentLineProgress,
  } = useLyricSync(lyrics)
  const interludeActive = interludeProgress !== null && interludeAfterIndex !== null
  const preludeInterlude = interludeActive && interludeAfterIndex === -1
  const activeFillRef = useRef<HTMLSpanElement | null>(null)
  const targetProgressRef = useRef(0)
  const displayedProgressRef = useRef(0)
  const velocityRef = useRef(0)
  const lastTsRef = useRef<number | null>(null)
  const lastLineIndexRef = useRef(-1)
  const lastLyricsIdRef = useRef<number | null>(null)
  const wordLiftRefs = useRef<HTMLSpanElement[]>([])
  const wordBaseLiftRefs = useRef<HTMLSpanElement[]>([])
  const timingRef = useRef<{
    starts: number[]
    ends: number[]
    weights: number[]
    revealStarts: number[]
    total: number
  } | null>(null)

  useEffect(() => {
    if (lastLineIndexRef.current !== currentIndex) {
      lastLineIndexRef.current = currentIndex
      targetProgressRef.current = 0
      displayedProgressRef.current = 0
      velocityRef.current = 0
      lastTsRef.current = null
      timingRef.current = null
      wordLiftRefs.current = []
      wordBaseLiftRefs.current = []
      const el = activeFillRef.current
      if (el) {
        el.style.clipPath = "inset(0 100% 0 0)"
        el.style.setProperty("-webkit-clip-path", "inset(0 100% 0 0)")
      }

      const line = lines[currentIndex]
      if (!line || !line.words || line.words.length === 0) {
        return
      }
      const words = line.words
      const nextLineTime = lines[currentIndex + 1]?.time
      const starts = words.map((w) => w.start)
      const weights = words.map((w) => Math.max(1, Array.from(w.text).length))
      const total = Math.max(1, weights.reduce((acc, n) => acc + n, 0))
      const revealStarts: number[] = []
      let prefix = 0
      for (const w of weights) {
        revealStarts.push(prefix / total)
        prefix += w
      }

      const gaps: number[] = []
      for (let i = 0; i < starts.length - 1; i += 1) {
        const g = starts[i + 1] - starts[i]
        if (g > 0) gaps.push(g)
      }
      const avgGap = gaps.length > 0
        ? gaps.reduce((acc, g) => acc + g, 0) / gaps.length
        : 0.22
      const ends = starts.map((s, i) => {
        if (i < starts.length - 1) return starts[i + 1]
        const tail = Math.max(0.14, Math.min(0.5, avgGap))
        const fallback = s + tail
        if (nextLineTime !== undefined) {
          return Math.max(s + 0.08, Math.min(nextLineTime - 0.02, fallback))
        }
        return fallback
      })
      timingRef.current = { starts, ends, weights, revealStarts, total }
    }
  }, [currentIndex, lines])

  useEffect(() => {
    let raf: number | null = null
    const tick = (ts: number) => {
      // 切歌时重置动画状态，避免累积延迟
      const currentLyricsId = lyrics?.id ?? null
      if (currentLyricsId !== lastLyricsIdRef.current) {
        lastLyricsIdRef.current = currentLyricsId
        displayedProgressRef.current = 0
        velocityRef.current = 0
        lastTsRef.current = null
      }

      const el = activeFillRef.current
      const timing = timingRef.current
      if (timing) {
        const now = getAudioCurrentTime()
        const { starts, ends, weights, total } = timing
        let target = 0
        if (now <= starts[0]) {
          target = 0
        } else if (now >= ends[ends.length - 1]) {
          target = 1
        } else {
          let progressed = 0
          for (let i = 0; i < starts.length; i += 1) {
            const s = starts[i]
            const e = Math.max(s + 0.05, ends[i])
            const w = weights[i]
            if (now >= e) {
              progressed += w
              continue
            }
            if (now <= s) {
              break
            }
            const t = (now - s) / (e - s)
            const smooth = t * t * (3 - 2 * t)
            progressed += w * smooth
            break
          }
          target = Math.max(0, Math.min(1, progressed / total))
        }
        targetProgressRef.current = target
      }

      const target = targetProgressRef.current
      const current = displayedProgressRef.current
      // Critically damped-like spring with monotonic clamp: smooth but no overshoot/backward jump.
      const monotonicTarget = target >= current ? target : current
      const prevTs = lastTsRef.current ?? ts
      const dt = Math.max(1 / 240, Math.min(0.05, (ts - prevTs) / 1000))
      lastTsRef.current = ts
      const k = 220
      const c = 30
      const x = monotonicTarget - current
      const a = k * x - c * velocityRef.current
      velocityRef.current += a * dt
      let next = current + velocityRef.current * dt
      if (next < current) {
        next = current
        velocityRef.current = 0
      }
      if (next > monotonicTarget) {
        next = monotonicTarget
        velocityRef.current = 0
      }
      displayedProgressRef.current = next
      if (el) {
        const right = Math.max(0, (1 - next) * 100)
        const clip = `inset(0 ${right}% 0 0)`
        el.style.clipPath = clip
        el.style.setProperty("-webkit-clip-path", clip)
      }

      if (timing) {
        const now = getAudioCurrentTime()
        const { starts, ends, revealStarts } = timing
        const liftMax = 1.2
        for (let i = 0; i < starts.length; i += 1) {
          const wEl = wordLiftRefs.current[i]
          const bEl = wordBaseLiftRefs.current[i]
          if (!wEl) continue
          const s = starts[i]
          const e = Math.max(s + 0.05, ends[i])
          let p = 0
          if (now >= e) {
            p = 1
          } else if (now > s) {
            p = (now - s) / (e - s)
            p = p * p * (3 - 2 * p)
          }
          const transform = `translateY(${(-liftMax * p).toFixed(3)}px)`
          wEl.style.transform = transform
          if (bEl) {
            const baseP = next > revealStarts[i] ? p : 0
            bEl.style.transform = `translateY(${(-liftMax * baseP).toFixed(3)}px)`
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])
  const windowStart = Math.max(0, currentIndex >= 0 ? currentIndex - 8 : 0)
  const windowEnd = Math.min(lines.length, currentIndex >= 0 ? currentIndex + 9 : 16)
  const visibleLines = lines.slice(windowStart, windowEnd)
  const topSpacer = windowStart * LYRIC_ROW_HEIGHT
  const bottomSpacer = Math.max(0, (lines.length - windowEnd) * LYRIC_ROW_HEIGHT)

  // 无歌词
  if (!lyrics) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-white/40">暂无歌词</p>
      </div>
    )
  }

  // 非同步歌词：纯文本显示
  if (!lyrics.synced || lines.length === 0) {
    return (
      <div className="h-full overflow-y-auto px-6 py-8 scrollbar-hide">
        <p className="whitespace-pre-line text-base leading-7 text-white/70">
          {lyrics.content || "暂无歌词"}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full items-start overflow-hidden">
      <div
        className="w-full"
        style={{
          maskImage: "linear-gradient(to bottom, black 0%, black 68%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 68%, transparent 100%)",
        }}
      >
        <div className="relative overflow-hidden px-8 pt-[14vh] pb-[10vh]">
          <AnimatePresence initial={false}>
            {preludeInterlude && (
              <motion.div
                key={`prelude-${lyrics?.id ?? "none"}`}
                className="pointer-events-none absolute left-8 top-[calc(14vh+4px)] z-10 flex h-[92px] w-[calc(100%-4rem)] items-center justify-start"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
              >
                <div className="nowplaying-interlude-breathe relative inline-block whitespace-nowrap text-[2.3rem] font-extrabold leading-none tracking-[0.18em]">
                  {[0, 1, 2].map((dotIndex) => {
                    const filled = (interludeProgress ?? 0) >= (dotIndex + 1) / 3
                    return (
                      <span
                        key={dotIndex}
                        className={`mx-[0.138em] inline-block h-[0.34em] w-[0.34em] rounded-full align-middle transition-colors duration-150 ${
                          filled
                            ? "bg-white"
                            : "bg-white/50"
                        }`}
                      />
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div
            animate={{
              y: currentIndex >= 0 ? -(currentIndex * LYRIC_ROW_HEIGHT) : 0,
            }}
            transition={{
              type: "spring",
              stiffness: 155,
              damping: 24,
              mass: 0.82,
            }}
          >
            {topSpacer > 0 ? <div style={{ height: topSpacer }} /> : null}
            {visibleLines.map((line, offset) => {
              const index = windowStart + offset
              let distance = index - currentIndex
              if (
                interludeActive &&
                interludeAfterIndex === index &&
                currentLineProgress >= 0.995
              ) {
                // 逐字接近完成后再降级当前句，避免“还没走完就消失”
                distance = 1
              }
              const absDistance = Math.abs(distance)

              return (
                <div key={`${line.time}-${index}`}>
                  <motion.button
                    className="flex h-[92px] w-full items-center border-none bg-transparent text-left whitespace-nowrap"
                    animate={{
                      opacity:
                        distance === 0
                          ? 1
                          : absDistance === 1
                            ? 0.52
                            : absDistance === 2
                              ? 0.28
                              : absDistance === 3
                                ? 0.16
                                : 0.08,
                    }}
                    transition={{
                      duration: 0.18,
                      ease: "easeOut",
                    }}
                    onClick={() => onSeek?.(line.time)}
                  >
                    <span
                      className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap pb-1"
                      style={{
                        fontWeight: distance === 0 ? 700 : 600,
                        color: "white",
                        fontSize: "2.6rem",
                        lineHeight: 1.08,
                      }}
                    >
                      {distance === 0 && line.words && line.words.length > 0 ? (
                        <span className="relative inline-block whitespace-pre text-white/55">
                          {line.words.map((word, wordIndex) => (
                            <span
                              key={`${index}-base-word-${wordIndex}`}
                              ref={(el) => {
                                if (el) {
                                  wordBaseLiftRefs.current[wordIndex] = el
                                }
                              }}
                              className="inline-block"
                              style={{ willChange: "transform" }}
                            >
                              {word.text}
                            </span>
                          ))}
                          <span
                            ref={activeFillRef}
                            className="absolute left-0 top-0 overflow-hidden whitespace-pre text-white"
                            style={{
                              clipPath: "inset(0 100% 0 0)",
                              WebkitClipPath: "inset(0 100% 0 0)",
                              willChange: "clip-path",
                            }}
                          >
                            {line.words.map((word, wordIndex) => (
                              <span
                                key={`${index}-word-${wordIndex}`}
                                ref={(el) => {
                                  if (el) {
                                    wordLiftRefs.current[wordIndex] = el
                                  }
                                }}
                                className="inline-block"
                                style={{ willChange: "transform" }}
                              >
                                {word.text}
                              </span>
                            ))}
                          </span>
                        </span>
                      ) : (
                        line.text
                      )}
                    </span>
                  </motion.button>

                  <AnimatePresence initial={false}>
                    {interludeProgress !== null &&
                      interludeAfterIndex === index &&
                      currentLineProgress >= 0.9995 && (
                      <motion.div
                        key={`interlude-${lyrics?.id ?? "x"}-${index}`}
                        className="pointer-events-none flex h-[92px] w-full items-center justify-start"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0 } }}
                      >
                        <div className="nowplaying-interlude-breathe relative inline-block whitespace-nowrap text-[2.3rem] font-extrabold leading-none tracking-[0.18em]">
                          {[0, 1, 2].map((dotIndex) => {
                            const filled = interludeProgress >= (dotIndex + 1) / 3
                            return (
                              <span
                                key={dotIndex}
                                className={`mx-[0.138em] inline-block h-[0.34em] w-[0.34em] rounded-full align-middle transition-colors duration-150 ${
                                  filled
                                    ? "bg-white"
                                    : "bg-white/50"
                                }`}
                              />
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              )
            })}
            {bottomSpacer > 0 ? <div style={{ height: bottomSpacer }} /> : null}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default LyricsView
