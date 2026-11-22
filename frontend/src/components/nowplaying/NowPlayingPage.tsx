import { useState, useReducer, useRef, useCallback, useEffect } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { SpectrumVisualizer } from "./SpectrumVisualizer"
import ArtworkBackdrop from "./ArtworkBackdrop"
import BackgroundDebugPanel from "./BackgroundDebugPanel"
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  MoreHorizontal,
  Repeat,
  Repeat1,
  Shuffle,
  ListMusic,
  X,
} from "lucide-react"
import { usePlayerStore, currentTrackSelector } from "@/store/playerStore"
import { useUIStore } from "@/store/uiStore"
import {
  useLyrics,
  useSearchLyrics,
  useRestoreLyrics,
  useSaveLyrics,
  useSearchLddcCandidates,
  useUpdateLyricsOffset,
} from "@/api/hooks/useLyrics"
import { useToggleFavorite } from "@/api/hooks/useFavorites"
import { usePlaylists, useAddTracksToPlaylist } from "@/api/hooks/usePlaylists"
import { useApplyTrackCover, useSearchTrackCover, useSearchTrackCoverCandidates } from "@/api/hooks/useTracks"
import { seekAudio } from "@/hooks/useAudio"
import { getTrackCoverUrl } from "@/api/client"
import type { LyricsCandidate, TrackCoverCandidate } from "@/types/api"
import { useColorThief } from "@/hooks/useColorThief"
import CoverArt from "./CoverArt"
import LyricsView from "./LyricsView"
import { formatDuration } from "@/lib/utils"
import { EqualizerControl } from "@/components/player/EqualizerControl"
import { getPlaybackCapabilities } from "@/platform/playback/runtime"
import { useLibrarySource } from "@/platform/useLibrarySource"
import { trackIdentity } from '@/platform/library'
import { isPlayerDismissSwipe, type SwipePoint } from '@/platform/navigation/mobileBack'
import { canHandlePlayerShortcut, createNowPlayingView, nowPlayingViewReducer } from '@/platform/navigation/nowPlayingView'
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
        role="slider"
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(currentTime)}
        tabIndex={0}
        className="relative flex h-11 w-full touch-none cursor-pointer items-center rounded-full md:h-auto md:py-2"
        onPointerDown={onPointerDown}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
          event.preventDefault()
          event.stopPropagation()
          seekAudio(Math.max(0, Math.min(duration, currentTime + (event.key === "ArrowRight" ? 5 : -5))))
        }}
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
  const playbackError = usePlayerStore((s) => s.playbackError)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrev = usePlayerStore((s) => s.playPrev)
  const toggleCurrentTrackFavorite = usePlayerStore((s) => s.toggleCurrentTrackFavorite)
  const queue = usePlayerStore((s) => s.queue)
  const currentQueueIndex = usePlayerStore((s) => s.currentIndex)
  const setQueue = usePlayerStore((s) => s.setQueue)
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue)
  const playMode = usePlayerStore((s) => s.playMode)
  const cyclePlayMode = usePlayerStore((s) => s.cyclePlayMode)
  const playbackCapabilities = getPlaybackCapabilities()
  const librarySource = useLibrarySource()
  const currentTrackSource = currentTrack?.source_id ?? "remote:same-origin"
  const canAddToSelectedPlaylist = currentTrackSource === librarySource.id
  const duration = currentTrack?.duration ?? 0

  const [{ lyricsVisible, queueOpen }, updateView] = useReducer(
    nowPlayingViewReducer,
    window.matchMedia('(max-width: 767px)').matches,
    createNowPlayingView,
  )
  const [spectrumVisible, setSpectrumVisible] = useState(false)
  const queueTriggerRef = useRef<HTMLButtonElement | null>(null)
  const headerSwipeStart = useRef<SwipePoint | null>(null)
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
  const [coverSearchOpen, setCoverSearchOpen] = useState(false)
  const [coverTitle, setCoverTitle] = useState("")
  const [coverArtist, setCoverArtist] = useState("")
  const [coverCandidatesOpen, setCoverCandidatesOpen] = useState(false)
  const [coverCandidates, setCoverCandidates] = useState<TrackCoverCandidate[]>([])
  const [coverCandidatesLoading, setCoverCandidatesLoading] = useState(false)
  const currentIdentity = currentTrack ? trackIdentity(currentTrack) : ''
  const currentIdentityRef = useRef(currentIdentity)
  currentIdentityRef.current = currentIdentity
  useEffect(() => {
    setCandidatesOpen(false)
    setCoverCandidatesOpen(false)
    setCustomSearchOpen(false)
    setCoverSearchOpen(false)
    setSearchChoiceDialogOpen(false)
    setManualLyricsOpen(false)
    setCandidates([])
    setCoverCandidates([])
  }, [currentIdentity])
  const searchLddcMutation = useSearchLddcCandidates()

  const { data: lyrics } = useLyrics(currentTrack?.id ?? 0, currentTrack?.source_id)
  const { data: playlists } = usePlaylists()
  const searchLyricsMutation = useSearchLyrics()
  const searchTrackCoverMutation = useSearchTrackCover()
  const searchTrackCoverCandidatesMutation = useSearchTrackCoverCandidates()
  const applyTrackCoverMutation = useApplyTrackCover()
  const addTracksToPlaylist = useAddTracksToPlaylist()
  const toggleFavorite = useToggleFavorite()
  const restoreLyricsMutation = useRestoreLyrics()
  const saveLyricsMutation = useSaveLyrics()
  const updateLyricsOffsetMutation = useUpdateLyricsOffset()
  const [manualLyricsOpen, setManualLyricsOpen] = useState(false)
  const [manualLyricsText, setManualLyricsText] = useState("")

  const coverUrl = currentTrack?.has_cover
    ? currentTrack.source_id === "local:android"
      ? currentTrack.cover_url ?? null
      : getTrackCoverUrl(currentTrack.id, currentTrack.album?.cover_path, currentTrack.source_id)
    : null
  const colors = useColorThief(coverUrl)

  const hasSearchedOnline = Boolean(
    lyrics?.source &&
    !["embedded", "lrc", "manual"].includes(lyrics.source)
  )

  const toggleLyrics = () => updateView({ type: 'toggle-lyrics' })
  const setQueueOpen = (open: boolean) => updateView({ type: 'queue-open-changed', open })

  useEffect(() => {
    if (!nowPlayingOpen) updateView({ type: 'queue-open-changed', open: false })
  }, [nowPlayingOpen])

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
      if (!canHandlePlayerShortcut(target, e.defaultPrevented)) return

      if (e.key === "Escape" && nowPlayingOpen) {
        setNowPlayingOpen(false)
        return
      }

      if (e.code === "Space") {
        if (target?.closest("button, a, [role='menuitem'], [role='slider']")) return
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
  }, [currentTrack, isPlaying, setPlaying, nowPlayingOpen, setNowPlayingOpen])

  const searchOnlineLyrics = useCallback((options?: { refresh?: boolean; allowUnsynced?: boolean }) => {
    if (!currentTrack) return
    setTransientFeedback("正在联网搜词...", 0)
    searchLyricsMutation
      .mutateAsync({
        trackId: currentTrack.id,
        sourceId: currentTrack.source_id,
        payload: {
          title: currentTrack.title,
          artist: currentTrack.artist?.name,
        },
        options,
      })
      .then((result) => {
        if (currentIdentityRef.current !== trackIdentity(currentTrack)) return
        setSearchChoiceDialogOpen(false)
        setTransientFeedback(result.synced ? "已应用同步歌词" : "已应用歌词")
      })
      .catch((err: unknown) => {
        if (currentIdentityRef.current !== trackIdentity(currentTrack)) return
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
      await restoreLyricsMutation.mutateAsync({ trackId: currentTrack.id, sourceId: currentTrack.source_id })
      setTransientFeedback("已恢复原始歌词")
    } catch {
      setTransientFeedback("没有可恢复的原始歌词")
    }
  }, [currentTrack, restoreLyricsMutation, setTransientFeedback])

  const searchOnlineCover = useCallback(async () => {
    if (!currentTrack) return
    setTransientFeedback("正在联网搜索封面...", 0)
    try {
      const updatedTrack = await searchTrackCoverMutation.mutateAsync({ id: currentTrack.id, sourceId: currentTrack.source_id })
      usePlayerStore.getState().replaceQueuedTrack(updatedTrack)
      setTransientFeedback("已更新封面")
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })
          ?.response?.data?.detail
      setTransientFeedback(msg || "搜索封面失败，请稍后重试。")
    }
  }, [currentTrack, searchTrackCoverMutation, setTransientFeedback])

  const searchCoverCandidates = useCallback(async () => {
    if (!currentTrack || !coverTitle.trim()) return
    setCoverSearchOpen(false)
    setCoverCandidatesLoading(true)
    setTransientFeedback(`正在搜索封面「${coverTitle.trim()}」...`, 0)
    try {
      const result = await searchTrackCoverCandidatesMutation.mutateAsync({
        id: currentTrack.id,
        sourceId: currentTrack.source_id,
        payload: {
          title: coverTitle.trim(),
          artist: coverArtist.trim() || undefined,
          limit: 8,
        },
      })
      if (currentIdentityRef.current !== trackIdentity(currentTrack)) return
      if (result.length === 0) {
        setTransientFeedback("未找到封面候选，请换个关键词试试")
        return
      }
      setCoverCandidates(result)
      setCoverCandidatesOpen(true)
      setTransientFeedback(`找到 ${result.length} 个封面候选，请选择`)
    } catch {
      setTransientFeedback("搜索封面失败，请稍后重试")
    } finally {
      setCoverCandidatesLoading(false)
    }
  }, [
    coverArtist,
    coverTitle,
    currentTrack,
    searchTrackCoverCandidatesMutation,
    setTransientFeedback,
  ])

  const applyCoverCandidate = useCallback(async (candidate: TrackCoverCandidate) => {
    if (!currentTrack) return
    setCoverCandidatesOpen(false)
    setTransientFeedback("正在应用封面...", 0)
    try {
      const updatedTrack = await applyTrackCoverMutation.mutateAsync({
        id: currentTrack.id,
        sourceId: currentTrack.source_id,
        payload: {
          image_url: candidate.image_url,
          album_title: candidate.album_title,
          artist_name: candidate.artist_name,
        },
      })
      usePlayerStore.getState().replaceQueuedTrack(updatedTrack)
      setTransientFeedback("已更新封面")
    } catch {
      setTransientFeedback("应用封面失败，请稍后重试。")
    }
  }, [applyTrackCoverMutation, currentTrack, setTransientFeedback])

  const saveManualLyrics = useCallback(async () => {
    if (!currentTrack || !manualLyricsText.trim()) return
    try {
      await saveLyricsMutation.mutateAsync({
        trackId: currentTrack.id,
        sourceId: currentTrack.source_id,
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

  const adjustLyricsOffset = useCallback(async (offsetMs: number) => {
    if (!currentTrack || !lyrics) return
    const nextOffset = Math.max(-30_000, Math.min(30_000, offsetMs))
    try {
      await updateLyricsOffsetMutation.mutateAsync({
        trackId: currentTrack.id,
        sourceId: currentTrack.source_id,
        offsetMs: nextOffset,
      })
      const seconds = Math.abs(nextOffset) / 1000
      setTransientFeedback(
        nextOffset === 0
          ? "已重置歌词同步"
          : `歌词已${nextOffset < 0 ? "提前" : "延后"} ${seconds.toFixed(1)} 秒`
      )
    } catch {
      setTransientFeedback("歌词同步调整失败")
    }
  }, [currentTrack, lyrics, setTransientFeedback, updateLyricsOffsetMutation])

  const addCurrentTrackToPlaylist = useCallback(async (playlistId: number) => {
    if (!currentTrack) return
    if (!canAddToSelectedPlaylist) {
      setTransientFeedback("请切换到这首歌曲所属的音乐源后再添加歌单")
      return
    }
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
  }, [addTracksToPlaylist, currentTrack, setTransientFeedback, canAddToSelectedPlaylist])

  const MoreActions = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button aria-label="更多歌曲操作" className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white md:h-auto md:w-auto">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="nowplaying-actions max-h-[70dvh] min-w-[12rem] overflow-y-auto border-white/15 bg-black/60 text-white backdrop-blur-md"
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
          onClick={() => setManualLyricsOpen(true)}
          className="focus:bg-white/10 focus:text-white"
        >
          手动粘贴歌词
        </DropdownMenuItem>
        {lyrics?.content && (
          <>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem disabled className="text-white/45 opacity-100">
              同步偏移：{(lyrics.offset_ms ?? 0) > 0 ? "+" : ""}{((lyrics.offset_ms ?? 0) / 1000).toFixed(1)} 秒
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => event.preventDefault()}
              onClick={() => adjustLyricsOffset((lyrics.offset_ms ?? 0) - 500)}
              disabled={updateLyricsOffsetMutation.isPending}
              className="focus:bg-white/10 focus:text-white"
            >
              歌词提前 0.5 秒
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => event.preventDefault()}
              onClick={() => adjustLyricsOffset((lyrics.offset_ms ?? 0) + 500)}
              disabled={updateLyricsOffsetMutation.isPending}
              className="focus:bg-white/10 focus:text-white"
            >
              歌词延后 0.5 秒
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => event.preventDefault()}
              onClick={() => adjustLyricsOffset(0)}
              disabled={updateLyricsOffsetMutation.isPending || (lyrics.offset_ms ?? 0) === 0}
              className="focus:bg-white/10 focus:text-white"
            >
              重置歌词同步
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={searchOnlineCover}
          disabled={!currentTrack || searchTrackCoverMutation.isPending}
          className="focus:bg-white/10 focus:text-white"
        >
          {searchTrackCoverMutation.isPending
            ? "搜索封面中..."
            : currentTrack?.has_cover
              ? "重搜封面"
              : "搜索封面"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setCoverTitle(currentTrack?.album?.title || currentTrack?.title || "")
            setCoverArtist(currentTrack?.artist?.name ?? "")
            setCoverSearchOpen(true)
          }}
          disabled={!currentTrack}
          className="focus:bg-white/10 focus:text-white"
        >
          指定搜索封面
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem
          onClick={() => setPlaylistDialogOpen(true)}
          disabled={!currentTrack || !canAddToSelectedPlaylist}
          className="focus:bg-white/10 focus:text-white"
        >
          添加到播放列表
        </DropdownMenuItem>
        {!canAddToSelectedPlaylist && <p className="max-w-56 px-3 py-2 text-xs text-white/50">切换到歌曲所属的音乐源后可添加歌单</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const QueueButton = (
    <button
      aria-label="待播列表"
      aria-haspopup="dialog"
      aria-expanded={queueOpen}
      aria-controls="player-queue-dialog"
      onClick={(event) => {
        queueTriggerRef.current = event.currentTarget
        setQueueOpen(true)
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
    >
      <ListMusic className="h-5 w-5" />
    </button>
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
          role="dialog"
          aria-modal="true"
          aria-label="正在播放"
          className="nowplaying-page fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden"
        >
          <ArtworkBackdrop
            colors={colors}
            reducedMotion={Boolean(prefersReducedMotion)}
          />
          <BackgroundDebugPanel />
          {/* 顶部栏 */}
          <div
            className="nowplaying-header relative z-10 flex shrink-0 touch-pan-x items-center px-3 py-2 md:px-4 md:py-3"
            onPointerDown={(event) => {
              if (event.pointerType !== 'touch' || window.matchMedia('(min-width: 768px)').matches || (event.target as HTMLElement).closest('button, input, a')) return
              headerSwipeStart.current = { x: event.clientX, y: event.clientY }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerUp={(event) => {
              const start = headerSwipeStart.current
              headerSwipeStart.current = null
              if (start && isPlayerDismissSwipe(start, { x: event.clientX, y: event.clientY })) setNowPlayingOpen(false)
            }}
            onPointerCancel={() => { headerSwipeStart.current = null }}
          >
            <button
              onClick={() => setNowPlayingOpen(false)}
              aria-label="收起播放器"
              className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
            >
              <ChevronDown className="h-6 w-6 text-white" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-sm font-medium text-white/50">正在播放</p>
              <p role={playbackError ? "alert" : undefined} className="mt-0.5 line-clamp-2 text-[11px] text-white/65">
                {playbackError ?? (searchLyricsMutation.isPending ? "正在联网搜词..." : (searchFeedback ?? "\u00A0"))}
              </p>
            </div>
            <div className="h-11 w-11 shrink-0" />
          </div>

          {/* 主内容 */}
          <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden px-3 pb-2 md:px-4">
            {/* 桌面端布局 */}
            <div className="hidden w-full md:flex">
              {/* 左侧：封面 + 曲目信息 + 控制按钮 */}
              <div
                className={`flex min-w-0 flex-col items-center justify-center transition-all duration-500 ${
                  lyricsVisible ? "w-2/5" : "w-full"
                }`}
              >
                <CoverArt
                  track={currentTrack ?? null}
                  size={lyricsVisible ? 300 : 420}
                />
                <div className="mt-4 max-w-full px-3 text-center">
                  <p className="truncate text-lg font-bold text-white">
                    {currentTrack?.title ?? "未在播放"}
                  </p>
                  <div className="mt-1 flex min-w-0 items-center justify-center gap-2 text-sm text-white/50">
                    <span className="min-w-0 truncate">{currentTrack?.artist?.name ?? "未知艺术家"}</span>
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
                <div className="mt-3 flex w-full max-w-sm flex-wrap items-center justify-between gap-2 px-2 lg:px-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (!currentTrack) return
                        const wasFavorite = currentTrack.is_favorite
                        toggleCurrentTrackFavorite()
                        toggleFavorite.mutate({
                          trackId: currentTrack.id,
                          sourceId: currentTrack.source_id,
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
                  <div className="flex items-center gap-2 lg:gap-4">
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
                  <div className="flex items-center gap-2">
                    {playbackCapabilities.spectrum && <button
                      onClick={() => setSpectrumVisible((v) => !v)}
                      aria-label={spectrumVisible ? "隐藏频谱" : "显示频谱"}
                      aria-pressed={spectrumVisible}
                      className={`text-base font-bold transition-colors hover:text-white ${
                        spectrumVisible ? "text-white" : "text-white/30"
                      }`}
                    >
                      谱
                    </button>}
                    <button
                      onClick={toggleLyrics}
                      aria-label={lyricsVisible ? "隐藏歌词" : "显示歌词"}
                      aria-pressed={lyricsVisible}
                      className={`text-base font-bold transition-colors hover:text-white ${
                        lyricsVisible ? "text-white" : "text-white/30"
                      }`}
                    >
                      词
                    </button>
                    {QueueButton}
                  </div>
                </div>

                {/* 频谱可视化 */}
                {spectrumVisible && playbackCapabilities.spectrum && (
                  <div className="mt-4 w-full max-w-sm px-6">
                    <SpectrumVisualizer
                      visible={spectrumVisible}
                      height={64}
                      color="rgba(255, 255, 255, 0.7)"
                    />
                  </div>
                )}
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
                  <LyricsView lyrics={lyrics ?? null} onSeek={seekAudio} trackId={currentTrack?.id} sourceId={currentTrack?.source_id} onFeedback={setTransientFeedback} />
                </motion.div>
              )}
            </div>

            {/* 移动端布局 */}
            <div className="mobile-nowplaying flex min-h-0 w-full flex-col md:hidden">
              <div className="mobile-player-content min-h-0 flex-1 overflow-hidden">
                {!lyricsVisible && (
                  <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto py-3">
                    <CoverArt track={currentTrack ?? null} size={320} className="mobile-player-cover shrink-0" />
                    {currentTrack?.album?.title && <p className="max-w-full truncate px-4 text-sm text-white/60">{currentTrack.album.title}</p>}
                    {spectrumVisible && playbackCapabilities.spectrum && <div className="w-full max-w-sm px-4"><SpectrumVisualizer visible height={48} color="rgba(255, 255, 255, 0.7)" /></div>}
                  </div>
                )}
                {lyricsVisible && <LyricsView lyrics={lyrics ?? null} onSeek={seekAudio} trackId={currentTrack?.id} sourceId={currentTrack?.source_id} onFeedback={setTransientFeedback} />}
              </div>
              <div className="mobile-player-controls shrink-0 rounded-2xl bg-black/10 px-3 pb-2 pt-3">
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1"><p className="truncate text-base font-semibold text-white">{currentTrack?.title ?? "未在播放"}</p><p className="truncate text-xs text-white/55">{currentTrack?.artist?.name ?? "未知艺术家"}</p></div>
                  <button aria-label={currentTrack?.is_favorite ? "取消收藏" : "收藏"} disabled={!currentTrack} onClick={() => {
                    if (!currentTrack) return
                    const wasFavorite = currentTrack.is_favorite
                    toggleCurrentTrackFavorite()
                    toggleFavorite.mutate({ trackId: currentTrack.id, sourceId: currentTrack.source_id, isFavorite: wasFavorite })
                  }} className="flex h-11 w-11 items-center justify-center rounded-full"><Heart className={`h-5 w-5 ${currentTrack?.is_favorite ? 'fill-red-500 text-red-500' : 'text-white/70'}`} /></button>
                  {MoreActions}
                </div>
                <SeekBar duration={duration} className="w-full" />
                <div className="mt-2 flex items-center justify-between">
                  <button aria-label={playMode === "shuffle" ? "随机播放" : playMode === "repeat-one" ? "单曲循环" : playMode === "repeat-all" ? "列表循环" : "顺序播放"} onClick={cyclePlayMode} className={`flex h-11 w-11 items-center justify-center ${playMode === 'sequential' ? 'text-white/40' : 'text-white'}`}>{playMode === "shuffle" ? <Shuffle className="h-5 w-5" /> : playMode === "repeat-one" ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}</button>
                  <button aria-label="上一首" onClick={playPrev} disabled={!currentTrack} className="flex h-12 w-12 items-center justify-center text-white disabled:opacity-40"><SkipBack className="h-7 w-7" /></button>
                  <button aria-label={isPlaying ? "暂停" : "播放"} onClick={() => setPlaying(!isPlaying)} disabled={!currentTrack} className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black disabled:opacity-40">{isPlaying ? <Pause className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}</button>
                  <button aria-label="下一首" onClick={playNext} disabled={!currentTrack} className="flex h-12 w-12 items-center justify-center text-white disabled:opacity-40"><SkipForward className="h-7 w-7" /></button>
                  {playbackCapabilities.equalizer ? <EqualizerControl className="text-white/70 hover:bg-white/10 hover:text-white" /> : <span className="h-11 w-11" />}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <button aria-label={lyricsVisible ? "隐藏歌词" : "显示歌词"} aria-pressed={lyricsVisible} onClick={toggleLyrics} className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-bold transition-colors hover:bg-white/10 ${lyricsVisible ? 'text-white' : 'text-white/40'}`}>词</button>
                  {playbackCapabilities.spectrum && <button aria-label={spectrumVisible ? "隐藏频谱" : "显示频谱"} aria-pressed={spectrumVisible} onClick={() => setSpectrumVisible((value) => !value)} className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-bold transition-colors hover:bg-white/10 ${spectrumVisible ? 'text-white' : 'text-white/40'}`}>谱</button>}
                  {QueueButton}
                </div>
                {!playbackCapabilities.equalizer && !playbackCapabilities.spectrum && <p className="mt-1 text-center text-[11px] text-white/45">当前原生播放引擎暂不支持均衡器与实时频谱</p>}
              </div>
            </div>
          </div>

          <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
            <DialogContent
              id="player-queue-dialog"
              className="flex max-h-[80dvh] flex-col border-white/15 bg-black/80 text-white backdrop-blur-xl"
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                queueTriggerRef.current?.focus()
              }}
            >
              <DialogHeader>
                <DialogTitle>待播列表</DialogTitle>
                <DialogDescription className="text-white/60">{queue.length} 首歌曲 · 关闭列表后返回当前播放视图</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                {queue.length === 0 && <p className="py-8 text-center text-sm text-white/50">选择歌曲后会显示在这里</p>}
                {queue.map((track, index) => (
                  <div key={`${track.source_id ?? 'web'}-${track.id}-${index}`} className={`mb-1 flex items-center rounded-xl ${index === currentQueueIndex ? 'bg-white/15' : 'hover:bg-white/5'}`}>
                    <button aria-label={`播放 ${track.title}`} aria-current={index === currentQueueIndex ? "true" : undefined} onClick={() => setQueue(queue, index)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 p-2 text-left">
                      {track.has_cover ? <img src={track.source_id === "local:android" ? track.cover_url ?? undefined : getTrackCoverUrl(track.id, track.album?.cover_path, track.source_id)} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white/10 text-sm text-white/50">{index + 1}</span>}
                      <span className="min-w-0"><span className="block truncate text-sm text-white">{track.title}</span><span className="block truncate text-xs text-white/50">{track.artist?.name ?? "未知艺术家"}</span></span>
                    </button>
                    <button aria-label={`从待播列表移除 ${track.title}`} onClick={() => removeFromQueue(index)} className="flex h-11 w-11 shrink-0 items-center justify-center text-white/50"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

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
                        sourceId: currentTrack.source_id,
                        payload: {
                          title: customTitle.trim(),
                          artist: customArtist.trim() || undefined,
                        },
                        limit: 8,
                      })
                      .then((result) => {
                        if (currentIdentityRef.current !== trackIdentity(currentTrack)) return
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

          {/* 指定搜索封面弹窗 */}
          <Dialog open={coverSearchOpen} onOpenChange={setCoverSearchOpen}>
            <DialogContent className="border-white/15 bg-black/80 text-white backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle>指定搜索封面</DialogTitle>
                <DialogDescription className="text-white/60">
                  手动指定专辑名和歌手进行搜索
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-white/50">专辑或歌曲</label>
                  <input
                    value={coverTitle}
                    onChange={(e) => setCoverTitle(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
                    placeholder="专辑名称或歌曲名称"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-white/50">歌手</label>
                  <input
                    value={coverArtist}
                    onChange={(e) => setCoverArtist(e.target.value)}
                    className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30"
                    placeholder="歌手名称（可选）"
                  />
                </div>
              </div>
              <DialogFooter>
                <button
                  onClick={() => setCoverSearchOpen(false)}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={searchCoverCandidates}
                  disabled={!coverTitle.trim() || coverCandidatesLoading}
                  className="rounded-md bg-white px-3 py-2 text-sm text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                >
                  搜索
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 封面候选选择弹窗 */}
          <Dialog open={coverCandidatesOpen} onOpenChange={setCoverCandidatesOpen}>
            <DialogContent className="border-white/15 bg-black/80 text-white backdrop-blur-xl max-w-lg">
              <DialogHeader>
                <DialogTitle>选择封面</DialogTitle>
                <DialogDescription className="text-white/60">
                  找到 {coverCandidates.length} 个候选，点击选择要使用的封面
                </DialogDescription>
              </DialogHeader>
              <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                {coverCandidates.map((candidate) => (
                  <button
                    key={candidate.image_url}
                    onClick={() => applyCoverCandidate(candidate)}
                    disabled={applyTrackCoverMutation.isPending}
                    className="min-w-0 rounded-md border border-white/10 bg-white/5 p-2 text-left transition-colors hover:bg-white/10 disabled:opacity-60"
                  >
                    <img
                      src={candidate.thumbnail_url || candidate.image_url}
                      alt={candidate.album_title || "封面候选"}
                      className="aspect-square w-full rounded object-cover"
                    />
                    <p className="mt-2 truncate text-xs font-medium text-white/85">
                      {candidate.album_title || "未知专辑"}
                    </p>
                    <p className="truncate text-[11px] text-white/50">
                      {candidate.artist_name || "未知艺术家"}
                    </p>
                  </button>
                ))}
              </div>
              <DialogFooter>
                <button
                  onClick={() => setCoverCandidatesOpen(false)}
                  className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
                >
                  取消
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
                          sourceId: currentTrack.source_id,
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
