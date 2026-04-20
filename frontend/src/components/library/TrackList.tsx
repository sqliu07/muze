import { type TrackOut } from '@/types/api'
import { usePlayerStore, currentTrackSelector } from '@/store/playerStore'
import TrackRow from './TrackRow'

interface TrackListProps {
  tracks: TrackOut[]
}

export default function TrackList({ tracks }: TrackListProps) {
  const currentTrack = usePlayerStore(currentTrackSelector)
  const setQueue = usePlayerStore((s) => s.setQueue)

  const handlePlay = (track: TrackOut) => {
    const idx = tracks.findIndex((t) => t.id === track.id)
    if (idx !== -1) {
      setQueue(tracks, idx)
    }
  }

  return (
    <div className="space-y-0.5">
      {tracks.map((track, i) => (
        <TrackRow
          key={track.id}
          track={track}
          index={i}
          isActive={currentTrack?.id === track.id}
          onPlay={handlePlay}
        />
      ))}
    </div>
  )
}
