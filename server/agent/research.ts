import { boundedJson } from './model.ts'
export interface ResearchServices { search: (query: string, signal: AbortSignal) => Promise<Array<{ url: string; title: string; content: string }>>; extract: (url: string, signal: AbortSignal) => Promise<string> }
export function publicHttps(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[)/i.test(url.hostname) || /\.(local|internal|localhost)$/i.test(url.hostname)) throw new Error('研究仅接受公开 HTTPS 来源')
  return url.href
}
export function tavilyServices(apiKey: string): ResearchServices {
  const request = async (endpoint: string, body: unknown, signal: AbortSignal) => {
    const response = await fetch(`https://api.tavily.com/${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]) })
    if (!response.ok) { await response.body?.cancel(); throw new Error(`资料服务暂不可用（HTTP ${response.status}）`) }
    return await boundedJson(response) as Record<string, unknown>
  }
  return {
    async search(query, signal) {
      const result = await request('search', { query, max_results: 4, search_depth: 'basic', include_answer: false }, signal)
      return (Array.isArray(result.results) ? result.results : []).slice(0, 4).flatMap(item => {
        try { return [{ url: publicHttps(item.url), title: String(item.title ?? '').slice(0, 200), content: String(item.content ?? '').slice(0, 1500) }] } catch { return [] }
      })
    },
    async extract(url, signal) {
      const result = await request('extract', { urls: [publicHttps(url)], extract_depth: 'basic' }, signal)
      const first = Array.isArray(result.results) ? result.results[0] : undefined
      if (!first || publicHttps(first.url) !== publicHttps(url) || typeof first.raw_content !== 'string') throw new Error('来源正文暂不可读取')
      return first.raw_content.slice(0, 6000)
    },
  }
}
