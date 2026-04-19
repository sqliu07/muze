import { useParams } from 'react-router-dom'
import { usePlaylist } from '@/api/hooks/usePlaylists'
import TrackList from '@/components/library/TrackList'

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const playlistId = Number(id)
  const { data: playlist, isLoading } = usePlaylist(playlistId)

  if (isLoading) {
    return <div className="p-6"><p className="text-muted-foreground">加载中...</p></div>
  }

  if (!playlist) {
    return <div className="p-6"><p className="text-muted-foreground">播放列表不存在</p></div>
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{playlist.name}</h1>
        {playlist.description && (
          <p className="text-muted-foreground mt-1">{playlist.description}</p>
        )}
        <p className="text-sm text-muted-foreground mt-1">{playlist.track_count} 首曲目</p>
      </div>

      {playlist.tracks.length === 0 ? (
        <p className="text-muted-foreground">播放列表为空</p>
      ) : (
        <TrackList tracks={playlist.tracks} />
      )}
    </div>
  )
}
