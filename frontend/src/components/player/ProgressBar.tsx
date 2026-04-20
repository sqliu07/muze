import { usePlayerStore, currentTrackSelector } from "@/store/playerStore"
import { formatDuration } from "@/lib/utils"
import { Slider } from "@/components/ui/slider"

interface ProgressBarProps {
  onSeek: (time: number) => void
}

export function ProgressBar({ onSeek }: ProgressBarProps) {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const currentTrack = usePlayerStore(currentTrackSelector)
  const duration = currentTrack?.duration ?? 0

  return (
    <div className="mx-auto flex w-full max-w-xl items-center gap-2">
      <span className="w-10 text-right text-xs text-muted-foreground">
        {formatDuration(currentTime)}
      </span>
      <Slider
        value={[currentTime]}
        max={duration}
        step={1}
        onValueChange={([value]) => onSeek(value)}
        className="flex-1"
      />
      <span className="w-10 text-xs text-muted-foreground">
        {formatDuration(duration)}
      </span>
    </div>
  )
}
