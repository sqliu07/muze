import { useEffect, useState } from "react"
import {
  getBackgroundDebugSettings,
  getBackgroundRhythmSnapshot,
  resetBackgroundDebugSettings,
  setBackgroundDebugSettings,
  subscribeBackgroundDebugSettings,
  subscribeBackgroundRhythmSnapshot,
} from "@/lib/backgroundDebug"

export function BackgroundDebugPanel() {
  const [settings, setSettings] = useState(getBackgroundDebugSettings)
  const [rhythm, setRhythm] = useState(getBackgroundRhythmSnapshot)
  const visible = new URLSearchParams(window.location.search).get("bgdebug") === "1"

  useEffect(() => subscribeBackgroundDebugSettings(setSettings), [])
  useEffect(() => subscribeBackgroundRhythmSnapshot(setRhythm), [])
  if (!visible) return null

  return (
    <aside className="absolute right-4 top-16 z-20 w-64 rounded-xl border border-white/15 bg-black/55 p-3 text-white shadow-xl backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold">背景动画调试</p>
        <button
          type="button"
          onClick={() => resetBackgroundDebugSettings()}
          className="text-[11px] text-white/55 transition-colors hover:text-white"
        >
          复位
        </button>
      </div>

      <label className="mb-3 flex items-center justify-between text-[11px] text-white/65">
        <span>跟随音乐节奏</span>
        <input
          aria-label="背景跟随音乐节奏"
          type="checkbox"
          checked={settings.audioReactive}
          onChange={(event) =>
            setBackgroundDebugSettings({ audioReactive: event.target.checked })
          }
          className="h-4 w-4 accent-white"
        />
      </label>

      <label className="block text-[11px] text-white/65">
        <span className="flex justify-between">
          <span>颜色/位移强度</span>
          <span>{settings.intensity.toFixed(1)}×</span>
        </span>
        <input
          aria-label="背景颜色和位移强度"
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={settings.intensity}
          onChange={(event) =>
            setBackgroundDebugSettings({ intensity: Number(event.target.value) })
          }
          className="mt-1 w-full accent-white"
        />
      </label>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-white/5 p-2 text-center text-[10px] text-white/55">
        <div>
          <p className="text-white/85">{rhythm.bpm ? Math.round(rhythm.bpm) : "--"}</p>
          <p>BPM</p>
        </div>
        <div>
          <p className="text-white/85">{rhythm.energy.toFixed(2)}</p>
          <p>能量</p>
        </div>
        <div>
          <p className="text-white/85">{rhythm.pulse.toFixed(2)}</p>
          <p>脉冲</p>
        </div>
      </div>

      <label className="mt-3 block text-[11px] text-white/65">
        <span className="flex justify-between">
          <span>动画速度</span>
          <span>{settings.speed.toFixed(2)}×</span>
        </span>
        <input
          aria-label="背景动画速度"
          type="range"
          min="0.25"
          max="3"
          step="0.25"
          value={settings.speed}
          onChange={(event) =>
            setBackgroundDebugSettings({ speed: Number(event.target.value) })
          }
          className="mt-1 w-full accent-white"
        />
      </label>
    </aside>
  )
}

export default BackgroundDebugPanel
