import { useEffect, useRef } from "react"
import { subscribeAudioAnalysis } from "@/hooks/useAudioAnalyser"
import { observeCanvasSize } from "@/lib/canvas"
import { logarithmicBins, sampleSpectrum } from "@/lib/spectrum"

interface SpectrumVisualizerProps {
  height?: number
  color?: string
  visible: boolean
}

function withAlpha(color: string, alpha: number): string {
  const rgba = color.match(/^rgba?\(([^)]+)\)$/i)
  if (!rgba) return color
  const channels = rgba[1].split(",").slice(0, 3).map((part) => part.trim())
  return `rgba(${channels.join(", ")}, ${alpha})`
}

/** Log-frequency spectrum driven directly by the shared analyser loop. */
export function SpectrumVisualizer({
  height = 64,
  color = "rgba(255, 255, 255, 0.78)",
  visible,
}: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ width: 0, height })
  const smoothRef = useRef(new Float32Array(64))
  const binsRef = useRef(new Float32Array(0))
  const sourceShapeRef = useRef("")

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !visible) return
    const context = canvas.getContext("2d")
    if (!context) return

    const stopObserving = observeCanvasSize(canvas, (width, nextHeight) => {
      sizeRef.current = { width, height: nextHeight }
    })

    const unsubscribe = subscribeAudioAnalysis(({ spectrumData, sampleRate }) => {
      const { width, height: canvasHeight } = sizeRef.current
      context.clearRect(0, 0, width, canvasHeight)
      if (width <= 0 || canvasHeight <= 0 || spectrumData.length < 2) return

      const sourceShape = `${spectrumData.length}:${sampleRate}`
      if (sourceShapeRef.current !== sourceShape) {
        sourceShapeRef.current = sourceShape
        binsRef.current = logarithmicBins(spectrumData.length, sampleRate, smoothRef.current.length)
        smoothRef.current.fill(0)
      }

      const smooth = smoothRef.current
      for (let index = 0; index < smooth.length; index += 1) {
        const sampled = Math.pow(sampleSpectrum(spectrumData, binsRef.current[index]), 0.72)
        const response = sampled > smooth[index] ? 0.48 : 0.1
        smooth[index] += (sampled - smooth[index]) * response
      }

      const paddingY = 4
      const plotHeight = Math.max(1, canvasHeight - paddingY * 2)
      const point = (index: number) => ({
        x: (index / (smooth.length - 1)) * width,
        y: paddingY + plotHeight * (1 - smooth[index] * 0.92),
      })
      const trace = () => {
        const first = point(0)
        context.moveTo(first.x, first.y)
        for (let index = 0; index < smooth.length - 1; index += 1) {
          const current = point(index)
          const next = point(index + 1)
          const midpointX = (current.x + next.x) / 2
          context.bezierCurveTo(midpointX, current.y, midpointX, next.y, next.x, next.y)
        }
      }

      context.beginPath()
      trace()
      const gradient = context.createLinearGradient(0, paddingY, 0, canvasHeight)
      gradient.addColorStop(0, withAlpha(color, 0.34))
      gradient.addColorStop(0.68, withAlpha(color, 0.08))
      gradient.addColorStop(1, withAlpha(color, 0))
      context.lineTo(width, canvasHeight)
      context.lineTo(0, canvasHeight)
      context.closePath()
      context.fillStyle = gradient
      context.fill()

      context.beginPath()
      trace()
      context.strokeStyle = color
      context.lineWidth = 1.5
      context.lineJoin = "round"
      context.lineCap = "round"
      context.stroke()
    })

    return () => {
      unsubscribe()
      stopObserving()
    }
  }, [color, visible])

  if (!visible) return null
  return (
    <canvas
      ref={canvasRef}
      aria-label="实时音频频谱"
      className="block w-full"
      style={{ height, pointerEvents: "none" }}
    />
  )
}

export default SpectrumVisualizer
