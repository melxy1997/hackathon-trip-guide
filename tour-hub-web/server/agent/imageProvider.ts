import { MediaError } from './assetStore.ts'

export interface ImageProviderConfig {
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
  maxBytes?: number
  fetchImpl?: typeof fetch
}
export const IMAGE_SIZE = '1440x2560'
export function imageProviderBase(raw = 'https://ark.cn-beijing.volces.com/api/v3'): string {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('invalid base')
    return url.href.replace(/\/$/, '')
  } catch { throw new MediaError(503, 'IMAGE_CONFIG_INVALID', '服务端生图地址配置无效。') }
}
export function imageDownloadUrl(raw: unknown): string {
  try {
    if (typeof raw !== 'string' || raw.length > 8000) throw new Error('invalid URL')
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !['volces.com', 'byteimg.com', 'ibyteimg.com'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) throw new Error('invalid CDN')
    return url.href
  } catch { throw new MediaError(422, 'IMAGE_URL_INVALID', '生图服务未返回支持的图片下载地址。') }
}
async function bounded(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) throw new MediaError(502, 'IMAGE_UNAVAILABLE', '图片服务暂时不可用或返回内容过大。')
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new MediaError(422, 'IMAGE_TOO_LARGE', '生成图片超过素材大小限制。')
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
export async function generateImage(prompt: string, signal: AbortSignal, config: ImageProviderConfig): Promise<{ data: Uint8Array; mime: string }> {
  if (!config.apiKey || !config.model) throw new MediaError(503, 'IMAGE_NOT_CONFIGURED', '生图尚未配置 ARK_API_KEY / ARK_IMAGE_MODEL；现有图片仍可使用。')
  const base = imageProviderBase(config.baseUrl)
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs ?? 180_000)])
  try {
    const response = await (config.fetchImpl ?? fetch)(`${base}/images/generations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, prompt, size: IMAGE_SIZE, response_format: 'url', watermark: true, sequential_image_generation: 'disabled' }),
      signal: deadline, redirect: 'error',
    })
    const generated = JSON.parse(Buffer.from(await bounded(response, 1_000_000)).toString('utf8'))
    const url = imageDownloadUrl(generated.data?.[0]?.url)
    // Provider Authorization never goes to the image CDN. Temporary URLs are not stored.
    const image = await (config.fetchImpl ?? fetch)(url, { signal: deadline, redirect: 'error' })
    const mime = (image.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new MediaError(422, 'IMAGE_INVALID', '图片服务返回了不支持的媒体类型。')
    return { data: await bounded(image, config.maxBytes ?? 5 * 1024 * 1024), mime }
  } catch (error) {
    if (deadline.aborted) throw new MediaError(504, 'IMAGE_TIMEOUT', '图片生成已取消或超时；原候选与原图仍保留。')
    if (error instanceof MediaError) throw error
    throw new MediaError(502, 'IMAGE_UNAVAILABLE', '图片服务暂时不可用，请重试或继续使用原图。')
  }
}
