type ErrorRecord = Record<string, unknown>

function record(value: unknown): ErrorRecord {
  return value && typeof value === 'object' ? value as ErrorRecord : {}
}

/** Prefer safe provider/API details so translation failures remain diagnosable. */
export function translationFailureMessage(error: unknown): string {
  const root = record(error)
  const response = record(root.response)
  const responseData = record(response.data)
  const detail = responseData.detail
  const candidate = typeof detail === 'string' ? detail : typeof root.message === 'string' ? root.message : ''
  if (!candidate.trim()) return '翻译失败，请稍后重试'
  return candidate.trim().replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/g, ' ')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[密钥已隐藏]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[地址已隐藏]')
    .slice(0, 160)
}
