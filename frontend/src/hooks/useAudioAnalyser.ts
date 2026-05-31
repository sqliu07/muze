import { useEffect, useRef, useState } from "react"
import { getAudioElement, getAudioContext } from "@/hooks/useAudio"

// 低频分析配置 (0-150Hz)
const BASS_MIN_HZ = 20
const BASS_MAX_HZ = 150
const SMOOTH_FACTOR = 0.35 // 指数平滑系数

export interface AudioAnalyserResult {
  bassEnergy: number
  bassSmoothed: number
}

let analyserNode: AnalyserNode | null = null
let frequencyData: Uint8Array | null = null
let sourceConnected = false

function setupAnalyser(): AnalyserNode | null {
  if (analyserNode) return analyserNode

  try {
    const ctx = getAudioContext()

    // 先恢复 AudioContext，避免 createMediaElementSource 后静音
    if (ctx.state === "suspended") {
      ctx.resume()
    }

    const audio = getAudioElement()

    analyserNode = ctx.createAnalyser()
    analyserNode.fftSize = 512
    analyserNode.smoothingTimeConstant = 0.4

    if (!sourceConnected) {
      const source = ctx.createMediaElementSource(audio)
      source.connect(analyserNode)
      analyserNode.connect(ctx.destination)
      sourceConnected = true
    }

    frequencyData = new Uint8Array(analyserNode.frequencyBinCount)
    return analyserNode
  } catch {
    return null
  }
}

function computeBassEnergy(): number {
  const node = setupAnalyser()
  if (!node || !frequencyData) return 0

  node.getByteFrequencyData(frequencyData)

  const sampleRate = getAudioContext().sampleRate
  const binCount = node.frequencyBinCount
  const fftSize = node.fftSize
  const binWidth = sampleRate / fftSize

  const loBin = Math.max(0, Math.floor(BASS_MIN_HZ / binWidth))
  const hiBin = Math.min(binCount - 1, Math.floor(BASS_MAX_HZ / binWidth))

  if (hiBin <= loBin) return 0

  let sum = 0
  for (let i = loBin; i <= hiBin; i += 1) {
    sum += frequencyData[i] / 255
  }
  return sum / (hiBin - loBin + 1)
}

export function useAudioAnalyser(): AudioAnalyserResult {
  const [bassEnergy, setBassEnergy] = useState(0)
  const [bassSmoothed, setBassSmoothed] = useState(0)
  const smoothedRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let active = true

    // 处理 AudioContext 自动挂起（浏览器 autoplay 策略）
    const ctx = getAudioContext()
    if (ctx.state === "suspended") {
      ctx.resume()
    }

    const tick = () => {
      if (!active) return
      const raw = computeBassEnergy()
      smoothedRef.current =
        smoothedRef.current * (1 - SMOOTH_FACTOR) + raw * SMOOTH_FACTOR

      setBassEnergy(raw)
      setBassSmoothed(smoothedRef.current)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      active = false
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return { bassEnergy, bassSmoothed }
}

export default useAudioAnalyser
