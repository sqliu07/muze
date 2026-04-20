import { useNavigate } from 'react-router-dom'
import { getArtistCoverUrl } from '@/api/client'
import type { ArtistOut } from '@/types/api'

interface ArtistCardProps {
  artist: ArtistOut
}

export default function ArtistCard({ artist }: ArtistCardProps) {
  const navigate = useNavigate()

  return (
    <div
      className="group cursor-pointer space-y-2 text-center"
      onClick={() => navigate(`/artists/${artist.id}`)}
    >
      <div className="mx-auto max-w-[160px] aspect-square overflow-hidden rounded-full bg-muted">
        {artist.cover_path ? (
          <img
            src={getArtistCoverUrl(artist.id)}
            alt={artist.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            🎤
          </div>
        )}
      </div>
      <p className="font-medium truncate">{artist.name}</p>
    </div>
  )
}
