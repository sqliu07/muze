import { Maximize2, Music, Pause, Play, SkipForward } from "lucide-react"
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
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const playNext = usePlayerStore((s) => s.playNext)
  const playbackError = usePlayerStore((s) => s.playbackError)
  const setNowPlayingOpen = useUIStore((s) => s.setNowPlayingOpen)

  return (
    <>
    <div className="mobile-mini-player flex h-[68px] shrink-0 items-center gap-1 border-t bg-background px-3 md:hidden">
      <button
        onClick={() => setNowPlayingOpen(true)}
        aria-label={currentTrack ? `打开正在播放：${currentTrack.title}` : "打开播放器"}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2 text-left"
      >
        {currentTrack?.has_cover ? (
          <img src={currentTrack.source_id === "local:android" ? currentTrack.cover_url ?? undefined : getTrackCoverUrl(currentTrack.id, currentTrack.album?.cover_path, currentTrack.source_id)} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted"><Music className="h-5 w-5 text-muted-foreground" /></div>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{currentTrack?.title ?? "选择一首音乐"}</span>
          <span role={playbackError ? "alert" : undefined} className={`block truncate text-xs ${playbackError ? "text-destructive" : "text-muted-foreground"}`}>{playbackError ?? currentTrack?.artist?.name ?? "你的音乐，随时播放"}</span>
        </span>
      </button>
      <button aria-label={isPlaying ? "暂停" : "播放"} disabled={!currentTrack} onClick={() => setPlaying(!isPlaying)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40">
        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
      </button>
      <button aria-label="下一首" disabled={!currentTrack} onClick={playNext} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"><SkipForward className="h-5 w-5" /></button>
    </div>
    <div
      className="hidden h-16 shrink-0 items-center justify-between gap-4 border-t px-4 md:flex"
      style={{ backgroundColor: "hsl(var(--player-bg))" }}
    >
      {/* 左侧：封面 + 曲名/歌手 */}
      <div className="flex w-48 min-w-0 items-center gap-3">
        {currentTrack ? (
          <>
            <button
              onClick={() => setNowPlayingOpen(true)}
              aria-label="打开正在播放"
              className="group relative h-10 w-10 shrink-0"
            >
              {currentTrack.has_cover ? (
                <img
                  src={currentTrack.source_id === "local:android" ? currentTrack.cover_url ?? undefined : getTrackCoverUrl(currentTrack.id, currentTrack.album?.cover_path, currentTrack.source_id)}
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
              <p role={playbackError ? "alert" : undefined} title={playbackError ?? undefined} className={`truncate text-xs ${playbackError ? "text-destructive" : "text-muted-foreground"}`}>
                {playbackError ?? currentTrack.artist?.name ?? "未知艺术家"}
              </p>
            </div>
          </>
        ) : (
          <div className="h-10 w-10 rounded bg-muted" />
        )}
      </div>

      {/* 中间：控制 + 进度条 */}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
        <PlaybackControls />
        <ProgressBar onSeek={onSeek} />
      </div>

      {/* 右侧：音量 */}
      <div className="flex w-48 items-center justify-end gap-2">
        <EqualizerControl />
        <VolumeSlider />
      </div>
    </div>
    </>
  )
}
