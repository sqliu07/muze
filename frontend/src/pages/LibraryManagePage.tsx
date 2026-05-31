import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { FETCH_STATUS_POLL_INTERVAL } from '@/config/app'
import { Plus, FolderOpen, Trash2, RefreshCw, Image } from 'lucide-react'
import {
  getFolders,
  addFoldersBatch,
  removeFolder,
  scanLibrary,
  refreshLibrary,
  clearLibrary,
  fetchArtistImages,
  getArtistImageFetchStatus,
} from '@/api/client'
import type { WatchFolderOut, ScanResult, ArtistImageFetchStatus } from '@/types/api'
import { DirectoryPicker } from '@/components/common/DirectoryPicker'

export default function LibraryManagePage() {
  const queryClient = useQueryClient()
  const [folders, setFolders] = useState<WatchFolderOut[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [fetchingImages, setFetchingImages] = useState(false)
  const [fetchStatus, setFetchStatus] = useState<ArtistImageFetchStatus | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // 初始化：加载文件夹 + 建立 WebSocket
  useEffect(() => {
    loadFolders()
    loadFetchStatus()

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'file_added' || msg.type === 'file_removed') {
          queryClient.invalidateQueries()
        }
      } catch {
        // 忽略非 JSON 消息
      }
    }

    // 定期刷新获取状态
    const statusInterval = setInterval(loadFetchStatus, FETCH_STATUS_POLL_INTERVAL)

    return () => {
      ws.close()
      clearInterval(statusInterval)
    }
  }, [queryClient])

  async function loadFolders() {
    const data = await getFolders()
    setFolders(data)
  }

  function invalidateLibrary() {
    queryClient.invalidateQueries()
  }

  async function handlePickerConfirm(paths: string[]) {
    if (paths.length === 0) return
    await addFoldersBatch(paths)
    await loadFolders()
    // 批量扫描每个新添加的路径
    for (const path of paths) {
      await handleScan(path)
    }
  }

  async function handleScan(path: string) {
    setScanning(true)
    setResult(null)
    try {
      const res = await scanLibrary(path)
      setResult(res)
      invalidateLibrary()
    } finally {
      setScanning(false)
    }
  }

  async function handleRefreshAll() {
    setScanning(true)
    setResult(null)
    try {
      const res = await refreshLibrary()
      setResult(res)
      invalidateLibrary()
    } finally {
      setScanning(false)
    }
  }

  async function handleClear() {
    if (!confirm('确定要清空整个曲库吗？此操作不可撤销。')) return
    await clearLibrary()
    await loadFolders()
    setResult(null)
    invalidateLibrary()
  }

  async function handleRemove(id: number) {
    await removeFolder(id)
    await loadFolders()
  }

  async function handleFetchArtistImages() {
    setFetchingImages(true)
    try {
      await fetchArtistImages()
      await loadFetchStatus()
    } finally {
      setFetchingImages(false)
    }
  }

  async function loadFetchStatus() {
    try {
      const status = await getArtistImageFetchStatus()
      setFetchStatus(status)
    } catch {
      // 忽略错误
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h2 className="text-xl font-bold">媒体库管理</h2>

      {/* 添加文件夹 */}
      <Button onClick={() => setPickerOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        添加文件夹
      </Button>

      <DirectoryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handlePickerConfirm}
      />

      {/* 文件夹列表 */}
      <div className="space-y-2">
        {folders.map((folder) => (
          <div
            key={folder.id}
            className="flex items-center gap-3 rounded-md border px-4 py-3"
          >
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 font-mono text-xs">{folder.path}</span>
            {folder.last_scanned && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(folder.last_scanned).toLocaleString()}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                handleRemove(folder.id)
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {folders.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            尚未添加任何监听目录
          </p>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleRefreshAll} disabled={scanning}>
          <RefreshCw className={`mr-1 h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? '扫描中...' : '刷新全部'}
        </Button>
        <Button
          variant="outline"
          onClick={handleFetchArtistImages}
          disabled={fetchingImages || fetchStatus?.running}
        >
          <Image className={`mr-1 h-4 w-4 ${fetchingImages || fetchStatus?.running ? 'animate-pulse' : ''}`} />
          {fetchingImages || fetchStatus?.running ? '获取歌手照片中...' : '获取歌手照片'}
        </Button>
        <Button variant="destructive" onClick={handleClear}>
          清空曲库
        </Button>
      </div>

      {/* 歌手照片获取状态 */}
      {fetchStatus && fetchStatus.running && (
        <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <Image className="h-4 w-4 animate-pulse" />
            <span>
              正在获取歌手照片：{fetchStatus.current_artist || '处理中...'}
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${(fetchStatus.processed / fetchStatus.total) * 100}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {fetchStatus.processed}/{fetchStatus.total} 已处理
            （成功 {fetchStatus.success}，失败 {fetchStatus.failed}）
          </div>
        </div>
      )}

      {fetchStatus && !fetchStatus.running && fetchStatus.total > 0 && (
        <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            <span>
              歌手照片获取完成：成功 {fetchStatus.success}，失败 {fetchStatus.failed}
            </span>
          </div>
        </div>
      )}

      {/* 扫描结果 */}
      {result && (
        <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">
          新增 {result.added} 首，更新 {result.updated} 首，错误 {result.errors} 个
        </div>
      )}
    </div>
  )
}
