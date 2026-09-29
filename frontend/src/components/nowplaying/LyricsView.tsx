import { motion } from "framer-motion"
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import useLyricSync from "@/hooks/useLyricSync"
import { getAudioCurrentTime } from "@/hooks/useAudio"
import type { LyricsOut } from "@/types/api"
import { useUIStore } from "@/store/uiStore"
import { isMostlyCjkLyrics } from "@/lib/lrcParser"
import { wordFillProgress } from "@/lib/lyricAnimation"
import { interludeDotVisual } from "@/lib/interludeAnimation"
import TranslationToggle from "./TranslationToggle"
import {
  LYRIC_ROW_HEIGHT,
  CURRENT_LINE_WEIGHT,
  OTHER_LINE_WEIGHT,
  WORD_LIFT_MAX,
  SEGMENT_TAIL_MIN,
  SEGMENT_TAIL_MAX,
  SEGMENT_END_MIN_PAD,
  SEGMENT_END_NEXT_PAD,
  DEFAULT_WORD_GAP,
  SEGMENT_SMOOTH_EPSILON,
  SCROLL_SPRING_STIFFNESS,
  SCROLL_SPRING_DAMPING,
  SCROLL_SPRING_MASS,
  LINE_OPACITY_D1,
  LINE_OPACITY_D2,
  LINE_OPACITY_D3,
  LINE_OPACITY_D_FAR,
  OPACITY_TRANSITION_DURATION,
  INTERLUDE_DOT_SCALE_MAX,
  INTERLUDE_DOT_SCALE_MIN,
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
    interludePhase,
    interludeBreathPhase,
    interludeExitProgress,
    interludeCollapseProgress,
  } = useLyricSync(lyrics, showTranslation)

  // 翻译切换动画状态
  // translationPhase: "idle" | "fading-out" | "height-changing" | "fading-in"
  const [translationPhase, setTranslationPhase] = useState<"idle" | "fading-out" | "height-changing" | "fading-in">("idle")
  const [displayedTranslation, setDisplayedTranslation] = useState(showTranslation)
  const translationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wordLiftRefs = useRef<HTMLSpanElement[]>([])
  const wordFillRefs = useRef<HTMLSpanElement[]>([])
  const lineRefs = useRef(new Map<number, HTMLDivElement>())
  const lyricsListRef = useRef<HTMLDivElement | null>(null)
  const [scrollTargetY, setScrollTargetY] = useState(LYRIC_ROW_HEIGHT)
  const timingRef = useRef<{
    starts: number[]
    ends: number[]
  } | null>(null)
  const hasDots = interludePhase !== "hidden" && interludeAfterIndex !== null
  const dotsCollapsing = interludePhase === "collapsing"
  const dotsAfterIndex = hasDots ? interludeAfterIndex : null
  const dotVisual = useMemo(() => interludeDotVisual({
    phase: interludePhase,
    breathPhase: interludeBreathPhase,
    exitProgress: interludeExitProgress,
    scaleMin: INTERLUDE_DOT_SCALE_MIN,
    scaleMax: INTERLUDE_DOT_SCALE_MAX,
  }), [interludeBreathPhase, interludeExitProgress, interludePhase])
  const dotsHeight = dotsCollapsing
    ? LYRIC_ROW_HEIGHT * (1 - interludeCollapseProgress)
    : LYRIC_ROW_HEIGHT

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (translationTimerRef.current !== null) clearTimeout(translationTimerRef.current)
    }
  }, [])

  // 翻译切换动画
  useEffect(() => {
    if (showTranslation === displayedTranslation && translationPhase === "idle") return

    if (showTranslation && !displayedTranslation) {
      // 显示翻译：先更新高度，再淡入
      setTranslationPhase("height-changing")
      setDisplayedTranslation(true)
      if (translationTimerRef.current !== null) clearTimeout(translationTimerRef.current)
      translationTimerRef.current = setTimeout(() => {
        setTranslationPhase("fading-in")
        translationTimerRef.current = setTimeout(() => {
          setTranslationPhase("idle")
        }, 150)
      }, 300)
    } else if (!showTranslation && displayedTranslation) {
      // 隐藏翻译：先淡出，再更新高度
      setTranslationPhase("fading-out")
      if (translationTimerRef.current !== null) clearTimeout(translationTimerRef.current)
      translationTimerRef.current = setTimeout(() => {
        setTranslationPhase("height-changing")
        setDisplayedTranslation(false)
        translationTimerRef.current = setTimeout(() => {
          setTranslationPhase("idle")
        }, 300)
      }, 150)
    }

    return () => {
      if (translationTimerRef.current !== null) clearTimeout(translationTimerRef.current)
    }
  }, [showTranslation, displayedTranslation, translationPhase])

  // 使用真实 DOM 高度定位当前行，长歌词换行后仍能准确滚动。
  useLayoutEffect(() => {
    const measure = () => {
      if (currentIndex < 0) {
        setScrollTargetY(LYRIC_ROW_HEIGHT)
        return
      }
      const activeLine = lineRefs.current.get(currentIndex)
      if (activeLine) setScrollTargetY(-activeLine.offsetTop)
    }
    const frame = requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    if (lyricsListRef.current) observer.observe(lyricsListRef.current)
    window.addEventListener("resize", measure)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [currentIndex, displayedTranslation, hasDots, lines])

  const scrollAnimate = useMemo(() => ({ y: scrollTargetY }), [scrollTargetY])
  const scrollTransition = useMemo(() => ({
    type: "spring" as const,
    stiffness: SCROLL_SPRING_STIFFNESS,
    damping: SCROLL_SPRING_DAMPING,
    mass: SCROLL_SPRING_MASS,
  }), [])

  useLayoutEffect(() => {
    timingRef.current = null
    const line = lines[currentIndex]
    if (!line?.words?.length) return

    const words = line.words
    const starts = words.map((word) => word.start)
    const nextLineTime = lines[currentIndex + 1]?.time
    const gaps = starts.slice(1).map((start, index) => start - starts[index]).filter((gap) => gap > 0)
    const avgGap = gaps.length > 0
      ? gaps.reduce((total, gap) => total + gap, 0) / gaps.length
      : DEFAULT_WORD_GAP
    const ends = starts.map((start, index) => {
      const explicitEnd = words[index].end
      if (explicitEnd !== undefined && explicitEnd > start) return explicitEnd
      if (index < starts.length - 1) return starts[index + 1]
      const tail = Math.max(SEGMENT_TAIL_MIN, Math.min(SEGMENT_TAIL_MAX, avgGap))
      const fallback = start + tail
      if (nextLineTime !== undefined) {
        return Math.max(
          start + SEGMENT_END_MIN_PAD,
          Math.min(nextLineTime - SEGMENT_END_NEXT_PAD, fallback)
        )
      }
      return fallback
    })
    wordLiftRefs.current.length = starts.length
    wordFillRefs.current.length = starts.length
    timingRef.current = { starts, ends }
  }, [currentIndex, lines])


  useEffect(() => {
    let raf: number | null = null
    const tick = () => {
      const timing = timingRef.current
      if (timing) {
        const now = getAudioCurrentTime()
        const { starts, ends } = timing
        for (let i = 0; i < starts.length; i += 1) {
          const wEl = wordLiftRefs.current[i]
          const fillEl = wordFillRefs.current[i]
          if (!wEl && !fillEl) continue
          const s = starts[i]
          const e = Math.max(s + SEGMENT_SMOOTH_EPSILON, ends[i])
          const p = wordFillProgress(now, s, e)
          const transform = `translateY(${(-WORD_LIFT_MAX * p).toFixed(3)}px)`
          if (wEl) wEl.style.transform = transform
          if (fillEl) {
            const right = Math.max(0, (1 - p) * 100)
            const clip = `inset(0 ${right}% 0 0)`
            fillEl.style.clipPath = clip
            fillEl.style.setProperty("-webkit-clip-path", clip)
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [lyrics?.id])

  // 间奏刚结束时标记，在 currentIndex 变化时触发补位动画

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

  const content = lyrics?.content ?? ''
  const isChinese = isMostlyCjkLyrics(content)
  const hasTranslation = !!lyrics?.translated_content && !isChinese
  const isEnglish = isEnglishLyrics(content) && !isChinese

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
          <motion.div ref={lyricsListRef} animate={scrollAnimate} transition={scrollTransition}>
            {/* 前奏点阵：作为首行前的一个额外行 */}
            {hasDots && dotsAfterIndex === -1 && (
              <motion.div
                key={`prelude-dots-${lyrics?.id ?? "none"}`}
                className="flex items-center"
                data-interlude-dots="prelude"
                data-interlude-phase={interludePhase}
                style={{
                  transformOrigin: "center center",
                  overflow: dotsCollapsing ? "hidden" : "visible",
                }}
                initial={{ opacity: 0, height: 0 }}
                animate={{
                  opacity: 1,
                  height: dotsHeight,
                }}
                transition={{
                  duration: dotsCollapsing ? 0.11 : 0.24,
                  ease: dotsCollapsing ? "linear" : "easeOut",
                }}
              >
                <motion.div
                  className="relative inline-block whitespace-nowrap text-[2.3rem] font-extrabold leading-none tracking-[0.18em]"
                  style={{ transformOrigin: "center center" }}
                  animate={{ opacity: dotVisual.opacity, scale: dotVisual.scale }}
                  transition={{ duration: dotsCollapsing ? 0 : 0.11, ease: "linear" }}
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
            {lines.map((line, index) => {
              const distance = index - currentIndex
              const absDistance = Math.abs(distance)

              // 句间点阵：在 interludeAfterIndex 和 interludeAfterIndex+1 之间插入额外行
              const insertDotsBefore = hasDots && dotsAfterIndex !== null && dotsAfterIndex >= 0 && index === dotsAfterIndex + 1

              const elements: React.ReactNode[] = []

              if (insertDotsBefore) {
                elements.push(
                  <motion.div
                    key={`interlude-dots-${lyrics?.id ?? "x"}-${index}`}
                    className="flex items-center"
                    data-interlude-dots="in-song"
                    data-interlude-phase={interludePhase}
                    style={{
                      transformOrigin: "center center",
                      overflow: dotsCollapsing ? "hidden" : "visible",
                    }}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{
                      opacity: 1,
                      height: dotsHeight,
                    }}
                    transition={{
                      duration: dotsCollapsing ? 0.11 : 0.24,
                      ease: dotsCollapsing ? "linear" : "easeOut",
                    }}
                  >
                    <motion.div
                      className="relative inline-block whitespace-nowrap text-[2.3rem] font-extrabold leading-none tracking-[0.18em]"
                      style={{ transformOrigin: "center center" }}
                      animate={{ opacity: dotVisual.opacity, scale: dotVisual.scale }}
                      transition={{ duration: dotsCollapsing ? 0 : 0.11, ease: "linear" }}
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
              const translationOpacity = translationPhase === "fading-out" ? 0 : translationPhase === "fading-in" ? 1 : (hasTranslation ? 1 : 0)
              const wordFillClip = distance < 0
                ? "inset(0 0% 0 0)"
                : "inset(0 100% 0 0)"

              elements.push(
                <div
                  key={`line-${index}`}
                  data-line-index={index}
                  ref={(element) => {
                    if (element) lineRefs.current.set(index, element)
                    else lineRefs.current.delete(index)
                  }}
                >
                  <motion.button
                    layout
                    className="flex min-h-[5.5rem] w-full items-center border-none bg-transparent py-3 text-left"
                    animate={{
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
                      layout: {
                        type: "spring",
                        stiffness: SCROLL_SPRING_STIFFNESS,
                        damping: SCROLL_SPRING_DAMPING,
                        mass: SCROLL_SPRING_MASS,
                      },
                      opacity: {
                        duration: OPACITY_TRANSITION_DURATION,
                        ease: "easeOut",
                      },
                    }}
                    onClick={() => onSeek?.(Math.max(0, line.time))}
                  >
                    <div className="flex min-w-0 w-full flex-col">
                      <span
                        className="block max-w-full whitespace-pre-wrap break-words pb-1 [overflow-wrap:anywhere]"
                        style={{
                          fontWeight: distance === 0 ? CURRENT_LINE_WEIGHT : OTHER_LINE_WEIGHT,
                          color: "white",
                          fontFamily: LYRIC_FONT_FAMILY,
                          fontSize: LYRIC_FONT_SIZE,
                          lineHeight: LYRIC_LINE_HEIGHT,
                        }}
                      >
                        {line.words && line.words.length > 0 ? (
                          <span className="relative block max-w-full whitespace-pre-wrap break-words text-white/55 [overflow-wrap:anywhere]">
                            {line.words.map((word, wordIndex) => (
                              <span
                                key={`${index}-base-word-${wordIndex}`}
                                ref={(el) => {
                                  if (distance === 0 && el) {
                                    wordLiftRefs.current[wordIndex] = el
                                  }
                                }}
                                className="relative inline-block"
                                style={{ willChange: "transform" }}
                              >
                                <span
                                  aria-hidden="true"
                                  ref={(el) => {
                                    if (distance === 0 && el) {
                                      wordFillRefs.current[wordIndex] = el
                                    }
                                  }}
                                  className="absolute inset-0 text-white"
                                  style={{
                                    clipPath: wordFillClip,
                                    WebkitClipPath: wordFillClip,
                                    willChange: "clip-path",
                                  }}
                                >
                                  {word.text}
                                </span>
                                {word.text}
                              </span>
                              ))}
                          </span>
                        ) : (
                          line.text
                        )}
                      </span>
                      {hasTranslation && (
                        <span
                          className="block max-w-full whitespace-pre-wrap break-words text-white/40 [overflow-wrap:anywhere]"
                          style={{
                            fontFamily: LYRIC_FONT_FAMILY,
                            fontSize: '1.3rem',
                            lineHeight: '1.4',
                            opacity: translationOpacity,
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
