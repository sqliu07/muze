import { useState, useEffect } from 'react'
import {
  useSettings,
  useTestDeepSeekConnection,
  useUpdateSettings,
} from '@/api/hooks/useSettings'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateMutation = useUpdateSettings()
  const testMutation = useTestDeepSeekConnection()

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('deepseek-flash')
  const [showKey, setShowKey] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackError, setFeedbackError] = useState(false)

  useEffect(() => {
    if (settings) {
      setModel(settings.deepseek_model || 'deepseek-flash')
    }
  }, [settings])

  const handleSave = async () => {
    try {
      const patch: Record<string, string> = { deepseek_model: model.trim() || 'deepseek-flash' }
      // 只在用户输入了新 key 时才更新
      if (apiKey.trim()) {
        patch.deepseek_api_key = apiKey.trim()
      }
      await updateMutation.mutateAsync(patch)
      setApiKey('')
      setFeedbackError(false)
      setFeedback('已保存')
      setTimeout(() => setFeedback(''), 2000)
    } catch {
      setFeedbackError(true)
      setFeedback('保存失败')
      setTimeout(() => setFeedback(''), 3000)
    }
  }

  const handleRemoveKey = async () => {
    try {
      await updateMutation.mutateAsync({ deepseek_api_key: '' })
      setApiKey('')
      setFeedbackError(false)
      setFeedback('已移除 API Key')
    } catch {
      setFeedbackError(true)
      setFeedback('移除失败')
    }
  }

  const handleTest = async () => {
    try {
      const result = await testMutation.mutateAsync()
      setFeedbackError(!result.ok)
      setFeedback(result.message)
    } catch {
      setFeedbackError(true)
      setFeedback('连接测试失败')
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
          配置 DeepSeek API Key 以启用结构化歌词翻译。未配置或服务不可用时使用 Google Translate 兜底。
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium">DeepSeek API Key</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.deepseek_configured ? '留空表示保留当前密钥' : 'sk-...'}
                autoComplete="off"
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="deepseek-model">模型</label>
            <Input
              id="deepseek-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="deepseek-flash"
            />
            <p className="text-xs text-muted-foreground">
              默认使用 DeepSeek 当前的快速模型 deepseek-flash。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {settings?.deepseek_configured ? 'API Key 已配置' : '尚未配置 API Key'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={!settings?.deepseek_configured || testMutation.isPending}
            >
              {testMutation.isPending ? '测试中...' : '测试连接'}
            </Button>
            {settings?.deepseek_configured && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveKey}
                disabled={updateMutation.isPending}
              >
                移除密钥
              </Button>
            )}
          </div>
          {feedback && (
            <p className={`text-sm ${feedbackError ? 'text-red-500' : 'text-green-500'}`}>
              {feedback}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
