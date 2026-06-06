import Icon from '@mdi/react'
import { mdiTranslateVariant } from '@mdi/js'
import { useUIStore } from '@/store/uiStore'
import { useTranslateLyrics } from '@/api/hooks/useLyrics'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface TranslationToggleProps {
  isEnglish: boolean
  hasTranslation: boolean
  trackId: number
  onFeedback?: (message: string, timeoutMs?: number) => void
}

export default function TranslationToggle({ isEnglish, hasTranslation, trackId, onFeedback }: TranslationToggleProps) {
  const showTranslation = useUIStore((s) => s.showTranslation)
  const toggleTranslation = useUIStore((s) => s.toggleTranslation)
  const translateMutation = useTranslateLyrics()

  if (!isEnglish) return null

  const handleRetranslate = async () => {
    if (translateMutation.isPending) return
    onFeedback?.("正在翻译歌词...", 0)
    try {
      await translateMutation.mutateAsync({ trackId, force: true })
      if (!showTranslation) toggleTranslation()
      onFeedback?.("翻译完成", 2600)
    } catch {
      onFeedback?.("翻译失败，请稍后重试", 2600)
    }
  }

  const handleToggle = () => {
    toggleTranslation()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center justify-center transition-colors hover:opacity-100"
          style={{ opacity: showTranslation ? 1 : 0.5 }}
        >
          <Icon path={mdiTranslateVariant} size={1} color={showTranslation ? "white" : "rgba(255,255,255,0.6)"} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[8rem] border-white/15 bg-black/60 text-white backdrop-blur-md"
      >
        {hasTranslation && (
          <DropdownMenuItem
            onSelect={(e) => e.preventDefault()}
            onClick={handleToggle}
            className="focus:bg-white/10 focus:text-white"
          >
            {showTranslation ? '隐藏翻译' : '显示翻译'}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          onClick={handleRetranslate}
          disabled={translateMutation.isPending}
          className="focus:bg-white/10 focus:text-white"
        >
          {hasTranslation ? '重新翻译' : '翻译'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
