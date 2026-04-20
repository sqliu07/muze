import { useState, useEffect, useCallback } from "react"
import { Folder, ChevronRight, Check, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { browseDirectories, type BrowseResult } from "@/api/client"

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (paths: string[]) => void
}

export function DirectoryPicker({ open, onClose, onConfirm }: Props) {
  const [currentPath, setCurrentPath] = useState("/")
  const [browseResult, setBrowseResult] = useState<BrowseResult | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const loadDir = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const result = await browseDirectories(path)
      setBrowseResult(result)
      setCurrentPath(result.path)
    } catch {
      // 加载失败时保持当前状态
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setSelected(new Set())
      loadDir("")
    }
  }, [open, loadDir])

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selected))
    onClose()
  }

  // 将路径拆分为面包屑段
  const pathSegments = currentPath.split("/").filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>选择音乐文件夹</DialogTitle>
        </DialogHeader>

        {/* 面包屑导航 */}
        <div className="flex items-center gap-1 text-sm overflow-x-auto py-1 border-b">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground"
            onClick={() => loadDir("/")}
          >
            /
          </Button>
          {pathSegments.map((seg, i) => {
            const segPath = "/" + pathSegments.slice(0, i + 1).join("/")
            return (
              <div key={segPath} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => loadDir(segPath)}
                >
                  {seg}
                </Button>
              </div>
            )
          })}
        </div>

        {/* 返回上级 + 目录列表 */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
          {browseResult?.parent && (
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md hover:bg-muted text-muted-foreground"
              onClick={() => loadDir(browseResult.parent!)}
            >
              <ArrowLeft className="h-4 w-4" />
              ..
            </button>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground p-4">加载中...</p>
          ) : browseResult?.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">此目录下没有子目录</p>
          ) : (
            browseResult?.entries.map((entry) => {
              const isSelected = selected.has(entry.path)
              return (
                <div
                  key={entry.path}
                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted"
                >
                  <button
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    }`}
                    onClick={() => toggleSelect(entry.path)}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </button>
                  <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                  <button
                    className="flex-1 text-left text-sm truncate"
                    onDoubleClick={() => loadDir(entry.path)}
                    onClick={() => toggleSelect(entry.path)}
                  >
                    {entry.name}
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* 已选数量 */}
        {selected.size > 0 && (
          <p className="text-xs text-muted-foreground">
            已选择 {selected.size} 个文件夹
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={selected.size === 0}>
            确认添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
