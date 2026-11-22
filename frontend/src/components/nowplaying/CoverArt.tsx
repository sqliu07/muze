import { Music } from "lucide-react"
import { getTrackCoverUrl } from "@/api/client"
import type { TrackOut } from "@/types/api"
import { cn } from "@/lib/utils"

interface CoverArtProps {
  track: TrackOut | null
  size?: number
  className?: string
}

function CoverArt({ track, size = 300, className }: CoverArtProps) {
  if (track?.has_cover) {
    return (
      <img
        src={track.source_id === "local:android" ? track.cover_url ?? undefined : getTrackCoverUrl(track.id, track.album?.cover_path, track.source_id)}
        alt={track.title}
        crossOrigin="anonymous"
        className={cn("rounded-2xl shadow-2xl", className)}
        style={{ width: size, maxWidth: "calc(100% - 24px)", height: "auto", aspectRatio: "1", objectFit: "cover" }}
      />
    )
  }

  return (
    <div
      className={cn("flex items-center justify-center rounded-2xl bg-muted shadow-2xl", className)}
      style={{ width: size, maxWidth: "calc(100% - 24px)", aspectRatio: "1" }}
    >
      <Music className="h-1/3 w-1/3 text-muted-foreground" />
    </div>
  )
}

export default CoverArt
