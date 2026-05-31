import { useState, useEffect, useRef } from "react"

declare global {
  interface Window {
    ColorThief: new () => {
      getColor: (img: HTMLImageElement, quality?: number) => [number, number, number]
      getPalette: (img: HTMLImageElement, colorCount?: number, quality?: number) => [number, number, number][]
    }
  }
}

const DEFAULT_COLORS: [number, number, number][] = [
  [45, 45, 45],
  [30, 30, 30],
]

/**
 * 从封面图片提取主色调
 * 使用 colorthief CDN（window.ColorThief）
 */
export function useColorThief(imageUrl: string | null): [number, number, number][] {
  const [colors, setColors] = useState<[number, number, number][]>(DEFAULT_COLORS)
  const cacheRef = useRef<Map<string, [number, number, number][]>>(new Map())

  useEffect(() => {
    if (!imageUrl) {
      setColors(DEFAULT_COLORS)
      return
    }

    // 缓存命中
    const cached = cacheRef.current.get(imageUrl)
    if (cached) {
      setColors(cached)
      return
    }

    // 等待 ColorThief 加载
    if (!window.ColorThief) {
      setColors(DEFAULT_COLORS)
      return
    }

    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      try {
        const ct = new window.ColorThief()
        const palette = ct.getPalette(img, 2).slice(0, 2)
        while (palette.length < 2) {
          palette.push(DEFAULT_COLORS[palette.length])
        }
        cacheRef.current.set(imageUrl, palette)
        setColors(palette)
      } catch {
        setColors(DEFAULT_COLORS)
      }
    }

    img.onerror = () => setColors(DEFAULT_COLORS)
    img.src = imageUrl

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [imageUrl])

  return colors
}

export default useColorThief
