import { createHash, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import type { CreativeBrief, ResearchDossier } from '../../src/experience/agent/contracts.ts'
import { packageFingerprint } from '../../src/experience/agent/validators.ts'
import type { PublishedAttraction } from '../../src/lib/tourPackage.ts'

export class ResearchError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code }
}

/** URLs are sent only to Tavily Extract, never fetched by this server. */
export function researchUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 2000) return
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(host) || host.includes(':')
      || !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
      || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return
    url.hash = ''
    return url.href
  } catch { return }
}

interface ResearchOptions { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const snippet = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''

export async function researchAttraction(pkg: PublishedAttraction, brief: CreativeBrief, signal: AbortSignal, options: ResearchOptions): Promise<ResearchDossier> {
  if (!options.apiKey) throw new ResearchError(503, 'SEARCH_NOT_CONFIGURED', '联网研究尚未配置 Tavily；可直接使用已有景点资料生成构想。')
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs ?? 25_000)])
  const call = async (path: 'search' | 'extract', body: unknown) => {
    try {
      const response = await (options.fetchImpl ?? fetch)(`https://api.tavily.com/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify(body), signal: deadline, redirect: 'error',
      })
      if (!response.ok || !response.body) throw new Error('provider unavailable')
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []; let size = 0
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > 1_000_000) throw new Error('response too large')
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    } catch {
      if (deadline.aborted) throw new ResearchError(504, 'SEARCH_TIMEOUT', '联网研究已取消或超时；已有资料仍可使用。')
      throw new ResearchError(502, 'SEARCH_UNAVAILABLE', '联网研究暂时不可用；可重试或使用已有景点资料。')
    }
  }
  const query = `${pkg.name} ${pkg.spots.slice(0, 3).map(spot => spot.name).join(' ')} ${brief.theme.slice(0, 100)} 展区 特色 故事灵感`.slice(0, 350)
  const searched = await call('search', { query, max_results: 4, search_depth: 'basic', include_answer: false, include_raw_content: false })
  if (!object(searched) || !Array.isArray(searched.results)) throw new ResearchError(502, 'SEARCH_INVALID', '研究服务返回的搜索结果无效。')
  const pages: ResearchDossier['pages'] = []
  const seen = new Set<string>()
  for (const item of searched.results.slice(0, 12)) {
    if (!object(item)) continue
    const url = researchUrl(item.url)
    if (!url || seen.has(url)) continue
    const excerpt = snippet(item.content, 2000)
    if (!excerpt) continue
    seen.add(url)
    pages.push({ source: { id: `web-${createHash('sha256').update(url).digest('hex').slice(0, 16)}`, url,
      title: snippet(item.title, 200) || new URL(url).hostname, authority: 'secondary' }, excerpt, extracted: false })
    if (pages.length === 4) break
  }
  if (!pages.length) throw new ResearchError(422, 'SEARCH_EMPTY', '没有可用研究结果；可改写主题，或直接使用已有景点资料。')
  const warnings: string[] = []
  // Only the two URLs just returned by search may be extracted. No user URL endpoint.
  const selectedUrls = pages.slice(0, 2).map(page => page.source.url)
  try {
    const extracted = await call('extract', { urls: selectedUrls, extract_depth: 'basic', format: 'text' })
    if (object(extracted) && Array.isArray(extracted.results)) for (const item of extracted.results.slice(0, 4)) {
      if (!object(item)) continue
      const url = researchUrl(item.url)
      const page = pages.find(page => page.source.url === url && selectedUrls.includes(url!))
      const content = snippet(item.raw_content, 5000)
      if (page && content) { page.excerpt = content; page.extracted = true }
    }
    if (pages.filter(page => page.extracted).length < selectedUrls.length) warnings.push('部分网页正文未读取，保留搜索摘要作为灵感。')
  } catch (error) {
    if (signal.aborted || deadline.aborted) throw error
    warnings.push('正文读取失败，使用本次搜索摘要继续。')
  }
  return { id: `research-${randomUUID()}`, basePackage: { id: pkg.id, version: pkg.publishedAt, fingerprint: packageFingerprint(pkg) },
    brief: structuredClone(brief), query, createdAt: Date.now(), provider: 'tavily', pages, warnings }
}

/** Small process-local cache. Expiry/restarts request a new research run, never trust client-supplied sources. */
export function researchRegistry(ttlMs = 30 * 60_000, capacity = 32) {
  const entries = new Map<string, ResearchDossier>()
  return {
    put(dossier: ResearchDossier) {
      for (const [id, value] of entries) if (Date.now() - value.createdAt > ttlMs) entries.delete(id)
      if (entries.size >= capacity) entries.delete(entries.keys().next().value!)
      entries.set(dossier.id, structuredClone(dossier))
    },
    get(id: unknown, brief: CreativeBrief, pkg: PublishedAttraction): ResearchDossier | undefined {
      if (id === undefined) return
      const value = typeof id === 'string' ? entries.get(id) : undefined
      if (!value || Date.now() - value.createdAt > ttlMs) throw new ResearchError(409, 'RESEARCH_EXPIRED', '研究结果已过期或服务已重启，请重新研究或切换到已有资料。')
      if (JSON.stringify(value.brief) !== JSON.stringify(brief) || value.basePackage.version !== pkg.publishedAt || value.basePackage.fingerprint !== packageFingerprint(pkg)) {
        throw new ResearchError(409, 'RESEARCH_MISMATCH', '研究结果与当前简报或基础包不一致，请重新研究。')
      }
      return structuredClone(value)
    },
  }
}
