import { useState } from 'react'
import {
  useAlbums,
  useApplyAlbumCover,
  useSearchAlbumCoverCandidates,
} from '@/api/hooks/useAlbums'
import AlbumGrid from '@/components/library/AlbumGrid'
import SortSelector from '@/components/library/SortSelector'
import type { AlbumOut, TrackCoverCandidate } from '@/types/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const SORT_FIELDS = [
  { value: 'title', label: '名称' },
  { value: 'artist', label: '艺术家' },
  { value: 'year', label: '年份' },
  { value: 'total_tracks', label: '曲目数' },
]

export default function AlbumsPage() {
  const [sortField, setSortField] = useState('title')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [coverSearchOpen, setCoverSearchOpen] = useState(false)
  const [coverCandidatesOpen, setCoverCandidatesOpen] = useState(false)
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumOut | null>(null)
  const [coverTitle, setCoverTitle] = useState('')
  const [coverArtist, setCoverArtist] = useState('')
  const [coverCandidates, setCoverCandidates] = useState<TrackCoverCandidate[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const { data: albums, isLoading } = useAlbums({ sort: sortField, order: sortOrder })
  const searchAlbumCoverCandidates = useSearchAlbumCoverCandidates()
  const applyAlbumCover = useApplyAlbumCover()

  const openCoverSearch = (album: AlbumOut) => {
    setSelectedAlbum(album)
    setCoverTitle(album.title)
    setCoverArtist(album.artist?.name ?? '')
    setCoverCandidates([])
    setFeedback(null)
    setCoverSearchOpen(true)
  }

  const searchCoverCandidates = async () => {
    if (!selectedAlbum || !coverTitle.trim()) return
    setFeedback('正在搜索封面...')
    try {
      const result = await searchAlbumCoverCandidates.mutateAsync({
        id: selectedAlbum.id,
        payload: {
          title: coverTitle.trim(),
          artist: coverArtist.trim() || undefined,
          limit: 8,
        },
      })
      if (result.length === 0) {
        setFeedback('未找到候选封面，请换个关键词试试')
        return
      }
      setCoverCandidates(result)
      setCoverSearchOpen(false)
      setCoverCandidatesOpen(true)
      setFeedback(null)
    } catch {
      setFeedback('搜索封面失败，请稍后重试')
    }
  }

  const applyCoverCandidate = async (candidate: TrackCoverCandidate) => {
    if (!selectedAlbum) return
    setFeedback('正在应用封面...')
    try {
      await applyAlbumCover.mutateAsync({
        id: selectedAlbum.id,
        payload: {
          image_url: candidate.image_url,
          album_title: candidate.album_title,
          artist_name: candidate.artist_name,
        },
      })
      setCoverCandidatesOpen(false)
      setSelectedAlbum(null)
      setFeedback(null)
    } catch {
      setFeedback('应用封面失败，请稍后重试')
    }
  }

  return (
    <div>
      <div className="px-4 pt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          专辑{albums ? ` · ${albums.length} 张专辑` : ''}
        </h1>
        <SortSelector
          sortField={sortField}
          sortOrder={sortOrder}
          fieldOptions={SORT_FIELDS}
          onFieldChange={setSortField}
          onOrderChange={setSortOrder}
        />
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          加载中...
        </div>
      ) : albums && albums.length > 0 ? (
        <AlbumGrid albums={albums} onSearchCover={openCoverSearch} />
      ) : (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          暂无专辑
        </div>
      )}

      <Dialog open={coverSearchOpen} onOpenChange={setCoverSearchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>搜索专辑封面</DialogTitle>
            <DialogDescription>
              调整专辑名或歌手名后搜索候选封面。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">专辑</label>
              <input
                value={coverTitle}
                onChange={(event) => setCoverTitle(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">歌手</label>
              <input
                value={coverArtist}
                onChange={(event) => setCoverArtist(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
          </div>
          <DialogFooter>
            <button
              onClick={() => setCoverSearchOpen(false)}
              className="rounded-md border border-input px-3 py-2 text-sm"
            >
              取消
            </button>
            <button
              onClick={searchCoverCandidates}
              disabled={!coverTitle.trim() || searchAlbumCoverCandidates.isPending}
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-60"
            >
              搜索
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={coverCandidatesOpen} onOpenChange={setCoverCandidatesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>选择封面</DialogTitle>
            <DialogDescription>
              找到 {coverCandidates.length} 个候选，点击封面应用到专辑。
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
            {coverCandidates.map((candidate) => (
              <button
                key={candidate.image_url}
                onClick={() => applyCoverCandidate(candidate)}
                disabled={applyAlbumCover.isPending}
                className="min-w-0 rounded-md border bg-card p-2 text-left transition-colors hover:bg-accent disabled:opacity-60"
              >
                <img
                  src={candidate.thumbnail_url || candidate.image_url}
                  alt={candidate.album_title || '封面候选'}
                  className="aspect-square w-full rounded object-cover"
                />
                <p className="mt-2 truncate text-xs font-medium">
                  {candidate.album_title || '未知专辑'}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {candidate.artist_name || '未知歌手'}
                </p>
              </button>
            ))}
          </div>
          {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
          <DialogFooter>
            <button
              onClick={() => setCoverCandidatesOpen(false)}
              className="rounded-md border border-input px-3 py-2 text-sm"
            >
              取消
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
