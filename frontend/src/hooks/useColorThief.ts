import { getPaletteSync } from "colorthief"
import { useEffect, useState } from "react"

export type RGB = [number, number, number]

interface PaletteCandidate {
  color: RGB
  proportion: number
}

const DEFAULT_COLORS: RGB[] = [
  [22, 24, 29],
  [72, 76, 86],
  [42, 45, 52],
]
const paletteCache = new Map<string, RGB[]>()
const MAX_CACHE_SIZE = 64

function luminance([red, green, blue]: RGB): number {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
}

function chroma(color: RGB): number {
  return (Math.max(...color) - Math.min(...color)) / 255
}

function hue([red, green, blue]: RGB): number | null {
  const [r, g, b] = [red / 255, green / 255, blue / 255]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta < 0.015) return null
  let value: number
  if (max === r) value = ((g - b) / delta) % 6
  else if (max === g) value = (b - r) / delta + 2
  else value = (r - g) / delta + 4
  return (value * 60 + 360) % 360
}

function hueDistance(left: RGB, right: RGB): number {
  const leftHue = hue(left)
  const rightHue = hue(right)
  if (leftHue === null || rightHue === null) return 0
  const difference = Math.abs(leftHue - rightHue)
  return Math.min(difference, 360 - difference)
}

function distance(left: RGB, right: RGB): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])
}

function mix(left: RGB, right: RGB, rightWeight: number): RGB {
  return left.map((channel, index) =>
    Math.round(channel * (1 - rightWeight) + right[index] * rightWeight)
  ) as RGB
}

function semanticPalette(raw: PaletteCandidate[]): RGB[] {
  const unique = raw.filter((candidate, index, all) =>
    all.findIndex((other) => distance(other.color, candidate.color) < 12) === index
  )
  if (!unique.length) return DEFAULT_COLORS

  const usable = unique.filter(({ color }) => {
    const light = luminance(color)
    return light > 0.055 && light < 0.92
  })
  const candidates = usable.length ? usable : unique
  const dominanceScore = ({ color, proportion }: PaletteCandidate) =>
    proportion * (1.75 - luminance(color))
  const dominantCandidate = [...candidates].sort(
    (left, right) => dominanceScore(right) - dominanceScore(left)
  )[0]
  const dominant = dominantCandidate.color

  const accentPool = candidates.filter(
    ({ color }) =>
      color !== dominant &&
      distance(color, dominant) >= 18 &&
      hueDistance(color, dominant) >= 25
  )
  const accentCandidate = [...(accentPool.length ? accentPool : candidates)].sort(
    (left, right) =>
      right.proportion * (1 + chroma(right.color)) -
      left.proportion * (1 + chroma(left.color))
  )[0]
  const accent = accentCandidate.color

  const secondaryPool = candidates.filter(
    ({ color }) =>
      color !== dominant &&
      color !== accent &&
      distance(color, accent) >= 18
  )
  const secondaryCandidate = [...(secondaryPool.length ? secondaryPool : candidates)].sort(
    (left, right) => right.proportion - left.proportion
  )[0]
  const secondary = secondaryCandidate.color

  const darkMix = luminance(dominant) > 0.68 ? 0.72 : luminance(dominant) < 0.12 ? 0.3 : 0.56
  const base = mix(dominant, [12, 14, 18], darkMix)
  return [base, accent ?? DEFAULT_COLORS[1], secondary ?? DEFAULT_COLORS[2]]
}

function remember(key: string, colors: RGB[]) {
  paletteCache.delete(key)
  paletteCache.set(key, colors)
  while (paletteCache.size > MAX_CACHE_SIZE) {
    const oldest = paletteCache.keys().next().value
    if (oldest === undefined) break
    paletteCache.delete(oldest)
  }
}

/** Extract a stable semantic palette from the versioned cover URL. */
export function useColorThief(imageUrl: string | null): RGB[] {
  const [colors, setColors] = useState<RGB[]>(DEFAULT_COLORS)

  useEffect(() => {
    if (!imageUrl) {
      setColors(DEFAULT_COLORS)
      return
    }
    const cached = paletteCache.get(imageUrl)
    if (cached) {
      setColors(cached)
      return
    }

    let cancelled = false
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => {
      if (cancelled) return
      try {
        const raw = (getPaletteSync(image, {
          colorCount: 12,
          quality: 4,
          colorSpace: "oklch",
        }) ?? []).map((color) => ({
          color: color.array() as RGB,
          proportion: color.proportion,
        }))
        const palette = semanticPalette(raw)
        remember(imageUrl, palette)
        setColors(palette)
      } catch {
        setColors(DEFAULT_COLORS)
      }
    }
    image.onerror = () => {
      if (!cancelled) setColors(DEFAULT_COLORS)
    }
    image.src = imageUrl
    return () => {
      cancelled = true
      image.onload = null
      image.onerror = null
    }
  }, [imageUrl])

  return colors
}

export default useColorThief
