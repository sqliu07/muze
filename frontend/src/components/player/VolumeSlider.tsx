import { VolumeX, Volume2 } from "lucide-react"
import { usePlayerStore } from "@/store/playerStore"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

export function VolumeSlider() {
  const volume = usePlayerStore((s) => s.volume)
  const setVolume = usePlayerStore((s) => s.setVolume)

  const toggleMute = () => {
    setVolume(volume === 0 ? 0.8 : 0)
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={toggleMute}>
        {volume === 0 ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </Button>
      <Slider
        value={[Math.round(volume * 100)]}
        max={100}
        step={1}
        onValueChange={([value]) => setVolume(value / 100)}
        className="w-28 py-2"
      />
    </div>
  )
}
