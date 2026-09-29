import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw, SlidersHorizontal } from "lucide-react"
import {
  EQUALIZER_PRESETS,
  usePlayerStore,
  type EqualizerPresetName,
} from "@/store/playerStore"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const PRESET_LABELS: Record<EqualizerPresetName, string> = {
  flat: "平直",
  vocal: "人声",
  bass: "低音",
  rock: "摇滚",
  pop: "流行",
  jazz: "爵士",
  classical: "古典",
  electronic: "电子",
  acoustic: "原声",
  treble: "高音",
}

function formatDb(value: number): string {
  if (value > 0) return `+${value}`
  return `${value}`
}

/** 获取 CSS 变量 --primary 的 HSL 值 */
function getPrimaryColor(): string {
  const style = getComputedStyle(document.documentElement)
  return style.getPropertyValue("--primary").trim() || "222.2 47.4% 11.2%"
}

/** 频响曲线 Canvas 组件 */
function FrequencyResponseCurve({
  preamp,
  bands,
  onBandGainChange,
}: {
  preamp: number
  bands: { frequency: number; gain: number; label: string }[]
  onBandGainChange: (frequency: number, gain: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragIndexRef = useRef<number | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const draw = useCallback(
    (activeIndex?: number | null) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)

      const w = rect.width
      const h = rect.height
      const padding = { top: 8, bottom: 8, left: 4, right: 4 }
      const plotW = w - padding.left - padding.right
      const plotH = h - padding.top - padding.bottom

      ctx.clearRect(0, 0, w, h)

      // 各频段控制点坐标（Canvas 只覆盖 band 区域）
      const points = bands.map((band, i) => ({
        x: padding.left + (i / (bands.length - 1)) * plotW,
        y:
          padding.top +
          plotH / 2 -
          ((band.gain + preamp) / 12) * (plotH / 2),
      }))

      if (points.length < 2) return

      // 计算贝塞尔曲线控制点
      const cp: {
        cp1x: number
        cp1y: number
        cp2x: number
        cp2y: number
      }[] = []
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)]
        const p1 = points[i]
        const p2 = points[i + 1]
        const p3 = points[Math.min(i + 2, points.length - 1)]
        const tension = 0.3
        cp.push({
          cp1x: p1.x + (p2.x - p0.x) * tension,
          cp1y: p1.y + (p2.y - p0.y) * tension,
          cp2x: p2.x - (p3.x - p1.x) * tension,
          cp2y: p2.y - (p3.y - p1.y) * tension,
        })
      }

      const primaryHsl = getPrimaryColor()
      const baseColor = `hsl(${primaryHsl})`
      const fadedColor = `hsla(${primaryHsl.split(" ").slice(0, 2).join(" ")} ${
        primaryHsl.split(" ")[2]
      } / 0.15)`

      // 绘制渐变填充
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 0; i < cp.length; i++) {
        ctx.bezierCurveTo(
          cp[i].cp1x,
          cp[i].cp1y,
          cp[i].cp2x,
          cp[i].cp2y,
          points[i + 1].x,
          points[i + 1].y
        )
      }
      ctx.lineTo(points[points.length - 1].x, padding.top + plotH)
      ctx.lineTo(points[0].x, padding.top + plotH)
      ctx.closePath()

      const gradient = ctx.createLinearGradient(
        0,
        padding.top,
        0,
        padding.top + plotH
      )
      gradient.addColorStop(0, fadedColor)
      gradient.addColorStop(1, "transparent")
      ctx.fillStyle = gradient
      ctx.fill()

      // 绘制曲线
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 0; i < cp.length; i++) {
        ctx.bezierCurveTo(
          cp[i].cp1x,
          cp[i].cp1y,
          cp[i].cp2x,
          cp[i].cp2y,
          points[i + 1].x,
          points[i + 1].y
        )
      }
      ctx.strokeStyle = baseColor
      ctx.lineWidth = 2
      ctx.lineJoin = "round"
      ctx.stroke()

      // 绘制各频段控制点
      for (let i = 0; i < points.length; i++) {
        const p = points[i]
        const isActive = i === activeIndex
        const radius = isActive ? 5 : 3
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = baseColor
        ctx.fill()
        ctx.strokeStyle = "hsl(var(--background))"
        ctx.lineWidth = isActive ? 2 : 1.5
        ctx.stroke()
      }
    },
    [preamp, bands]
  )

  useEffect(() => {
    draw(dragIndexRef.current ?? hoverIndex)
  }, [draw, hoverIndex])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() =>
      draw(dragIndexRef.current ?? hoverIndex)
    )
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw, hoverIndex])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    const x = e.clientX - rect.left

    // 检测是否在某个控制点附近
    const paddingX = 4
    const plotWidth = Math.max(1, rect.width - paddingX * 2)
    const index = Math.round(((x - paddingX) / plotWidth) * (bands.length - 1))
    if (index >= 0 && index < bands.length) {
      const pointX = paddingX + (index / (bands.length - 1)) * plotWidth
      const dist = Math.abs(x - pointX)
      if (dist < 20) {
        dragIndexRef.current = index
        overlay.setPointerCapture(e.pointerId)
        overlay.style.cursor = "grabbing"
        draw(index)
      }
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const overlay = overlayRef.current
    if (!overlay) return
    const rect = overlay.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (dragIndexRef.current !== null) {
      // 拖拽中：更新增益值
      const padding = { top: 8, bottom: 8 }
      const plotH = rect.height - padding.top - padding.bottom
      const normalized = (y - padding.top) / plotH // 0 = +12dB, 1 = -12dB
      const gain = Math.round(
        Math.max(-12, Math.min(12, (0.5 - normalized) * 24))
      )
      onBandGainChange(bands[dragIndexRef.current].frequency, gain)
    } else {
      // hover 检测：更新 cursor 和高亮
      const paddingX = 4
      const plotWidth = Math.max(1, rect.width - paddingX * 2)
      const index = Math.round(((x - paddingX) / plotWidth) * (bands.length - 1))
      if (index >= 0 && index < bands.length) {
        const pointX = paddingX + (index / (bands.length - 1)) * plotWidth
        const dist = Math.abs(x - pointX)
        if (dist < 20) {
          setHoverIndex(index)
          overlay.style.cursor = "grab"
          return
        }
      }
      setHoverIndex(null)
      overlay.style.cursor = "default"
    }
  }

  const handlePointerUp = () => {
    const overlay = overlayRef.current
    if (overlay) {
      overlay.style.cursor = "default"
    }
    dragIndexRef.current = null
    draw(hoverIndex)
  }

  return (
    <div className="relative w-full" style={{ height: 90 }}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none w-full"
        style={{ height: 90, display: "block" }}
      />
      <div
        ref={overlayRef}
        className="absolute inset-0 z-10"
        style={{ cursor: "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  )
}

export function EqualizerControl() {
  const equalizer = usePlayerStore((s) => s.equalizer)
  const setEqualizerEnabled = usePlayerStore((s) => s.setEqualizerEnabled)
  const setEqualizerPreamp = usePlayerStore((s) => s.setEqualizerPreamp)
  const setEqualizerBandGain = usePlayerStore((s) => s.setEqualizerBandGain)
  const setEqualizerPreset = usePlayerStore((s) => s.setEqualizerPreset)
  const resetEqualizer = usePlayerStore((s) => s.resetEqualizer)

  const presetNames = Object.keys(EQUALIZER_PRESETS) as EqualizerPresetName[]

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="均衡器"
              className={cn(equalizer.enabled && "text-primary")}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>均衡器</p>
        </TooltipContent>
      </Tooltip>

      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>均衡器</DialogTitle>
          <DialogDescription>
            选择预设或手动调整前级与十个频段；关闭时音频保持旁路。
          </DialogDescription>
        </DialogHeader>

        {/* 顶部控制栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2">
            <Button
              variant={equalizer.enabled ? "default" : "outline"}
              size="sm"
              onClick={() => setEqualizerEnabled(!equalizer.enabled)}
            >
              {equalizer.enabled ? "启用中" : "已关闭"}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="重置均衡器" onClick={resetEqualizer}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>重置为平直</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <span className="text-xs text-muted-foreground">
            {equalizer.enabled ? "处理链路已启用" : "旁路模式"}
          </span>
        </div>

        {/* 预设按钮组 */}
        <div className="flex gap-1.5 overflow-x-auto pt-1 scrollbar-hide">
          {presetNames.map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant={
                equalizer.preset === preset ? "default" : "outline"
              }
              className="h-7 shrink-0 px-2.5 text-xs"
              onClick={() => setEqualizerPreset(preset)}
            >
              {PRESET_LABELS[preset]}
            </Button>
          ))}
          {equalizer.preset === "custom" && (
            <Button
              size="sm"
              variant="default"
              className="h-7 shrink-0 px-2.5 text-xs"
              disabled
            >
              自定义
            </Button>
          )}
        </div>

        {/* 滑块区域（包含频响曲线） */}
        <div className="overflow-x-auto pt-1">
          <div className="flex min-w-[760px] gap-2 sm:gap-3">
            {/* Preamp */}
            <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  equalizer.preamp === 0
                    ? "text-muted-foreground"
                    : "text-primary"
                )}
              >
                {formatDb(equalizer.preamp)}
              </span>
              <div className="relative flex h-64 w-full items-center justify-center rounded-md bg-muted/30 px-1.5 py-2">
                <Slider
                  aria-label="前级增益"
                  orientation="vertical"
                  min={-12}
                  max={12}
                  step={1}
                  value={[equalizer.preamp]}
                  onValueChange={([value]) => setEqualizerPreamp(value)}
                  className="h-full justify-center [&_span[role=slider]]:h-3 [&_span[role=slider]]:w-3 [&>span:first-child]:w-1"
                />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-5 -translate-x-1/2 bg-border" />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">
                Pre
              </span>
            </div>

            {/* 各频段（带覆盖的频响曲线 Canvas） */}
            <div className="flex flex-1 min-w-0 gap-2 sm:gap-3 relative">
              {/* 频响曲线 Canvas，绝对定位覆盖 band 滑块区域顶部 */}
              <div className="absolute top-0 left-0 right-0 z-10">
                <FrequencyResponseCurve
                  preamp={equalizer.preamp}
                  bands={equalizer.bands}
                  onBandGainChange={setEqualizerBandGain}
                />
              </div>
              {/* 实际的 band 滑块列 */}
              {equalizer.bands.map((band) => (
                <div
                  key={band.frequency}
                  className="flex flex-1 min-w-0 flex-col items-center gap-1.5"
                >
                  <span
                    className={cn(
                      "text-xs font-semibold tabular-nums",
                      band.gain === 0
                        ? "text-muted-foreground"
                        : "text-primary"
                    )}
                  >
                    {formatDb(band.gain)}
                  </span>
                  <div className="relative flex h-64 w-full items-center justify-center rounded-md bg-muted/30 px-1.5 py-2">
                    <Slider
                      aria-label={`${band.label} Hz 增益`}
                      orientation="vertical"
                      min={-12}
                      max={12}
                      step={1}
                      value={[band.gain]}
                      onValueChange={([value]) =>
                        setEqualizerBandGain(band.frequency, value)
                      }
                      className="h-full justify-center [&_span[role=slider]]:h-3 [&_span[role=slider]]:w-3 [&>span:first-child]:w-1"
                    />
                    <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-5 -translate-x-1/2 bg-border" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {band.label}
                  </span>
                </div>
              ))}
            </div>

            {/* dB 标尺 */}
            <div className="flex h-64 flex-col justify-between py-2 text-[9px] tabular-nums text-muted-foreground">
              <span>+12</span>
              <span>0</span>
              <span>-12</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
