import { useState, useEffect } from 'react'
import { useSettings, useUpdateSettings } from '@/api/hooks/useSettings'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateMutation = useUpdateSettings()

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (settings) {
      // 脱敏的 key 不回填到输入框
      if (settings.deepseek_api_key && !settings.deepseek_api_key.includes('*')) {
        setApiKey(settings.deepseek_api_key)
      }
    }
  }, [settings])

  const handleSave = async () => {
    try {
      const patch: Record<string, string> = {}
      // 只在用户输入了新 key 时才更新
      if (apiKey.trim()) {
        patch.deepseek_api_key = apiKey.trim()
      }
      await updateMutation.mutateAsync(patch)
      setFeedback('已保存')
      setTimeout(() => setFeedback(''), 2000)
    } catch {
      setFeedback('保存失败')
      setTimeout(() => setFeedback(''), 3000)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <div className="p-6 max-w-xl space-y-8">
      <h1 className="text-2xl font-bold">设置</h1>

      {/* 翻译设置 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">歌词翻译</h2>
        <p className="text-sm text-muted-foreground">
          配置 DeepSeek API Key 以启用高质量歌词翻译。未配置时使用 Google Translate 免费接口。
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium">DeepSeek API Key</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </div>
          {settings?.deepseek_api_key && (
            <p className="text-xs text-muted-foreground">
              当前: {settings.deepseek_api_key}
            </p>
          )}
          {feedback && (
            <p className={`text-sm ${feedback.includes('失败') ? 'text-red-500' : 'text-green-500'}`}>
              {feedback}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
