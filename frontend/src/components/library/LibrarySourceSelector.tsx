import { useState } from 'react'
import { Server, Smartphone, Plus, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { addRemoteLibrarySource, getLibrarySources, RemoteLibraryProvider, selectLibrarySource } from '@/platform/library'
import { createRemoteSource } from '@/platform/sourceSettings'
import { useLibrarySource } from '@/platform/useLibrarySource'

export function LibrarySourceSelector({ compact = false }: { compact?: boolean }) {
  const source = useLibrarySource()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function connect(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    let candidate
    try { candidate = createRemoteSource(name, url) } catch (cause) {
      setError(cause instanceof Error ? cause.message : '服务器地址无效')
      return
    }
    setBusy(true)
    try {
      const response = await new RemoteLibraryProvider(candidate).request<{ items: unknown[]; total: number }>('GET', '/tracks', { limit: 1 })
      if (!Array.isArray(response.items) || typeof response.total !== 'number') throw new Error('invalid music service')
      const remote = addRemoteLibrarySource(name, url)
      selectLibrarySource(remote.id)
      setOpen(false)
      setUrl('')
      setName('')
    } catch {
      setError('无法连接 Muze 服务，请检查地址、网络和服务器状态。')
    } finally { setBusy(false) }
  }

  return (
    <div className={compact ? 'flex min-w-0 items-center gap-2' : 'space-y-2 rounded-lg border p-4'}>
      {!compact && <p className="text-sm font-medium">音乐来源</p>}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {source.kind === 'local' ? <Smartphone className="h-4 w-4 shrink-0" /> : <Server className="h-4 w-4 shrink-0" />}
        <select
          aria-label="音乐来源"
          value={source.id}
          onChange={(event) => selectLibrarySource(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
        >
          {getLibrarySources().map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <Button variant="outline" className="h-11 shrink-0" onClick={() => { setOpen(true); setError('') }} aria-label="连接 Muze 服务器">
          <Plus className="h-4 w-4" />
          {!compact && <span className="ml-1 hidden sm:inline">连接服务器</span>}
        </Button>
      </div>
      {!compact && <p className="text-xs text-muted-foreground">切换浏览的曲库时，当前播放和队列会继续保留。</p>}
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader><DialogTitle>连接 Muze 服务器</DialogTitle></DialogHeader>
          <form onSubmit={connect} className="space-y-4">
            <label className="block space-y-1 text-sm">
              <span>名称（可选）</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="家里的 NAS" autoComplete="off" className="h-11" />
            </label>
            <label className="block space-y-1 text-sm">
              <span>服务器地址</span>
              <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="http://192.168.5.2:8000" inputMode="url" autoComplete="url" required className="h-11" />
            </label>
            <p className="text-xs text-muted-foreground">使用局域网地址或 HTTPS 地址。连接后可以随时切回本地音乐。</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="h-11 w-full">
              {busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? '正在连接…' : '连接并切换'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
