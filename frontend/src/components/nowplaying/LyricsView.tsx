import { motion } from "framer-motion"
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import useLyricSync from "@/hooks/useLyricSync"
import { getAudioCurrentTime } from "@/hooks/useAudio"
import type { LyricsOut } from "@/types/api"
import { useUIStore } from "@/store/uiStore"
import TranslationToggle from "./TranslationToggle"
import {
  LYRIC_ROW_HEIGHT,
  CURRENT_LINE_WEIGHT,
  OTHER_LINE_WEIGHT,
  WORD_LIFT_MAX,
  FILL_SPRING_K,
  FILL_SPRING_C,
  SEGMENT_TAIL_MIN,
  SEGMENT_TAIL_MAX,
  SEGMENT_END_MIN_PAD,
  SEGMENT_END_NEXT_PAD,
  DEFAULT_WORD_GAP,
  SEGMENT_SMOOTH_EPSILON,
  DT_CLAMP_MIN,
  DT_CLAMP_MAX,
  SCROLL_SPRING_STIFFNESS,
  SCROLL_SPRING_DAMPING,
  SCROLL_SPRING_MASS,
  LINE_OPACITY_D1,
  LINE_OPACITY_D2,
  LINE_OPACITY_D3,
  LINE_OPACITY_D_FAR,
  OPACITY_TRANSITION_DURATION,
  INTERLUDE_DOT_BREATHE_DURATION,
  INTERLUDE_DOT_SCALE_MAX,
  INTERLUDE_DOT_SCALE_MIN,
  INTERLUDE_DOT_EXIT_PEAK,
  INTERLUDE_EXIT_RATIO,
  INTERLUDE_EXIT_DURATION_MIN,
  INTERLUDE_EXIT_DURATION_MAX,
  INTERLUDE_HIDE_BEFORE_MIN,
  LYRIC_FONT_FAMILY,
  LYRIC_FONT_SIZE,
  LYRIC_LINE_HEIGHT,
} from "@/config/lyrics"

interface LyricsViewProps {
  lyrics: LyricsOut | null | undefined
  onSeek?: (time: number) => void
  trackId?: number
  onFeedback?: (message: string, timeoutMs?: number) => void
}

/** 粗略判断歌词是否为英文（英文字符占比 > 30%） */
function isEnglishLyrics(content: string): boolean {
  if (!content) return false
  const sample = content.slice(0, 500)
  const enMatches = sample.match(/[a-zA-Z]+/g) || []
  const enChars = enMatches.join('').length
  const clean = sample.replace(/\[[\d:.]+\]/g, '')
  return enChars / Math.max(1, clean.trim().length) > 0.3
}

function LyricsView({ lyrics, onSeek, trackId, onFeedback }: LyricsViewProps) {
  const showTranslation = useUIStore((s) => s.showTranslation)
  const {
    lines,
    currentIndex,
    interludeProgress,
    interludeAfterIndex,
    interludeHideBefore,
  } = useLyricSync(lyrics, showTranslation)

  // 翻译切换动画状态
  const [translationFading, setTranslationFading] = useState(false)
  const [displayedTranslation, setDisplayedTranslation] = useState(showTranslation)
  const translationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interludeActive = interludeProgress !== null && interludeAfterIndex !== null
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
  // ── 间奏 phase 状态机 ──
  // idle → interlude(点阵出现) → exiting(点阵收缩消失) → scrolling(下一句上浮) → idle
  type Phase = "idle" | "interlude" | "exiting" | "scrolling"
  const [phase, setPhase] = useState<Phase>("idle")
  const lastInterludeAfterIndexRef = useRef<number | null>(null)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 间奏激活时记录 afterIndex，退出后继续保留以便定位点阵位置
  useLayoutEffect(() => {
    if (interludeActive && interludeAfterIndex !== null) {
      lastInterludeAfterIndexRef.current = interludeAfterIndex
    }
  }, [interludeActive, interludeAfterIndex])

  const hasDots = phase === "interlude" || phase === "exiting"
  const dotsExiting = phase === "exiting"
  const dotsAfterIndex = hasDots ? (interludeAfterIndex ?? lastInterludeAfterIndexRef.current) : null

  // 动态计算退出动画时长
  const exitDuration = useMemo(() => {
    const hideBefore = interludeHideBefore ?? INTERLUDE_HIDE_BEFORE_MIN
    return Math.max(
      INTERLUDE_EXIT_DURATION_MIN,
      Math.min(INTERLUDE_EXIT_DURATION_MAX, hideBefore * INTERLUDE_EXIT_RATIO),
    )
  }, [interludeHideBefore])

  // 根据 phase / 间奏状态驱动状态机变迁
  useLayoutEffect(() => {
    if (interludeActive && phase === "idle") {
      setPhase("interlude")
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current)
      if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current)
    }
    if (!interludeActive && phase === "interlude") {
      setPhase("exiting")
      timingRef.current = null
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current)
      exitTimerRef.current = setTimeout(() => {
        setPhase("scrolling")
        if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current)
        scrollTimerRef.current = setTimeout(() => {
          setPhase("idle")
        }, 600)
      }, exitDuration * 1000)
    }
  }, [interludeActive, phase, exitDuration])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current)
      if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current)
      if (translationTimerRef.current !== null) clearTimeout(translationTimerRef.current)
    }
  }, [])

  // 翻译切换动画
  useEffect(() => {
    if (showTranslation === displayedTranslation) return

    if (showTranslation) {
      // 显示翻译：先更新状态，再淡入
      setDisplayedTranslation(true)
      setTranslationFading(true)
      // 下一帧开始淡入
      requestAnimationFrame(() => {
        setTranslationFading(false)
      })
    } else {
      // 隐藏翻译：先淡出，再更新状态
      setTranslationFading(true)
      if (translationTimerRef.current !== null) clearTimeout(translationTimerRef.current)
      translationTimerRef.current = setTimeout(() => {
        setDisplayedTranslation(false)
        setTranslationFading(false)
      }, 150)
    }

    return () => {
      if (translationTimerRef.current !== null) clearTimeout(translationTimerRef.current)
    }
  }, [showTranslation, displayedTranslation])

  // ── 滚动目标 ──
  const targetDisplayPos = currentIndex + (hasDots && dotsAfterIndex !== null && currentIndex > dotsAfterIndex ? 1 : 0)
  const scrollTargetY = targetDisplayPos >= 0 ? -(targetDisplayPos * LYRIC_ROW_HEIGHT) : LYRIC_ROW_HEIGHT

  const scrollAnimate = useMemo(() => ({ y: scrollTargetY }), [scrollTargetY])
  const scrollTransition = useMemo(() => ({
    type: "spring" as const,
    stiffness: SCROLL_SPRING_STIFFNESS,
    damping: SCROLL_SPRING_DAMPING,
    mass: SCROLL_SPRING_MASS,
  }), [])

  useLayoutEffect(() => {
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
        : DEFAULT_WORD_GAP
      const ends = starts.map((s, i) => {
        if (i < starts.length - 1) return starts[i + 1]
        const tail = Math.max(SEGMENT_TAIL_MIN, Math.min(SEGMENT_TAIL_MAX, avgGap))
        const fallback = s + tail
        if (nextLineTime !== undefined) {
          return Math.max(s + SEGMENT_END_MIN_PAD, Math.min(nextLineTime - SEGMENT_END_NEXT_PAD, fallback))
        }
        return fallback
      })
      timingRef.current = { starts, ends, weights, revealStarts, total }

      // 根据当前音频时间初始化进度，避免切换行时出现填充动画
      const now = getAudioCurrentTime()
      let initTarget = 0
      if (now <= starts[0]) {
        initTarget = 0
      } else if (now >= ends[ends.length - 1]) {
        initTarget = 1
      } else {
        let progressed = 0
        for (let i = 0; i < starts.length; i += 1) {
          const s = starts[i]
          const e = Math.max(s + SEGMENT_SMOOTH_EPSILON, ends[i])
          const w = weights[i]
          if (now >= e) {
            progressed += w
            continue
          }
          if (now <= s) break
          const t = (now - s) / (e - s)
          const smooth = t * t * (3 - 2 * t)
          progressed += w * smooth
          break
        }
        initTarget = Math.max(0, Math.min(1, progressed / total))
      }
      targetProgressRef.current = initTarget
      displayedProgressRef.current = initTarget
      velocityRef.current = 0
      const el2 = activeFillRef.current
      if (el2) {
        const right = Math.max(0, (1 - initTarget) * 100)
        const clip = `inset(0 ${right}% 0 0)`
        el2.style.clipPath = clip
        el2.style.setProperty("-webkit-clip-path", clip)
      }
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
            const e = Math.max(s + SEGMENT_SMOOTH_EPSILON, ends[i])
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
      const dt = Math.max(DT_CLAMP_MIN, Math.min(DT_CLAMP_MAX, (ts - prevTs) / 1000))
      lastTsRef.current = ts
      const x = monotonicTarget - current
      const a = FILL_SPRING_K * x - FILL_SPRING_C * velocityRef.current
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
        for (let i = 0; i < starts.length; i += 1) {
          const wEl = wordLiftRefs.current[i]
          const bEl = wordBaseLiftRefs.current[i]
          if (!wEl) continue
          const s = starts[i]
          const e = Math.max(s + SEGMENT_SMOOTH_EPSILON, ends[i])
          let p = 0
          if (now >= e) {
            p = 1
          } else if (now > s) {
            p = (now - s) / (e - s)
            // ease-out cubic: 非线性上浮
            p = 1 - Math.pow(1 - p, 3)
          }
          const transform = `translateY(${(-WORD_LIFT_MAX * p).toFixed(3)}px)`
          wEl.style.transform = transform
          if (bEl) {
            const baseP = next > revealStarts[i] ? p : 0
            bEl.style.transform = `translateY(${(-WORD_LIFT_MAX * baseP).toFixed(3)}px)`
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

  // 间奏刚结束时标记，在 currentIndex 变化时触发补位动画

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

  // 纯文本歌词（内容无有效时间戳）
  if (lines.length === 0) {
    return (
      <div className="h-full overflow-y-auto px-6 py-8 scrollbar-hide">
        <p
          className="whitespace-pre-line text-white/70"
          style={{ fontFamily: LYRIC_FONT_FAMILY }}
        >
          {lyrics.content || "暂无歌词"}
        </p>
      </div>
    )
  }

  const hasTranslation = !!lyrics?.translated_content
  const isEnglish = isEnglishLyrics(lyrics?.content ?? '')

  return (
    <div className="relative flex h-full items-start overflow-hidden">
      <div
        className="w-full"
        style={{
          maskImage: "linear-gradient(to bottom, black 0%, black 68%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 68%, transparent 100%)",
        }}
      >
        <div className="relative overflow-hidden px-8 pt-[14vh] pb-[10vh]">
          <motion.div animate={scrollAnimate} transition={scrollTransition}>
            {/* 前奏点阵：作为首行前的一个额外行 */}
            {hasDots && dotsAfterIndex === -1 && (
              <motion.div
                key={`prelude-dots-${lyrics?.id ?? "none"}`}
                className="flex items-center overflow-hidden"
                style={{ transformOrigin: "center center" }}
                initial={{ opacity: 0, height: 0 }}
                animate={{
                  opacity: 1,
                  height: dotsExiting ? 0 : LYRIC_ROW_HEIGHT,
                }}
                transition={{
                  duration: dotsExiting ? exitDuration : 0.3,
                  ease: "easeInOut",
                }}
              >
                <motion.div
                  className="relative inline-block whitespace-nowrap text-[2.3rem] font-extrabold leading-none tracking-[0.18em]"
                  style={{ transformOrigin: "center center" }}
                  animate={
                    dotsExiting
                      ? { scale: [1, INTERLUDE_DOT_EXIT_PEAK, 0] }
                      : {
                          opacity: [0.35, 0.9, 0.35],
                          scale: [INTERLUDE_DOT_SCALE_MIN, INTERLUDE_DOT_SCALE_MAX, INTERLUDE_DOT_SCALE_MIN],
                        }
                  }
                  transition={
                    dotsExiting
                      ? { duration: exitDuration, ease: "easeInOut" }
                      : { duration: INTERLUDE_DOT_BREATHE_DURATION, repeat: Infinity, ease: "easeInOut" }
                  }
                >
                  {[0, 1, 2].map((dotIndex) => {
                    const filled = (interludeProgress ?? 0) >= (dotIndex + 1) / 3
                    return (
                      <span
                        key={dotIndex}
                        className={`mx-[0.138em] inline-block h-[0.34em] w-[0.34em] rounded-full align-middle transition-colors duration-150 ${
                          filled ? "bg-white" : "bg-white/50"
                        }`}
                      />
                    )
                  })}
                </motion.div>
              </motion.div>
            )}
            {topSpacer > 0 ? <div style={{ height: topSpacer }} /> : null}
            {visibleLines.map((line, offset) => {
              const index = windowStart + offset
              const distance = index - currentIndex
              const absDistance = Math.abs(distance)

              // 句间点阵：在 interludeAfterIndex 和 interludeAfterIndex+1 之间插入额外行
              const insertDotsBefore = hasDots && dotsAfterIndex !== null && dotsAfterIndex >= 0 && index === dotsAfterIndex + 1

              const elements: React.ReactNode[] = []

              if (insertDotsBefore) {
                elements.push(
                  <motion.div
                    key={`interlude-dots-${lyrics?.id ?? "x"}-${index}`}
                    className="flex items-center overflow-hidden"
                    style={{ transformOrigin: "center center" }}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{
                      opacity: 1,
                      height: dotsExiting ? 0 : LYRIC_ROW_HEIGHT,
                    }}
                    transition={{
                      duration: dotsExiting ? exitDuration : 0.3,
                      ease: "easeInOut",
                    }}
                  >
                    <motion.div
                      className="relative inline-block whitespace-nowrap text-[2.3rem] font-extrabold leading-none tracking-[0.18em]"
                      style={{ transformOrigin: "center center" }}
                      animate={
                        dotsExiting
                          ? { scale: [1, INTERLUDE_DOT_EXIT_PEAK, 0] }
                          : {
                              opacity: [0.35, 0.9, 0.35],
                              scale: [INTERLUDE_DOT_SCALE_MIN, INTERLUDE_DOT_SCALE_MAX, INTERLUDE_DOT_SCALE_MIN],
                            }
                      }
                      transition={
                        dotsExiting
                          ? { duration: exitDuration, ease: "easeInOut" }
                          : { duration: INTERLUDE_DOT_BREATHE_DURATION, repeat: Infinity, ease: "easeInOut" }
                      }
                    >
                      {[0, 1, 2].map((dotIndex) => {
                        const filled = (interludeProgress ?? 0) >= (dotIndex + 1) / 3
                        return (
                          <span
                            key={dotIndex}
                            className={`mx-[0.138em] inline-block h-[0.34em] w-[0.34em] rounded-full align-middle transition-colors duration-150 ${
                              filled ? "bg-white" : "bg-white/50"
                            }`}
                          />
                        )
                      })}
                    </motion.div>
                  </motion.div>
                )
              }

              const hasTranslation = displayedTranslation && line.translation
              const lineHeight = hasTranslation ? LYRIC_ROW_HEIGHT + 28 : LYRIC_ROW_HEIGHT

              elements.push(
                <div
                  key={`line-${index}`}
                  data-line-index={index}
                >
                  <motion.button
                    className="flex w-full items-center border-none bg-transparent text-left whitespace-nowrap"
                    animate={{
                      height: lineHeight,
                      opacity:
                        distance === 0
                          ? 1
                          : absDistance === 1
                            ? LINE_OPACITY_D1
                            : absDistance === 2
                              ? LINE_OPACITY_D2
                              : absDistance === 3
                                ? LINE_OPACITY_D3
                                : LINE_OPACITY_D_FAR,
                    }}
                    transition={{
                      height: {
                        type: "spring",
                        stiffness: SCROLL_SPRING_STIFFNESS,
                        damping: SCROLL_SPRING_DAMPING,
                        mass: SCROLL_SPRING_MASS,
                        delay: translationFading ? 0.15 : 0,
                      },
                      opacity: {
                        duration: OPACITY_TRANSITION_DURATION,
                        ease: "easeOut",
                      },
                    }}
                    onClick={() => onSeek?.(line.time)}
                  >
                    <div className="flex flex-col">
                      <span
                        className="block max-w-full whitespace-nowrap pb-1"
                        style={{
                          fontWeight: distance === 0 ? CURRENT_LINE_WEIGHT : OTHER_LINE_WEIGHT,
                          color: "white",
                          fontFamily: LYRIC_FONT_FAMILY,
                          fontSize: LYRIC_FONT_SIZE,
                          lineHeight: LYRIC_LINE_HEIGHT,
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
                              className="absolute left-0 top-0 whitespace-pre text-white"
                              style={{
                                clipPath: "inset(0 100% 0 0)",
                                WebkitClipPath: "inset(0 100% 0 0)",
                                willChange: "clip-path",
                                paddingBottom: "0.3em",
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
                      {hasTranslation && (
                        <span
                          className="block max-w-full text-white/40"
                          style={{
                            fontFamily: LYRIC_FONT_FAMILY,
                            fontSize: '1.3rem',
                            lineHeight: '1.4',
                            opacity: translationFading ? 0 : 1,
                            transition: 'opacity 150ms ease-out',
                          }}
                        >
                          {line.translation}
                        </span>
                      )}
                    </div>
                  </motion.button>

                </div>
              )

              return <React.Fragment key={`${line.time}-${index}`}>{elements}</React.Fragment>
            })}
            {bottomSpacer > 0 ? <div style={{ height: bottomSpacer }} /> : null}
          </motion.div>
        </div>
      </div>
      {/* 翻译切换按钮 — 右下角 */}
      {trackId && (
        <div className="absolute bottom-4 right-4 z-10">
          <TranslationToggle isEnglish={isEnglish} hasTranslation={hasTranslation} trackId={trackId} onFeedback={onFeedback} />
        </div>
      )}
    </div>
  )
}

export default LyricsView
