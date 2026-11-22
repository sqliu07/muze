import { type TrackOut } from '@/types/api'
import { usePlayerStore, currentTrackSelector } from '@/store/playerStore'
import TrackRow from './TrackRow'
import { trackIdentity } from '@/platform/library'

interface TrackListProps {
  tracks: TrackOut[]
}

export default function TrackList({ tracks }: TrackListProps) {
  const currentTrack = usePlayerStore(currentTrackSelector)
  const setQueue = usePlayerStore((s) => s.setQueue)

  const handlePlay = (track: TrackOut) => {
    const idx = tracks.findIndex((t) => trackIdentity(t) === trackIdentity(track))
    if (idx !== -1) {
      setQueue(tracks, idx)
    }
  }

  return (
    <div className="space-y-0.5">
      {tracks.map((track, i) => (
        <TrackRow
          key={trackIdentity(track)}
          track={track}
          index={i}
          isActive={currentTrack !== undefined && trackIdentity(currentTrack) === trackIdentity(track)}
          onPlay={handlePlay}
        />
      ))}
    </div>
  )
}
