import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { FETCH_STATUS_POLL_INTERVAL } from '@/config/app'
import { Plus, FolderOpen, Trash2, RefreshCw, Image, ShieldCheck, Square } from 'lucide-react'
import { DirectoryPicker } from '@/components/common/DirectoryPicker'
import { LibrarySourceSelector } from '@/components/library/LibrarySourceSelector'
import { getLibraryWebSocketUrl, requestLibrary, openLocalPermissionSettings } from '@/platform/library'
import { useLibrarySource } from '@/platform/useLibrarySource'
import type { LibraryPermission, LibraryScanProgress } from '@/platform/contracts/library'
import type { WatchFolderOut, ScanResult } from '@/types/api'
import type { ArtistImageFetchStatus } from '@/api/client'

export default function LibraryManagePage() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  const sourceId = source.id
  const local = source.kind === 'local'
  const android = source.platform === 'android'
  const sourceRef = useRef(sourceId)
  sourceRef.current = sourceId
  const [folders, setFolders] = useState<WatchFolderOut[]>([])
  const [permission, setPermission] = useState<LibraryPermission | null>(null)
  const [progress, setProgress] = useState<LibraryScanProgress | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [fetchingImages, setFetchingImages] = useState(false)
  const [fetchStatus, setFetchStatus] = useState<ArtistImageFetchStatus | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setFolders([])
    setPermission(null)
    setProgress(null)
    setResult(null)
    setFetchStatus(null)
    setError('')
    setScanning(false)
    setPickerOpen(false)
    async function load() {
      try {
        if (local) {
          const access = await requestLibrary<LibraryPermission>('GET', '/library/permission', undefined, undefined, sourceId)
          if (!cancelled) setPermission(access)
        }
        if (!android) {
          const next = await requestLibrary<WatchFolderOut[]>('GET', '/library/folders', undefined, undefined, sourceId)
          if (!cancelled) setFolders(next)
        }
      } catch {
        if (!cancelled) setError(local ? '无法读取本地音乐库，请检查媒体权限。' : '无法读取服务器曲库，请检查连接。')
      }
    }
    async function loadStatus() {
      try {
        if (local) {
          const next = await requestLibrary<LibraryScanProgress>('GET', '/library/progress', undefined, undefined, sourceId)
          if (!cancelled) setProgress(next)
        } else {
          const next = await requestLibrary<ArtistImageFetchStatus>('GET', '/artists/fetch-status', undefined, undefined, sourceId)
          if (!cancelled) setFetchStatus(next)
        }
      } catch { /* Optional progress endpoints never prevent library browsing. */ }
    }
    void load()
    void loadStatus()
    const timer = setInterval(loadStatus, local ? 750 : FETCH_STATUS_POLL_INTERVAL)
    const wsUrl = getLibraryWebSocketUrl()
    const ws = wsUrl ? new WebSocket(wsUrl) : null
    if (ws) {
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'file_added' || message.type === 'file_removed') {
            void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(sourceId) })
          }
        } catch { /* Ignore non-JSON events. */ }
      }
    }
    return () => { cancelled = true; ws?.close(); clearInterval(timer) }
  }, [sourceId, local, android, queryClient])

  async function loadFolders() {
    if (android) return
    const next = await requestLibrary<WatchFolderOut[]>('GET', '/library/folders', undefined, undefined, sourceId)
    if (sourceRef.current === sourceId) setFolders(next)
  }

  async function runScan(path?: string, pick = false) {
    setScanning(true)
    setResult(null)
    setError('')
    try {
      const route = pick ? '/library/pick' : path ? '/library/scan' : '/library/refresh'
      const next = await requestLibrary<ScanResult>('POST', route, undefined, path ? { path } : undefined, sourceId)
      if (sourceRef.current === sourceId) {
        setResult(next)
        await loadFolders()
      }
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(sourceId) })
    } catch {
      if (sourceRef.current === sourceId) setError('扫描未完成，请检查媒体权限后重试。已有曲库仍然可用。')
    } finally {
      if (sourceRef.current === sourceId) setScanning(false)
    }
  }

  async function handlePickerConfirm(paths: string[]) {
    if (!paths.length) return
    setError('')
    try {
      await requestLibrary('POST', '/library/folders/batch', undefined, { paths }, sourceId)
      await loadFolders()
      for (const path of paths) await runScan(path)
    } catch { setError('无法添加音乐目录，请检查服务器目录权限。') }
  }

  async function grantPermission(checkOnly = false) {
    setError('')
    try {
      const next = await requestLibrary<LibraryPermission>(checkOnly ? 'GET' : 'POST', '/library/permission', undefined, undefined, sourceId)
      if (sourceRef.current !== sourceId) return
      setPermission(next)
      if (next.status === 'granted' || next.status === 'limited') await runScan()
    } catch { setError('无法申请媒体权限，请在系统设置中允许 Muze 读取音乐。') }
  }

  async function handleClear() {
    if (!confirm('清空曲库索引和歌单？音乐文件不会被删除。')) return
    try {
      await requestLibrary('DELETE', '/library/clear', undefined, undefined, sourceId)
      await loadFolders()
      setResult(null)
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(sourceId) })
    } catch { setError('未能清空曲库，请重试。') }
  }

  async function handleRemove(id: number) {
    try {
      await requestLibrary('DELETE', `/library/folders/${id}`, undefined, undefined, sourceId)
      await loadFolders()
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(sourceId) })
    } catch { setError('未能移除目录授权，请重试。') }
  }

  async function handleFetchArtistImages() {
    setFetchingImages(true)
    try {
      await requestLibrary('POST', '/artists/batch-fetch-images', undefined, undefined, sourceId)
      const next = await requestLibrary<ArtistImageFetchStatus>('GET', '/artists/fetch-status', undefined, undefined, sourceId)
      if (sourceRef.current === sourceId) setFetchStatus(next)
    } catch { setError('无法获取歌手照片，请稍后重试。') }
    finally { setFetchingImages(false) }
  }

  const permissionGranted = permission?.status === 'granted' || permission?.status === 'limited'
  const scanBusy = scanning || progress?.running

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h2 className="text-xl font-bold">媒体库管理</h2>
      <LibrarySourceSelector />
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}

      {local && (
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">{android ? '手机上的音乐' : '电脑上的音乐'}</h3>
          <p className="text-sm text-muted-foreground">
            {android ? '读取设备音频并建立本地曲库，播放时无需服务器或网络。' : '选择音乐目录后即可离线浏览和播放，授权仅限你选择的目录。'}
            音乐文件不会被移动、修改或删除。
          </p>
          {android && !permissionGranted && (
            <div className="space-y-2">
              <p className="text-sm">{permission?.status === 'denied' ? '尚未获得音乐读取权限。' : '需要允许 Muze 读取设备音乐。'}</p>
              {permission?.can_request === false ? (
                <>
                  <p className="text-sm text-muted-foreground">请在系统设置 → 应用 → Muze → 权限中允许音乐和音频，然后返回重新检查。</p>
                  <Button className="h-11" onClick={() => openLocalPermissionSettings().catch(() => setError('请从系统设置中打开 Muze 的权限页面。'))}>打开系统设置</Button>
                  <Button variant="outline" className="h-11" onClick={() => grantPermission(true)}>重新检查权限</Button>
                </>
              ) : (
                <Button className="h-11" onClick={() => grantPermission()}><ShieldCheck className="mr-2 h-4 w-4" />允许读取音乐</Button>
              )}
            </div>
          )}
          {!android && <Button className="h-11" onClick={() => runScan(undefined, true)} disabled={scanBusy}><Plus className="mr-1 h-4 w-4" />选择音乐文件夹</Button>}
          {android && permissionGranted && <p className="text-sm text-muted-foreground">已获得音乐读取权限。没有看到新音乐时，点击下方刷新。</p>}
        </div>
      )}

      {!local && (
        <>
          <Button className="h-11" onClick={() => setPickerOpen(true)}><Plus className="mr-1 h-4 w-4" />添加文件夹</Button>
          <DirectoryPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onConfirm={handlePickerConfirm} />
        </>
      )}

      {!android && (
        <div className="space-y-2">
          {folders.map((folder) => (
            <div key={folder.id} className="flex min-w-0 items-center gap-3 rounded-md border px-3 py-2">
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <span className="block break-words text-sm">{local ? folder.name || '已授权音乐目录' : folder.path}</span>
                {folder.last_scanned && <span className="text-xs text-muted-foreground">{new Date(folder.last_scanned).toLocaleString()}</span>}
              </div>
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground" aria-label="移除目录" onClick={() => handleRemove(folder.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {!folders.length && <p className="py-4 text-center text-sm text-muted-foreground">{local ? '选择目录后，音乐会出现在曲库中。' : '尚未添加任何监听目录'}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11" onClick={() => runScan()} disabled={scanBusy || (android && !permissionGranted)}>
          <RefreshCw className={`mr-1 h-4 w-4 ${scanBusy ? 'animate-spin' : ''}`} />{scanBusy ? '扫描中…' : '刷新曲库'}
        </Button>
        {local && scanBusy && <Button variant="outline" className="h-11" onClick={() => requestLibrary('POST', '/library/cancel', undefined, undefined, sourceId).catch(() => setError('未能取消扫描，请稍后重试。'))}><Square className="mr-1 h-4 w-4" />取消扫描</Button>}
        {!local && <Button variant="outline" className="h-11" onClick={handleFetchArtistImages} disabled={fetchingImages || fetchStatus?.running}><Image className="mr-1 h-4 w-4" />{fetchingImages || fetchStatus?.running ? '获取歌手照片中…' : '获取歌手照片'}</Button>}
        <Button variant="destructive" className="h-11" onClick={handleClear} disabled={scanBusy}>清空曲库索引</Button>
      </div>

      {progress?.running && (
        <div className="space-y-2 rounded-md border p-3 text-sm" role="status">
          <p>正在索引音乐：{progress.processed}{progress.total ? ` / ${progress.total}` : ''}</p>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${progress.total ? Math.min(100, progress.processed / progress.total * 100) : 0}%` }} /></div>
          <p className="text-xs text-muted-foreground">新增 {progress.added}，更新 {progress.updated}，跳过 {progress.errors}</p>
        </div>
      )}
      {fetchStatus && (fetchStatus.running || fetchStatus.total > 0) && (
        <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">
          <p>{fetchStatus.running ? `正在获取歌手照片：${fetchStatus.current_artist || '处理中…'}` : '歌手照片获取完成'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{fetchStatus.processed}/{fetchStatus.total}，成功 {fetchStatus.success}，失败 {fetchStatus.failed}</p>
        </div>
      )}
      {result && <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm" role="status">新增 {result.added} 首，更新 {result.updated} 首，跳过 {result.errors} 个</div>}
    </div>
  )
}
