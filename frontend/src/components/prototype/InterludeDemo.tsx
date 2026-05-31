import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import {
  LYRIC_ROW_HEIGHT,
  INTERLUDE_DOT_SCALE_MAX,
  INTERLUDE_DOT_SCALE_MIN,
  INTERLUDE_DOT_BREATHE_DURATION,
  SCROLL_SPRING_STIFFNESS,
  SCROLL_SPRING_DAMPING,
  SCROLL_SPRING_MASS,
  INTERLUDE_EXIT_DURATION_MIN,
} from "@/config/lyrics"

const MOCK_LINES = [
  { time: 10, text: "夜空下的街灯一盏盏亮起" },
  { time: 15, text: "你站在转角处等待谁的回应" },
  { time: 22, text: "风吹过耳畔像在轻轻诉说" },
  { time: 29, text: "那些未曾说出口的秘密" },
  { time: 38, text: "时光匆匆流逝不留痕迹" },
  { time: 45, text: "我只想记住这一刻的你" },
  { time: 50, text: "让回忆定格在画面里" },
]

type Phase = "idle" | "interlude" | "dots-exiting" | "scrolling"

type DisplayItem =
  | { type: "line"; index: number }
  | { type: "dots" }

export default function InterludeDemo() {
  const [currentIndex, setCurrentIndex] = useState(1)
  const [phase, setPhase] = useState<Phase>("idle")
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current)
      if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current)
    }
  }, [])

  const startInterlude = useCallback(() => {
    setPhase("interlude")
  }, [])

  const completeTransition = useCallback(() => {
    setPhase("dots-exiting")
    exitTimerRef.current = setTimeout(() => {
      setCurrentIndex((prev) => prev + 1)
      setPhase("scrolling")
      scrollTimerRef.current = setTimeout(() => {
        setPhase("idle")
      }, 800)
    }, INTERLUDE_EXIT_DURATION_MIN * 1000 + 50)
  }, [])

  const reset = useCallback(() => {
    if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current)
    if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current)
    setPhase("idle")
    setCurrentIndex(1)
  }, [])

  // 点阵在 interlude 和 dots-exiting 阶段都保持在 DOM 中（避免布局瞬移）
  // dots-exiting 阶段通过 animate 目标值变化来触发收缩动画
  const dotsInLayout = phase === "interlude" || phase === "dots-exiting"
  const dotsExiting = phase === "dots-exiting"

  // 构建显示列表：在 currentIndex 和 currentIndex+1 之间插入点阵行
  const displayItems = useMemo<DisplayItem[]>(() => {
    const items: DisplayItem[] = []
    for (let i = 0; i < MOCK_LINES.length; i++) {
      if (dotsInLayout && i === currentIndex + 1) {
        items.push({ type: "dots" })
      }
      items.push({ type: "line", index: i })
    }
    return items
  }, [dotsInLayout, currentIndex])

  // 计算目标行在显示列表中的位置
  const targetDisplayPos = useMemo(() => {
    let pos = 0
    for (const item of displayItems) {
      if (item.type === "line" && item.index === currentIndex) {
        return pos
      }
      pos++
    }
    return 0
  }, [displayItems, currentIndex])

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-3 px-4 shrink-0">
        <button
          onClick={startInterlude}
          disabled={phase !== "idle" || currentIndex >= MOCK_LINES.length - 1}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm disabled:opacity-30 transition"
        >
          触发间奏 (当前第 {currentIndex + 1} 行)
        </button>
        <button
          onClick={completeTransition}
          disabled={phase !== "interlude"}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm disabled:opacity-30 transition"
        >
          完成过渡 → 下一行
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-sm transition"
        >
          重置
        </button>
      </div>

      <div className="px-4 flex gap-4 text-xs font-mono">
        <span className={`${phase === "idle" ? "text-green-400" : "text-white/30"}`}>● idle</span>
        <span className={`${phase === "interlude" ? "text-yellow-400" : "text-white/30"}`}>● interlude</span>
        <span className={`${phase === "dots-exiting" ? "text-orange-400" : "text-white/30"}`}>● exiting</span>
        <span className={`${phase === "scrolling" ? "text-blue-400" : "text-white/30"}`}>● scrolling</span>
        <span className="text-white/20 ml-2">currentIndex={currentIndex}</span>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden rounded-lg border border-white/10 bg-black/20 mx-4">
        <div
          className="pointer-events-none absolute top-0 left-0 right-0 z-10 h-[60px]"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)" }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-[60px]"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)" }}
        />

        <div className="px-8 pt-[80px] pb-[80px] overflow-hidden">
          <motion.div
            animate={{
              y: -(targetDisplayPos * LYRIC_ROW_HEIGHT),
            }}
            transition={{
              type: "spring",
              stiffness: SCROLL_SPRING_STIFFNESS,
              damping: SCROLL_SPRING_DAMPING,
              mass: SCROLL_SPRING_MASS,
            }}
          >
            {displayItems.map((item, displayIdx) => {
              if (item.type === "dots") {
                return (
                  <motion.div
                    key="dots"
                    className="flex items-center overflow-hidden"
                    style={{ transformOrigin: "left center" }}
                    initial={{ opacity: 0, scale: 1, height: 0 }}
                    animate={{
                      opacity: dotsExiting ? 0 : 1,
                      scale: dotsExiting ? 0.1 : 1,
                      height: dotsExiting ? 0 : LYRIC_ROW_HEIGHT,
                    }}
                    transition={{
                      duration: dotsExiting ? INTERLUDE_EXIT_DURATION_MIN : 0.3,
                      ease: "easeIn",
                    }}
                  >
                    <motion.div
                      className="inline-block whitespace-nowrap text-[2.3rem] font-extrabold leading-none tracking-[0.18em]"
                      animate={
                        dotsExiting
                          ? undefined
                          : {
                              opacity: [0.35, 0.9, 0.35],
                              scale: [INTERLUDE_DOT_SCALE_MIN, INTERLUDE_DOT_SCALE_MAX, INTERLUDE_DOT_SCALE_MIN],
                              transition: {
                                duration: INTERLUDE_DOT_BREATHE_DURATION,
                                repeat: Infinity,
                                ease: "easeInOut",
                              },
                            }
                      }
                    >
                      {[0, 1, 2].map((dotIndex) => (
                        <span
                          key={dotIndex}
                          className="mx-[0.138em] inline-block h-[0.34em] w-[0.34em] rounded-full align-middle bg-white/70"
                        />
                      ))}
                    </motion.div>
                  </motion.div>
                )
              }

              // 歌词行
              const line = MOCK_LINES[item.index]
              const distance = item.index - currentIndex
              const absDistance = Math.abs(distance)

              return (
                <div
                  key={item.index}
                  className="flex items-center"
                  style={{ height: LYRIC_ROW_HEIGHT }}
                >
                  <span
                    className="block max-w-full whitespace-nowrap text-[2.6rem]"
                    style={{
                      fontWeight: 500,
                      color: "white",
                      lineHeight: 1.08,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                      opacity: distance === 0 ? 1 : absDistance === 1 ? 0.52 : absDistance === 2 ? 0.28 : 0.08,
                      transition: "opacity 0.35s ease-out",
                    }}
                  >
                    {line.text}
                  </span>
                </div>
              )
            })}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
