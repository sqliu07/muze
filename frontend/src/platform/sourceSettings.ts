import type { LibrarySource } from './contracts/library.ts'
import type { RuntimePlatform } from './runtime.ts'

export const SOURCE_SETTINGS_KEY = 'muze-library-sources-v1'
export const SAME_ORIGIN_SOURCE: LibrarySource = {
  id: 'remote:same-origin', kind: 'remote', name: '当前 Muze 服务', baseUrl: '/api',
}

export interface SourceSettings {
  activeSourceId: string
  remotes: LibrarySource[]
}

export function localLibrarySource(platform: RuntimePlatform): LibrarySource | null {
  return platform === 'web' ? null : {
    id: `local:${platform}`, kind: 'local', name: '本地音乐', platform,
  }
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true
  if (/^(?:(?:fc|fd)[0-9a-f]{2}|fe80):/.test(host)) return true
  if (!host.includes('.') && !host.includes(':')) return true
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
}

export function normalizeRemoteBaseUrl(input: string): string {
  const value = input.trim()
  if (value === '/api') return value
  let url: URL
  try { url = new URL(value) } catch { throw new Error('请输入完整服务器地址，例如 http://192.168.5.2:8000') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('服务器地址必须使用 HTTP 或 HTTPS')
  if (url.username || url.password) throw new Error('请勿在服务器地址中保存用户名或密码')
  if (url.protocol === 'http:' && !isLocalHostname(url.hostname)) {
    throw new Error('公网服务器请使用 HTTPS；HTTP 仅用于本机或局域网')
  }
  if (url.search || url.hash) throw new Error('服务器地址不能包含查询参数或锚点')
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path.endsWith('/api') ? path : `${path}/api`
  return url.toString().replace(/\/$/, '')
}

export function createRemoteSource(name: string, input: string): LibrarySource {
  const baseUrl = normalizeRemoteBaseUrl(input)
  if (baseUrl === '/api') return { ...SAME_ORIGIN_SOURCE }
  // Source ownership follows the endpoint, so editing a label never changes queue IDs.
  let hash = 2166136261
  for (const char of baseUrl) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return { id: `remote:${(hash >>> 0).toString(16)}`, kind: 'remote', name: name.trim() || new URL(baseUrl).host, baseUrl }
}

export function readSourceSettings(raw: string | null, platform: RuntimePlatform): SourceSettings {
  const local = localLibrarySource(platform)
  const fallback = { activeSourceId: local?.id ?? SAME_ORIGIN_SOURCE.id, remotes: local ? [] : [SAME_ORIGIN_SOURCE] }
  if (!raw) return fallback
  try {
    const saved = JSON.parse(raw) as { activeSourceId?: unknown; remotes?: unknown }
    const remotes: LibrarySource[] = local ? [] : [SAME_ORIGIN_SOURCE]
    if (Array.isArray(saved.remotes)) {
      for (const item of saved.remotes) {
        if (typeof item?.baseUrl !== 'string' || typeof item?.name !== 'string') continue
        try {
          const source = createRemoteSource(item.name, item.baseUrl)
          if (local && source.id === SAME_ORIGIN_SOURCE.id) continue
          if (!remotes.some((remote) => remote.id === source.id)) remotes.push(source)
        } catch { /* Discard invalid profiles, including credentials from old settings. */ }
      }
    }
    const allowedIds = new Set([...remotes.map((source) => source.id), ...(local ? [local.id] : [])])
    const activeSourceId = typeof saved.activeSourceId === 'string' && allowedIds.has(saved.activeSourceId)
      ? saved.activeSourceId : fallback.activeSourceId
    return { activeSourceId, remotes }
  } catch { return fallback }
}
