import { Music } from "lucide-react"
import { getTrackCoverUrl } from "@/api/client"
import type { TrackOut } from "@/types/api"

interface CoverArtProps {
  track: TrackOut | null
  size?: number
}

function CoverArt({ track, size = 300 }: CoverArtProps) {
  if (track?.has_cover) {
    return (
      <img
        src={getTrackCoverUrl(track.id, track.album?.cover_path)}
        alt={track.title}
        crossOrigin="anonymous"
        className="rounded-2xl shadow-2xl"
        style={{ width: size, height: size, objectFit: "cover" }}
      />
    )
  }

  return (
    <div
      className="flex items-center justify-center rounded-2xl bg-muted shadow-2xl"
      style={{ width: size, height: size }}
    >
      <Music className="h-1/3 w-1/3 text-muted-foreground" />
    </div>
  )
}

export default CoverArt
