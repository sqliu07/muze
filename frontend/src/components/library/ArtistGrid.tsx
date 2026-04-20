import type { ArtistOut } from '@/types/api'
import ArtistCard from './ArtistCard'

interface ArtistGridProps {
  artists: ArtistOut[]
}

export default function ArtistGrid({ artists }: ArtistGridProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4 p-4">
      {artists.map((artist) => (
        <ArtistCard key={artist.id} artist={artist} />
      ))}
    </div>
  )
}
