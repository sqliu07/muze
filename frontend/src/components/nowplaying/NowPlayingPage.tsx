import { useState, useRef, useCallback, useEffect } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import BassBlobs from "@/components/prototype/BassBlobs"
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  MoreHorizontal,
} from "lucide-react"
import { usePlayerStore, currentTrackSelector } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import { useLyrics, useSearchLyrics, useRestoreLyrics, useSaveLyrics, useSearchLddcCandidates } from "@/api/hooks/useLyrics"
import { useToggleFavorite } from "@/api/hooks/useFavorites"
import { usePlaylists, useAddTracksToPlaylist } from "@/api/hooks/usePlaylists"
import { seekAudio } from "@/hooks/useAudio"
import { getTrackCoverUrl } from "@/api/client"
import type { LyricsCandidate } from "@/types/api"
import { useColorThief } from "@/hooks/useColorThief"
import CoverArt from "./CoverArt"
import LyricsView from "./LyricsView"
import { formatDuration } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface SeekBarProps {
  duration: number
  className?: string
}

function SeekBar({ duration, className }: SeekBarProps) {
  const currentTime = usePlayerStore((s) => s.currentTime)
  const [dragging, setDragging] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)
  const durationRef = useRef(duration)
  durationRef.current = duration

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const bar = e.currentTarget
      e.preventDefault()
      setDragging(true)

      const ratio = (clientX: number) => {
        const rect = bar.getBoundingClientRect()
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      }

      setDragProgress(ratio(e.clientX) * 100)

      const onMove = (ev: PointerEvent) => {
        setDragProgress(ratio(ev.clientX) * 100)
      }
      const onUp = (ev: PointerEvent) => {
        // pointercancel 时 clientX 可能无效，仅在 pointerup 时执行 seek
        if (ev.type === "pointerup") {
          seekAudio(ratio(ev.clientX) * durationRef.current)
        }
        setDragging(false)
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onUp)
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onUp)
    },
    []
  )

  const displayProgress = dragging
    ? dragProgress
    : duration > 0
      ? (currentTime / duration) * 100
      : 0

  return (
    <div className={className}>
      <div
        className="relative w-full cursor-pointer rounded-full py-2"
        onPointerDown={onPointerDown}
      >
        <div className={`h-1 w-full rounded-full bg-white/20 transition-all ${dragging ? "!h-1.5" : ""}`}>
          <div
            className="h-full rounded-full bg-white/60"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-white/40">
        <span>
          {formatDuration(
            dragging ? (dragProgress / 100) * duration : currentTime
          )}
        </span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  )
}

function NowPlayingPage() {
  const nowPlayingOpen = useUIStore((s) => s.nowPlayingOpen)
  const setNowPlayingOpen = useUIStore((s) => s.setNowPlayingOpen)
  const currentTrack = usePlayerStore(currentTrackSelector)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrev = usePlayerStore((s) => s.playPrev)
  const toggleCurrentTrackFavorite = usePlayerStore((s) => s.toggleCurrentTrackFavorite)
  const duration = currentTrack?.duration ?? 0

  const [lyricsVisible, setLyricsVisible] = useState(true)
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false)
  const [searchChoiceDialogOpen, setSearchChoiceDialogOpen] = useState(false)
  const [searchChoiceDetail, setSearchChoiceDetail] = useState<{
    message: string
    source?: string
    synced?: boolean
    preview?: string
  } | null>(null)
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const [customSearchOpen, setCustomSearchOpen] = useState(false)
  const [customTitle, setCustomTitle] = useState("")
  const [customArtist, setCustomArtist] = useState("")
  const [candidatesOpen, setCandidatesOpen] = useState(false)
  const [candidates, setCandidates] = useState<LyricsCandidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const searchLddcMutation = useSearchLddcCandidates()

  const { data: lyrics } = useLyrics(currentTrack?.id ?? 0)
  const { data: playlists } = usePlaylists()
  const searchLyricsMutation = useSearchLyrics()
  const addTracksToPlaylist = useAddTracksToPlaylist()
  const toggleFavorite = useToggleFavorite()
  const restoreLyricsMutation = useRestoreLyrics()
  const saveLyricsMutation = useSaveLyrics()
  const [manualLyricsOpen, setManualLyricsOpen] = useState(false)
  const [manualLyricsText, setManualLyricsText] = useState("")

  const coverUrl = currentTrack?.has_cover ? getTrackCoverUrl(currentTrack.id) : null
  const colors = useColorThief(coverUrl)

  const hasSearchedOnline = Boolean(
    lyrics?.source &&
    !["embedded", "lrc", "manual"].includes(lyrics.source)
  )

  const toggleLyrics = () => setLyricsVisible((v) => !v)

  const setTransientFeedback = useCallback((message: string, timeoutMs = 2600) => {
    setSearchFeedback(message)
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = null
    }
    if (timeoutMs > 0) {
      feedbackTimerRef.current = window.setTimeout(() => {
        setSearchFeedback(null)
        feedbackTimerRef.current = null
      }, timeoutMs)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping = !!target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
      if (isTyping) return

      if (e.code === "Space") {
        e.preventDefault()
        setPlaying(!isPlaying)
        return
      }

      if (!currentTrack) return

      if (e.code === "ArrowRight") {
        e.preventDefault()
        const t = Math.min(currentTrack.duration, usePlayerStore.getState().currentTime + 5)
        seekAudio(t)
        return
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault()
        const t = Math.max(0, usePlayerStore.getState().currentTime - 5)
        seekAudio(t)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [currentTrack, isPlaying, setPlaying])

  const searchOnlineLyrics = useCallback((options?: { refresh?: boolean; allowUnsynced?: boolean }) => {
    if (!currentTrack) return
    setTransientFeedback("正在联网搜词...", 0)
    searchLyricsMutation
      .mutateAsync({
        trackId: currentTrack.id,
        payload: {
          title: currentTrack.title,
          artist: currentTrack.artist?.name,
        },
        options,
      })
      .then(() => {
        setSearchChoiceDialogOpen(false)
        setTransientFeedback("已应用逐字歌词")
      })
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { status?: number; data?: { detail?: { message?: string; source?: string; synced?: boolean; preview?: string } | string } } })
            ?.response?.data?.detail
        const status =
          (err as { response?: { status?: number } })?.response?.status
        if (status === 409 && msg && typeof msg === "object") {
          setSearchChoiceDetail({
            message: msg.message || "找到歌词，但结果不确定。",
            source: msg.source,
            synced: msg.synced,
            preview: msg.preview,
          })
          setSearchChoiceDialogOpen(true)
          setTransientFeedback(msg.message || "找到歌词，待你选择。")
          return
        }
        if (typeof msg === "string") {
          setTransientFeedback(msg)
          return
        }
        if (msg && typeof msg === "object" && "message" in msg && typeof msg.message === "string") {
          setTransientFeedback(msg.message)
          return
        }
        setTransientFeedback("搜词失败，请稍后重试。")
      })
  }, [currentTrack, searchLyricsMutation, setTransientFeedback])

  const restoreOriginal = useCallback(async () => {
    if (!currentTrack) return
    try {
      await restoreLyricsMutation.mutateAsync(currentTrack.id)
      setTransientFeedback("已恢复原始歌词")
    } catch {
      setTransientFeedback("没有可恢复的原始歌词")
    }
  }, [currentTrack, restoreLyricsMutation, setTransientFeedback])

  const saveManualLyrics = useCallback(async () => {
    if (!currentTrack || !manualLyricsText.trim()) return
    try {
      await saveLyricsMutation.mutateAsync({
        trackId: currentTrack.id,
        payload: { content: manualLyricsText.trim() },
      })
      setManualLyricsOpen(false)
      setManualLyricsText("")
      setTransientFeedback("已保存手动歌词")
    } catch {
      setTransientFeedback("保存失败，请重试")
    }
  }, [currentTrack, manualLyricsText, saveLyricsMutation, setTransientFeedback])

  const canRestoreOriginal = Boolean(
    lyrics?.original_content &&
    lyrics?.source &&
    !["embedded", "lrc"].includes(lyrics.source)
  )

  const addCurrentTrackToPlaylist = useCallback(async (playlistId: number) => {
    if (!currentTrack) return
    try {
      await addTracksToPlaylist.mutateAsync({
        id: playlistId,
        trackIds: [currentTrack.id],
      })
      setTransientFeedback("已添加到播放列表")
      setPlaylistDialogOpen(false)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: { message?: string } | string } } })
          ?.response?.data?.detail
      if (typeof msg === "string") {
        setTransientFeedback(msg)
      } else if (msg && typeof msg === "object" && "message" in msg && typeof msg.message === "string") {
        setTransientFeedback(msg.message)
      } else {
        setTransientFeedback("添加失败，请稍后重试。")
      }
    }
  }, [addTracksToPlaylist, currentTrack, setTransientFeedback])

  const MoreActions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="text-white/70 transition-colors hover:text-white">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[12rem] border-white/15 bg-black/60 text-white backdrop-blur-md"
      >
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={() => searchOnlineLyrics(hasSearchedOnline ? { refresh: true } : undefined)}
          disabled={!currentTrack || searchLyricsMutation.isPending}
          className="focus:bg-white/10 focus:text-white"
        >
          {searchLyricsMutation.isPending
            ? "搜词中..."
            : hasSearchedOnline
              ? "已搜索（点击重搜）"
              : "联网搜词"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={() => {
            setCustomTitle(currentTrack?.title ?? "")
            setCustomArtist(currentTrack?.artist?.name ?? "")
            setCustomSearchOpen(true)
          }}
          disabled={!currentTrack}
          className="focus:bg-white/10 focus:text-white"
        >
          指定搜索
        </DropdownMenuItem>
        {canRestoreOriginal && (
          <DropdownMenuItem
            onSelect={(e) => e.preventDefault()}
            onClick={restoreOriginal}
            disabled={restoreLyricsMutation.isPending}
            className="focus:bg-white/10 focus:text-white"
          >
            恢复原词
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={() => setManualLyricsOpen(true)}
          className="focus:bg-white/10 focus:text-white"
        >
          手动粘贴歌词
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={() => setPlaylistDialogOpen(true)}
          disabled={!currentTrack}
          className="focus:bg-white/10 focus:text-white"
        >
          添加到播放列表
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <AnimatePresence>
      {nowPlayingOpen && (
        <motion.div
          key="now-playing"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden"
        >
          {/* L0: 专辑取色底色 */}
          <div
            className="pointer-events-none absolute inset-0 transition-colors duration-700"
            style={{ backgroundColor: `rgb(${colors[0][0]}, ${colors[0][1]}, ${colors[0][2]})` }}
          />

          {/* L1: BassBlobs — 音频驱动的有机色块背景 */}
          <BassBlobs colors={colors} />

          {/* L2: 底部渐变 — 用主色替代黑色 */}
          <div
            className={`pointer-events-none absolute bottom-0 left-0 right-0 h-[50%] ${
              prefersReducedMotion ? "" : "animate-gradient-breathe"
            }`}
            style={{
              background: `linear-gradient(to top, rgba(${colors[0][0]}, ${colors[0][1]}, ${colors[0][2]}, 0.7) 0%, transparent 60%)`,
              willChange: "transform, opacity",
            }}
          />
          {/* 顶部栏 */}
          <div className="relative z-10 flex items-center px-4 py-3">
            <button
              onClick={() => setNowPlayingOpen(false)}
              className="rounded-full p-2 hover:bg-white/10"
            >
              <ChevronDown className="h-6 w-6 text-white" />
            </button>
            <div className="flex-1 text-center">
              <p className="text-sm font-medium text-white/50">正在播放</p>
              <p className="mt-0.5 text-[11px] text-white/65">
                {searchLyricsMutation.isPending ? "正在联网搜词..." : (searchFeedback ?? "\u00A0")}
              </p>
            </div>
            <div className="h-6 w-6" />
          </div>

          {/* 主内容 */}
          <div className="relative z-10 flex flex-1 overflow-hidden px-4 pb-2">
            {/* 桌面端布局 */}
            <div className="hidden w-full md:flex">
              {/* 左侧：封面 + 曲目信息 + 控制按钮 */}
              <div
                className={`flex flex-col items-center justify-center transition-all duration-500 ${
                  lyricsVisible ? "w-2/5" : "w-full"
                }`}
              >
                <CoverArt
                  track={currentTrack ?? null}
                  size={lyricsVisible ? 300 : 420}
                />
                <div className="mt-4 text-center">
                  <p className="text-lg font-bold text-white">
                    {currentTrack?.title ?? "未在播放"}
                  </p>
                  <div className="mt-1 flex items-center justify-center gap-2 text-sm text-white/50">
                    <span className="shrink-0">{currentTrack?.artist?.name ?? "未知艺术家"}</span>
                    {currentTrack?.album?.title ? (
                      <>
                        <span className="shrink-0 text-white/25">/</span>
                        <span className="min-w-0 truncate">{currentTrack.album.title}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* 进度条 */}
                <SeekBar duration={duration} className="mt-6 w-full max-w-sm px-6" />

                {/* 播放控制 + 红心/词 */}
                <div className="mt-3 flex w-full max-w-sm items-center justify-between px-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (!currentTrack) return
                        const wasFavorite = currentTrack.is_favorite
                        toggleCurrentTrackFavorite()
                        toggleFavorite.mutate({
                          trackId: currentTrack.id,
                          isFavorite: wasFavorite,
                        })
                      }}
                      className="transition-colors hover:text-white"
                    >
                      <Heart
                        className={`h-5 w-5 ${
                          currentTrack?.is_favorite
                            ? "fill-red-500 text-red-500"
                            : "text-white/70"
                        }`}
                      />
                    </button>
                    {MoreActions}
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => playPrev()}
                      className="text-white/70 transition-colors hover:text-white"
                    >
                      <SkipBack className="h-6 w-6" />
                    </button>
                    <button
                      onClick={() => setPlaying(!isPlaying)}
                      className="text-white/70 transition-colors hover:text-white"
                    >
                      {isPlaying ? (
                        <Pause className="h-6 w-6" />
                      ) : (
                        <Play className="h-6 w-6 ml-0.5" />
                      )}
                    </button>
                    <button
                      onClick={() => playNext()}
                      className="text-white/70 transition-colors hover:text-white"
                    >
                      <SkipForward className="h-6 w-6" />
                    </button>
                  </div>
                  <button
                    onClick={toggleLyrics}
                    className={`text-base font-bold transition-colors hover:text-white ${
                      lyricsVisible ? "text-white" : "text-white/30"
                    }`}
                  >
                    词
                  </button>
                </div>
              </div>

              {/* 右侧：歌词 */}
              {lyricsVisible && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex w-3/5 flex-col min-h-0"
                >
                  <LyricsView lyrics={lyrics ?? null} onSeek={seekAudio} trackId={currentTrack?.id} onFeedback={setTransientFeedback} />
                </motion.div>
              )}
            </div>

            {/* 移动端布局 */}
            <div className="flex w-full flex-col md:hidden">
              {/* 封面 */}
              <div
                className={`flex justify-center transition-all duration-500 ${
                  lyricsVisible ? "py-2" : "py-6 flex-1 items-center"
                }`}
              >
                <CoverArt
                  track={currentTrack ?? null}
                  size={lyricsVisible ? 160 : 260}
                />
              </div>

              {/* 移动端控制区 — 封面下方 */}
              <div className="flex flex-col items-center gap-2 px-6">
                <SeekBar duration={duration} className="w-full max-w-sm" />
                <div className="w-full max-w-sm text-center">
                  <p className="text-sm text-white/50">
                    <span>{currentTrack?.artist?.name ?? "未知艺术家"}</span>
                    {currentTrack?.album?.title ? (
                      <>
                        <span className="px-2 text-white/25">/</span>
                        <span>{currentTrack.album.title}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="mt-3 flex w-full max-w-sm items-center justify-between px-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (!currentTrack) return
                        const wasFavorite = currentTrack.is_favorite
                        toggleCurrentTrackFavorite()
                        toggleFavorite.mutate({
                          trackId: currentTrack.id,
                          isFavorite: wasFavorite,
                        })
                      }}
                      className="transition-colors hover:text-white"
                    >
                      <Heart
                        className={`h-5 w-5 ${
                          currentTrack?.is_favorite
                            ? "fill-red-500 text-red-500"
                            : "text-white/70"
                        }`}
                      />
                    </button>
                    {MoreActions}
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => playPrev()}
                      className="text-white/70 transition-colors hover:text-white"
                    >
                      <SkipBack className="h-6 w-6" />
                    </button>
                    <button
                      onClick={() => setPlaying(!isPlaying)}
                      className="text-white/70 transition-colors hover:text-white"
                    >
                      {isPlaying ? (
                        <Pause className="h-6 w-6" />
                      ) : (
                        <Play className="h-6 w-6 ml-0.5" />
                      )}
                    </button>
                    <button
                      onClick={() => playNext()}
                      className="text-white/70 transition-colors hover:text-white"
                    >
                      <SkipForward className="h-6 w-6" />
                    </button>
                  </div>
                  <button
                    onClick={toggleLyrics}
                    className={`text-base font-bold transition-colors hover:text-white ${
                      lyricsVisible ? "text-white" : "text-white/30"
                    }`}
                  >
                    词
                  </button>
                </div>
              </div>

              {/* 歌词 */}
              {lyricsVisible && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 min-h-0"
                >
                  <LyricsView lyrics={lyrics ?? null} onSeek={seekAudio} trackId={currentTrack?.id} onFeedback={setTransientFeedback} />
                </motion.div>
              )}
            </div>
          </div>

          <Dialog open={playlistDialogOpen} onOpenChange={setPlaylistDialogOpen}>
            <DialogContent className="border-white/15 bg-black/80 text-white backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle>添加到播放列表</DialogTitle>
                <DialogDescription className="text-white/60">
                  {currentTrack ? `为「${currentTrack.title}」选择一个播放列表` : "当前没有可添加的歌曲"}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {!playlists || playlists.length === 0 ? (
                  <p className="text-sm text-white/60">还没有播放列表，请先在“播放列表”页面创建。</p>
                ) : (
                  playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => addCurrentTrackToPlaylist(pl.id)}
                      disabled={!currentTrack || addTracksToPlaylist.isPending}
                      className="flex w-full items-center justify-between rounded-md border border-white/15 bg-white/5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 disabled:opacity-60"
                    >
                      <span className="truncate">{pl.name}</span>
                      <span className="ml-3 shrink-0 text-xs text-white/55">{pl.track_count} 首</span>
                    </button>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={searchChoiceDialogOpen} onOpenChange={setSearchChoiceDialogOpen}>
            <DialogContent className="border-white/15 bg-black/80 text-white backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle>搜词结果待确认</DialogTitle>
                <DialogDescription className="text-white/60">
                  {searchChoiceDetail?.message || "该结果可能不是逐字歌词。"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-white/55">
                  来源：{searchChoiceDetail?.source || "unknown"} · 同步：{searchChoiceDetail?.synced ? "是" : "否"}
                </p>
                {searchChoiceDetail?.preview ? (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-white/10 bg-white/5 p-3 text-sm leading-6 text-white/75 whitespace-pre-wrap">
                    {searchChoiceDetail.preview}
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <button
                  onClick={() => setSearchChoiceDialogOpen(false)}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={() => searchOnlineLyrics({ refresh: true })}
                  disabled={searchLyricsMutation.isPending}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/90 transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                  重新搜索
                </button>
                <button
                  onClick={() => searchOnlineLyrics({ refresh: true, allowUnsynced: true })}
                  disabled={searchLyricsMutation.isPending}
                  className="rounded-md bg-white px-3 py-2 text-sm text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                >
                  使用该结果
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 手动粘贴歌词弹窗 */}
          <Dialog open={manualLyricsOpen} onOpenChange={setManualLyricsOpen}>
            <DialogContent className="border-white/15 bg-black/80 text-white backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle>手动粘贴歌词</DialogTitle>
                <DialogDescription className="text-white/60">
                  支持纯文本或 LRC 格式（如 [00:12.34]歌词文本）
                </DialogDescription>
              </DialogHeader>
              <textarea
                value={manualLyricsText}
                onChange={(e) => setManualLyricsText(e.target.value)}
                placeholder={"[00:12.34]第一行歌词\n[00:15.67]第二行歌词"}
                className="h-60 w-full resize-none rounded-md border border-white/15 bg-white/5 p-3 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
              />
              <DialogFooter>
                <button
                  onClick={() => {
                    setManualLyricsOpen(false)
                    setManualLyricsText("")
                  }}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={saveManualLyrics}
                  disabled={!manualLyricsText.trim() || saveLyricsMutation.isPending}
                  className="rounded-md bg-white px-3 py-2 text-sm text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                >
                  保存
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 指定搜索弹窗 */}
          <Dialog open={customSearchOpen} onOpenChange={setCustomSearchOpen}>
            <DialogContent className="border-white/15 bg-black/80 text-white backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle>指定搜索歌词</DialogTitle>
                <DialogDescription className="text-white/60">
                  手动指定歌名和歌手进行搜索
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-white/50">歌名</label>
                  <input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
                    placeholder="歌曲名称"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-white/50">歌手</label>
                  <input
                    value={customArtist}
                    onChange={(e) => setCustomArtist(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
                    placeholder="歌手名称（可选）"
                  />
                </div>
              </div>
              <DialogFooter>
                <button
                  onClick={() => setCustomSearchOpen(false)}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (!customTitle.trim() || !currentTrack) return
                    setCustomSearchOpen(false)
                    setCandidatesLoading(true)
                    setTransientFeedback(`正在搜索「${customTitle.trim()}」...`, 0)
                    searchLddcMutation
                      .mutateAsync({
                        trackId: currentTrack.id,
                        payload: {
                          title: customTitle.trim(),
                          artist: customArtist.trim() || undefined,
                        },
                        limit: 8,
                      })
                      .then((result) => {
                        if (result.length === 0) {
                          setTransientFeedback("未找到匹配歌词，请换个关键词试试")
                          return
                        }
                        setCandidates(result)
                        setCandidatesOpen(true)
                        setTransientFeedback(`找到 ${result.length} 个候选，请选择`)
                      })
                      .catch(() => {
                        setTransientFeedback("搜索失败，请稍后重试")
                      })
                      .finally(() => setCandidatesLoading(false))
                  }}
                  disabled={!customTitle.trim() || candidatesLoading}
                  className="rounded-md bg-white px-3 py-2 text-sm text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                >
                  搜索
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* LDDC 候选歌词选择弹窗 */}
          <Dialog open={candidatesOpen} onOpenChange={setCandidatesOpen}>
            <DialogContent className="border-white/15 bg-black/80 text-white backdrop-blur-xl max-w-lg">
              <DialogHeader>
                <DialogTitle>选择歌词</DialogTitle>
                <DialogDescription className="text-white/60">
                  找到 {candidates.length} 个候选，点击选择要使用的歌词
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (!currentTrack) return
                      setCandidatesOpen(false)
                      saveLyricsMutation
                        .mutateAsync({
                          trackId: currentTrack.id,
                          payload: {
                            content: c.content,
                            source: c.source,
                            synced: c.synced,
                            translated_content: c.translated_content,
                          },
                        })
                        .then(() => setTransientFeedback("已应用所选歌词"))
                        .catch(() => setTransientFeedback("保存失败，请重试"))
                    }}
                    className="w-full rounded-md border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                  >
                    {(c.song_title || c.song_artist) && (
                      <p className="mb-1.5 text-sm font-medium text-white/80 truncate">
                        {c.song_title}{c.song_artist ? ` — ${c.song_artist}` : ""}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-white/10 px-1.5 py-0.5">{c.source}</span>
                      {c.word_level && (
                        <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-green-400">逐字</span>
                      )}
                      {c.synced && !c.word_level && (
                        <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-blue-400">逐行</span>
                      )}
                      {!c.synced && (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/50">纯文本</span>
                      )}
                      {/live|现场|演唱会/i.test(`${c.song_title} ${c.song_artist}`) && (
                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-400">LIVE</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-white/50 whitespace-pre-wrap line-clamp-4">{c.preview}</p>
                  </button>
                ))}
              </div>
              <DialogFooter>
                <button
                  onClick={() => setCandidatesOpen(false)}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                >
                  取消
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default NowPlayingPage
