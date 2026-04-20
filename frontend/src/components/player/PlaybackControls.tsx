import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle } from "lucide-react"
import { usePlayerStore } from "@/store/playerStore"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PlaybackControls() {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const playMode = usePlayerStore((s) => s.playMode)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrev = usePlayerStore((s) => s.playPrev)
  const cyclePlayMode = usePlayerStore((s) => s.cyclePlayMode)

  const ModeIcon =
    playMode === "repeat-one" ? Repeat1
    : playMode === "shuffle" ? Shuffle
    : Repeat

  return (
    <div className="flex items-center gap-2">
      {/* 播放模式 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={cyclePlayMode}
        className={cn(playMode !== "sequential" && "text-primary")}
      >
        <ModeIcon className="h-4 w-4" />
      </Button>

      {/* 上一曲 */}
      <Button variant="ghost" size="icon" onClick={playPrev}>
        <SkipBack className="h-4 w-4" />
      </Button>

      {/* 播放/暂停 */}
      <Button
        variant="default"
        size="icon"
        onClick={() => setPlaying(!isPlaying)}
        className="rounded-full"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      {/* 下一曲 */}
      <Button variant="ghost" size="icon" onClick={playNext}>
        <SkipForward className="h-4 w-4" />
      </Button>
    </div>
  )
}
