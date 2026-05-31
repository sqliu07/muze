import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle, ListMusic } from "lucide-react"
import { usePlayerStore } from "@/store/playerStore"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const MODE_LABELS: Record<string, string> = {
  sequential: "顺序播放",
  "repeat-all": "列表循环",
  "repeat-one": "单曲循环",
  shuffle: "随机播放",
}

const MODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sequential: Repeat,
  "repeat-all": ListMusic,
  "repeat-one": Repeat1,
  shuffle: Shuffle,
}

export function PlaybackControls() {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const playMode = usePlayerStore((s) => s.playMode)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrev = usePlayerStore((s) => s.playPrev)
  const cyclePlayMode = usePlayerStore((s) => s.cyclePlayMode)

  const ModeIcon = MODE_ICONS[playMode]

  return (
    <div className="flex items-center gap-2">
      {/* 播放模式 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={cyclePlayMode}
            className={cn(playMode !== "sequential" && "text-primary")}
          >
            <ModeIcon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{MODE_LABELS[playMode]}</p>
        </TooltipContent>
      </Tooltip>

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
