import { useMemo, useRef, useState, useEffect } from "react"
import { motion } from "framer-motion"
import useAudioAnalyser from "@/hooks/useAudioAnalyser"

interface BassBlobsProps {
  colors: [number, number, number][]
  intensity?: number
  speed?: number
}

function toRgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

// 每个 blob 的独立运动参数
const BLOB_DEFS = [
  { cxBase: 25, cyBase: 35, rxBase: 65, ryBase: 52, orbitRadius: 8, orbitPeriod: 32 },
  { cxBase: 65, cyBase: 55, rxBase: 58, ryBase: 50, orbitRadius: 10, orbitPeriod: 40 },
]

export default function BassBlobs({ colors, intensity = 1, speed = 1 }: BassBlobsProps) {
  const { bassSmoothed } = useAudioAnalyser()
  const seedRef = useRef(Math.floor(Math.random() * 100))
  const [t, setT] = useState(0)
  const rafRef = useRef<number | null>(null)

  // RAF 驱动时间计数器，触发位置更新
  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      setT((now - start) / 1000)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const blobColors = useMemo(
    () => [
      toRgba(colors[0], 0.82),
      toRgba(colors[1], 0.55),
    ],
    [colors],
  )

  const displacedBass = bassSmoothed * intensity
  const displaceScale = 24 + displacedBass * 45
  const containerScale = 1 + displacedBass * 0.04

  const periodDivider = speed

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      animate={{ scale: containerScale }}
      transition={{ type: "tween", duration: 0.15, ease: "easeOut" }}
      style={{ filter: "blur(45px)" }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
      >
        <defs>
          <filter
            id="proto-organic"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.008"
              numOctaves="4"
              seed={seedRef.current}
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                values="0.007;0.014;0.007"
                dur={`${Math.max(4, 28 / Math.max(0.15, speed))}s`}
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={displaceScale}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="18" />
          </filter>
        </defs>

        {BLOB_DEFS.map((def, i) => {
          const period = def.orbitPeriod / Math.max(0.15, periodDivider)
          const angle = t * (2 * Math.PI) / period
          const cx = def.cxBase + Math.cos(angle + i * 2.1) * def.orbitRadius * intensity
          const cy = def.cyBase + Math.sin(angle + i * 2.1) * def.orbitRadius * intensity
          const rx = def.rxBase + Math.sin(angle * 0.55 + i) * 5 * intensity
          const ry = def.ryBase + Math.cos(angle * 0.55 + i) * 5 * intensity

          return (
            <motion.ellipse
              key={i}
              cx={`${cx}%`}
              cy={`${cy}%`}
              rx={`${rx}%`}
              ry={`${ry}%`}
              fill={blobColors[i]}
              filter="url(#proto-organic)"
            />
          )
        })}
      </svg>
    </motion.div>
  )
}
