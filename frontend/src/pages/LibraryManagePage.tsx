import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Plus, FolderOpen, Trash2, RefreshCw } from 'lucide-react'
import {
  getFolders,
  addFoldersBatch,
  removeFolder,
  scanLibrary,
  refreshLibrary,
  clearLibrary,
} from '@/api/client'
import type { WatchFolderOut, ScanResult } from '@/types/api'
import { DirectoryPicker } from '@/components/common/DirectoryPicker'

export default function LibraryManagePage() {
  const queryClient = useQueryClient()
  const [folders, setFolders] = useState<WatchFolderOut[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // 初始化：加载文件夹 + 建立 WebSocket
  useEffect(() => {
    loadFolders()

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

    return () => {
      ws.close()
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
        <Button variant="destructive" onClick={handleClear}>
          清空曲库
        </Button>
      </div>

      {/* 扫描结果 */}
      {result && (
        <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm">
          新增 {result.added} 首，更新 {result.updated} 首，错误 {result.errors} 个
        </div>
      )}
    </div>
  )
}
