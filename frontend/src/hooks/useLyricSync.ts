import { useMemo } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { parseLrc, getCurrentLineIndex } from "@/lib/lrcParser"
import type { LyricLine } from "@/lib/lrcParser"
import type { LyricsOut } from "@/types/api"
import {
  DEFAULT_WORD_GAP,
  SEGMENT_TAIL_MIN,
  SEGMENT_TAIL_MAX,
  SEGMENT_END_MIN_PAD,
  SEGMENT_END_NEXT_PAD,
  PRELUDE_MIN_DURATION,
  PRELUDE_HIDE_BEFORE,
  PRELUDE_FILL_WINDOW_MAX,
  PRELUDE_FILL_WINDOW_MIN,
  PRELUDE_FILL_WINDOW_RATIO,
  PRELUDE_FILL_END_PAD,
  INTERLUDE_GAP_MIN,
  INTERLUDE_LEAD_IN,
  INTERLUDE_FILL_BEFORE_NEXT,
  INTERLUDE_HIDE_BEFORE_MIN,
  INTERLUDE_HIDE_BEFORE_MAX,
  INTERLUDE_HIDE_BEFORE_RATIO,
  INTERLUDE_LAST_WORD_PAD,
  INTERLUDE_NO_WORDS_FALLBACK,
} from "@/config/lyrics"

export interface LyricSyncResult {
  lines: { time: number; text: string; words?: { start: number; text: string }[] }[]
  currentIndex: number
  interludeProgress: number | null
  interludeAfterIndex: number | null
  interludeHideBefore: number | null  // 动态计算的间奏提前结束时间，供组件同步退出动画
  currentLineProgress: number
}

export function useLyricSync(lyrics: LyricsOut | null | undefined): LyricSyncResult {
  const currentTime = usePlayerStore((s) => s.currentTime)

  const timingLines = useMemo(() => {
    if (!lyrics?.content) return []
    return parseLrc(lyrics.content)
  }, [lyrics?.content])

  const { lines, timingToVisible } = useMemo(() => {
    const visibleLines: LyricLine[] = []
    const map: number[] = new Array(timingLines.length).fill(-1)

    timingLines.forEach((line, index) => {
      if (line.text.trim().length > 0) {
        map[index] = visibleLines.length
        visibleLines.push(line)
      }
    })

    return { lines: visibleLines, timingToVisible: map }
  }, [timingLines])

  const currentIndex = useMemo(() => {
    const timingIndex = getCurrentLineIndex(timingLines, currentTime)
    if (timingIndex < 0) return -1

    for (let i = timingIndex; i >= 0; i -= 1) {
      const mapped = timingToVisible[i]
      if (mapped !== -1) return mapped
    }

    for (let i = timingIndex + 1; i < timingToVisible.length; i += 1) {
      const mapped = timingToVisible[i]
      if (mapped !== -1) return mapped
    }

    return -1
  }, [timingLines, timingToVisible, currentTime])

  const preludeInterludeState = useMemo(() => {
    // 首句前奏显示一次点阵。
    if (lines.length === 0) return null
    const firstLineTime = lines[0].time
    if (firstLineTime < PRELUDE_MIN_DURATION) return null

    if (currentTime >= firstLineTime - PRELUDE_HIDE_BEFORE) return null

    const fillWindow = Math.min(PRELUDE_FILL_WINDOW_MAX, Math.max(PRELUDE_FILL_WINDOW_MIN, firstLineTime * PRELUDE_FILL_WINDOW_RATIO))
    const fillStart = Math.max(0, firstLineTime - fillWindow)
    const fillEnd = firstLineTime - PRELUDE_FILL_END_PAD

    return {
      progress:
        fillEnd <= fillStart
          ? 1
          : Math.max(0, Math.min(1, (currentTime - fillStart) / (fillEnd - fillStart))),
      // -1 表示前奏点阵（首句之前），由视图层固定位置渲染。
      afterIndex: -1,
    }
  }, [lines, currentTime])

  const inSongInterludeState = useMemo(() => {
    // 句间长间奏仍显示点阵，但跳过首句前奏区间，避免"前奏每句都出现"。
    if (currentIndex < 1 || currentIndex >= lines.length - 1) return null

    const currentLine = lines[currentIndex]
    const nextLine = lines[currentIndex + 1]

    // 使用当前句最后一个字到下一句第一个字的间隔判断，避免长歌词行误判
    const lastWordEnd =
      currentLine.words && currentLine.words.length > 0
        ? currentLine.words[currentLine.words.length - 1].start + INTERLUDE_LAST_WORD_PAD
        : currentLine.time + INTERLUDE_NO_WORDS_FALLBACK
    const firstWordStart =
      nextLine.words && nextLine.words.length > 0
        ? nextLine.words[0].start
        : nextLine.time
    const gap = firstWordStart - lastWordEnd
    if (gap < INTERLUDE_GAP_MIN) return null

    // 根据间隔动态计算提前结束时间：间隔越长，退出动画越从容
    const hideBefore = Math.max(
      INTERLUDE_HIDE_BEFORE_MIN,
      Math.min(INTERLUDE_HIDE_BEFORE_MAX, gap * INTERLUDE_HIDE_BEFORE_RATIO),
    )

    const interludeStart = lastWordEnd + INTERLUDE_LEAD_IN

    if (currentTime < interludeStart || currentTime >= firstWordStart - hideBefore) return null

    const fillStart = interludeStart
    const fillEnd = firstWordStart - INTERLUDE_FILL_BEFORE_NEXT

    return {
      progress:
        fillEnd <= fillStart
          ? 1
          : Math.max(0, Math.min(1, (currentTime - fillStart) / (fillEnd - fillStart))),
      afterIndex: currentIndex,
      hideBefore,
    }
  }, [currentIndex, lines, currentTime])

  const interludeState = preludeInterludeState ?? inSongInterludeState

  const currentLineTiming = useMemo(() => {
    if (currentIndex < 0 || currentIndex >= lines.length) {
      return null
    }
    const line = lines[currentIndex]
    if (!line.words || line.words.length === 0) {
      return null
    }
    const words = line.words
    const charWeights = words.map((w) => Math.max(1, Array.from(w.text).length))
    const totalChars = Math.max(1, charWeights.reduce((acc, n) => acc + n, 0))
    const nextLineTime = lines[currentIndex + 1]?.time
    const gaps: number[] = []
    for (let i = 0; i < words.length - 1; i += 1) {
      const g = words[i + 1].start - words[i].start
      if (g > 0) gaps.push(g)
    }
    const avgGap = gaps.length > 0
      ? gaps.reduce((acc, g) => acc + g, 0) / gaps.length
      : DEFAULT_WORD_GAP

    const segmentEnds = words.map((w, i) => {
      if (i < words.length - 1) return words[i + 1].start
      const tail = Math.max(SEGMENT_TAIL_MIN, Math.min(SEGMENT_TAIL_MAX, avgGap))
      const fallbackEnd = w.start + tail
      if (nextLineTime !== undefined) {
        return Math.max(w.start + SEGMENT_END_MIN_PAD, Math.min(nextLineTime - SEGMENT_END_NEXT_PAD, fallbackEnd))
      }
      return fallbackEnd
    })
    return { words, charWeights, segmentEnds, totalChars }
  }, [currentIndex, lines])

  const currentLineProgress = useMemo(() => {
    if (!currentLineTiming) return 0
    const { words, charWeights, segmentEnds, totalChars } = currentLineTiming
    if (currentTime <= words[0].start) return 0
    if (currentTime >= segmentEnds[segmentEnds.length - 1]) return 1

    let progressedChars = 0
    for (let i = 0; i < words.length; i += 1) {
      const w = words[i]
      const segEnd = Math.max(w.start + 0.05, segmentEnds[i])
      const segChars = charWeights[i]
      if (currentTime >= segEnd) {
        progressedChars += segChars
        continue
      }
      if (currentTime <= w.start) {
        break
      }
      const t = (currentTime - w.start) / (segEnd - w.start)
      const smooth = t * t * (3 - 2 * t)
      progressedChars += segChars * smooth
      break
    }
    return Math.max(0, Math.min(1, progressedChars / totalChars))
  }, [currentLineTiming, currentTime])

  return {
    lines,
    currentIndex,
    interludeProgress: interludeState?.progress ?? null,
    interludeAfterIndex: interludeState?.afterIndex ?? null,
    interludeHideBefore: inSongInterludeState?.hideBefore ?? null,
    currentLineProgress,
  }
}

export default useLyricSync
