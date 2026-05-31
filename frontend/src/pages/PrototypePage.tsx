import { useState } from "react"
import { usePlayerStore, currentTrackSelector } from "@/store/playerStore"
import { getTrackCoverUrl } from "@/api/client"
import useColorThief from "@/hooks/useColorThief"
import useAudioAnalyser from "@/hooks/useAudioAnalyser"
import BassBlobs from "@/components/prototype/BassBlobs"
import InterludeDemo from "@/components/prototype/InterludeDemo"

const FALLBACK_COVER = "/test-cover.jpg"

export default function PrototypePage() {
  const track = usePlayerStore(currentTrackSelector)
  const coverUrl = track ? getTrackCoverUrl(track.id) : FALLBACK_COVER
  const colors = useColorThief(coverUrl)
  const { bassSmoothed } = useAudioAnalyser()

  const [intensity, setIntensity] = useState(1)
  const [freqSpeed, setFreqSpeed] = useState(1)

  return (
    <div className="flex flex-col gap-8 p-8 h-full">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold text-white mb-2">动画原型</h1>
        <p className="text-sm text-white/60">
          {track
            ? `正在播放: ${track.title} — ${track.artist?.name ?? "未知"}`
            : `未在播放，取色来源: ${FALLBACK_COVER}`}
          <span className="ml-4 font-mono text-white/40">
            bass: {bassSmoothed.toFixed(3)}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* 音频驱动 Blob 背景 */}
        <section className="flex flex-col gap-3 min-h-0">
          <h2 className="text-lg font-semibold text-white/80 shrink-0">
            Bass Blob 背景
            <span className="ml-2 text-sm font-normal text-white/40">
              封面取色 + 低频驱动不规则图形
            </span>
          </h2>

          {/* 控制滑块 */}
          <div className="flex gap-6 shrink-0 text-xs text-white/60">
            <label className="flex items-center gap-2">
              强度
              <input
                type="range"
                min="0"
                max="3"
                step="0.1"
                value={intensity}
                onChange={(e) => setIntensity(parseFloat(e.target.value))}
                className="w-24"
              />
              <span className="font-mono w-6">{intensity.toFixed(1)}</span>
            </label>
            <label className="flex items-center gap-2">
              速度
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={freqSpeed}
                onChange={(e) => setFreqSpeed(parseFloat(e.target.value))}
                className="w-24"
              />
              <span className="font-mono w-6">{freqSpeed.toFixed(1)}</span>
            </label>
          </div>

          <div className="relative flex-1 min-h-[400px] rounded-xl overflow-hidden border border-white/10 bg-[rgb(12,12,12)]">
            <BassBlobs colors={colors} intensity={intensity} speed={freqSpeed} />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img
                src={coverUrl}
                alt="cover"
                className="w-32 h-32 rounded-xl object-cover shadow-2xl"
                crossOrigin="anonymous"
              />
            </div>
          </div>
        </section>

        {/* 间奏过渡 */}
        <section className="flex flex-col gap-3 min-h-0">
          <h2 className="text-lg font-semibold text-white/80 shrink-0">
            间奏过渡
            <span className="ml-2 text-sm font-normal text-white/40">
              点阵消失 → 新行上浮取代
            </span>
          </h2>
          <div className="flex-1 min-h-[400px] rounded-xl overflow-hidden border border-white/10 bg-[rgb(12,12,12)]">
            <InterludeDemo />
          </div>
        </section>
      </div>
    </div>
  )
}
