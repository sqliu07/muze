import { useMemo } from "react"
import { usePlayerStore } from "@/store/playerStore"
import { parseLrc, getCurrentLineIndex } from "@/lib/lrcParser"
import type { LyricLine } from "@/lib/lrcParser"
import type { LyricsOut } from "@/types/api"

export interface LyricSyncResult {
  lines: { time: number; text: string; words?: { start: number; text: string }[] }[]
  currentIndex: number
  interludeProgress: number | null
  interludeAfterIndex: number | null
  currentLineProgress: number
}

export function useLyricSync(lyrics: LyricsOut | null | undefined): LyricSyncResult {
  const currentTime = usePlayerStore((s) => s.currentTime)

  const timingLines = useMemo(() => {
    if (!lyrics?.content) return []
    if (!lyrics.synced) return []
    return parseLrc(lyrics.content)
  }, [lyrics?.content, lyrics?.synced])

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
    const minPreludeDuration = 3.5
    if (firstLineTime < minPreludeDuration) return null

    const hideBeforeFirst = 0.08
    if (currentTime >= firstLineTime - hideBeforeFirst) return null

    const fillWindow = Math.min(6.5, Math.max(2.2, firstLineTime * 0.65))
    const fillStart = Math.max(0, firstLineTime - fillWindow)
    const fillEnd = firstLineTime - 0.9

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
    // 句间长间奏仍显示点阵，但跳过首句前奏区间，避免“前奏每句都出现”。
    if (currentIndex < 1 || currentIndex >= lines.length - 1) return null

    const currentLineTime = lines[currentIndex].time
    const nextLineTime = lines[currentIndex + 1].time
    const gap = nextLineTime - currentLineTime
    if (gap < 8) return null

    const leadIn = 1.2
    const fillBeforeNext = 1.0
    const hideBeforeNext = 0.08
    const cleanText = lines[currentIndex].text.replace(/\s+/g, "")
    const estimatedReadDuration = Math.min(
      4.8,
      Math.max(2.0, cleanText.length * 0.19)
    )
    const interludeStart = Math.max(
      currentLineTime + leadIn,
      currentLineTime + estimatedReadDuration
    )

    if (currentTime < interludeStart || currentTime >= nextLineTime - hideBeforeNext) return null

    const fillStart = interludeStart
    const fillEnd = nextLineTime - fillBeforeNext

    return {
      progress:
        fillEnd <= fillStart
          ? 1
          : Math.max(0, Math.min(1, (currentTime - fillStart) / (fillEnd - fillStart))),
      afterIndex: currentIndex,
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
      : 0.22

    const segmentEnds = words.map((w, i) => {
      if (i < words.length - 1) return words[i + 1].start
      const tail = Math.max(0.14, Math.min(0.5, avgGap))
      const fallbackEnd = w.start + tail
      if (nextLineTime !== undefined) {
        return Math.max(w.start + 0.08, Math.min(nextLineTime - 0.02, fallbackEnd))
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
    currentLineProgress,
  }
}

export default useLyricSync
