import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { usePlaylists, useCreatePlaylist, useDeletePlaylist } from '@/api/hooks/usePlaylists'

export default function PlaylistsPage() {
  const navigate = useNavigate()
  const { data: playlists, isLoading } = usePlaylists()
  const createPlaylist = useCreatePlaylist()
  const deletePlaylist = useDeletePlaylist()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    createPlaylist.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setOpen(false)
          setName('')
        },
      }
    )
  }

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    deletePlaylist.mutate(id)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">播放列表</h1>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          新建
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">加载中...</p>}

      {!isLoading && playlists?.length === 0 && (
        <p className="text-muted-foreground">暂无播放列表</p>
      )}

      <div className="space-y-1">
        {playlists?.map((pl) => (
          <div
            key={pl.id}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted cursor-pointer group"
            onClick={() => navigate(`/playlists/${pl.id}`)}
          >
            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-lg shrink-0">
              ♬
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{pl.name}</p>
              <p className="text-sm text-muted-foreground">{pl.track_count} 首曲目</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive shrink-0"
              onClick={(e) => handleDelete(e, pl.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建播放列表</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="播放列表名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
