import type { LyricLine } from "@/lib/lrcParser"

export type SpotlightLyricTier = "active" | "near" | "far"

export interface SpotlightLyricSlot {
  line: LyricLine | null
  index: number | null
  offset: number
  tier: SpotlightLyricTier
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return -1
  if (index < 0) return 0
  if (index >= length) return length - 1
  return index
}

export function getSpotlightLyricLines(
  lines: LyricLine[],
  currentIndex: number
): SpotlightLyricSlot[] {
  if (lines.length === 0) {
    return []
  }

  const activeIndex = clampIndex(currentIndex, lines.length)
  const slotOffsets = [0, 1, 2, 3]

  return slotOffsets.map((offset) => {
    const absoluteIndex = activeIndex + offset
    const inRange = absoluteIndex >= 0 && absoluteIndex < lines.length
    const distance = Math.abs(offset)

    return {
      line: inRange ? lines[absoluteIndex] : null,
      index: inRange ? absoluteIndex : null,
      offset,
      tier: distance === 0 ? "active" : distance === 1 ? "near" : "far",
    }
  })
}
