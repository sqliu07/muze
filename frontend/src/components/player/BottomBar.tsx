import { Maximize2 } from "lucide-react"
import { usePlayerStore, currentTrackSelector } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { getTrackCoverUrl } from "@/api/client"
import { PlaybackControls } from "./PlaybackControls"
import { ProgressBar } from "./ProgressBar"
import { VolumeSlider } from "./VolumeSlider"
import { EqualizerControl } from "./EqualizerControl"

interface BottomBarProps {
  onSeek: (time: number) => void
}

export function BottomBar({ onSeek }: BottomBarProps) {
  const currentTrack = usePlayerStore(currentTrackSelector)
  const setNowPlayingOpen = useUIStore((s) => s.setNowPlayingOpen)

  return (
    <div
      className="flex h-16 items-center justify-between border-t px-4"
      style={{ backgroundColor: "hsl(var(--player-bg))" }}
    >
      {/* 左侧：封面 + 曲名/歌手 */}
      <div className="flex w-48 items-center gap-3">
        {currentTrack ? (
          <>
            <button
              onClick={() => setNowPlayingOpen(true)}
              className="group relative h-10 w-10 shrink-0"
            >
              {currentTrack.has_cover ? (
                <img
                  src={getTrackCoverUrl(currentTrack.id, currentTrack.album?.cover_path)}
                  alt={currentTrack.title}
                  className="h-full w-full rounded object-cover"
                />
              ) : (
                <div className="h-full w-full rounded bg-muted" />
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="h-4 w-4 text-white" />
              </div>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{currentTrack.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {currentTrack.artist?.name ?? "未知艺术家"}
              </p>
            </div>
          </>
        ) : (
          <div className="h-10 w-10 rounded bg-muted" />
        )}
      </div>

      {/* 中间：控制 + 进度条 */}
      <div className="flex flex-1 flex-col items-center gap-1">
        <PlaybackControls />
        <ProgressBar onSeek={onSeek} />
      </div>

      {/* 右侧：音量 */}
      <div className="flex w-48 items-center justify-end gap-2">
        <EqualizerControl />
        <VolumeSlider />
      </div>
    </div>
  )
}
