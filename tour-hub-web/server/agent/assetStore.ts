import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export class MediaError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code }
}
export interface StoredImage {
  file: string
  url: string
  mime: string
  bytes: number
  hash: string
  requestKey: string
  model: string
  prompt: string
  createdAt: number
}
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const FILE = /^[a-f0-9]{64}\.(?:png|jpg|webp)$/

export function imageExtension(bytes: Uint8Array, mime: string): 'png' | 'jpg' | 'webp' {
  const data = Buffer.from(bytes)
  if (mime === 'image/png' && data.length > 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && data.toString('ascii', 12, 16) === 'IHDR') return 'png'
  if (mime === 'image/jpeg' && data.length > 4 && data[0] === 255 && data[1] === 216 && data[2] === 255 && data.at(-2) === 255 && data.at(-1) === 217) return 'jpg'
  if (mime === 'image/webp' && data.length > 16 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' && data.readUInt32LE(4) + 8 === data.length) return 'webp'
  throw new MediaError(422, 'IMAGE_INVALID', '图片内容与支持的 PNG/JPEG/WebP 类型不一致。')
}

export function assetStore(directory: string, maxBytes = 5 * 1024 * 1024) {
  const atomic = async (file: string, data: string | Uint8Array) => {
    await mkdir(directory, { recursive: true })
    const temporary = join(directory, `${randomUUID()}.tmp`)
    try { await writeFile(temporary, data, { mode: 0o600 }); await rename(temporary, join(directory, file)) }
    finally { await unlink(temporary).catch(() => {}) }
  }
  const read = async (file: string): Promise<{ image: StoredImage; data: Buffer }> => {
    if (!FILE.test(file)) throw new MediaError(404, 'ASSET_NOT_FOUND', '图片素材不存在。')
    try {
      const image = JSON.parse(await readFile(join(directory, `${file}.json`), 'utf8')) as StoredImage
      const data = await readFile(join(directory, file))
      if (image.file !== file || data.length !== image.bytes || data.length > maxBytes || image.hash !== digest(data)
        || file !== `${image.hash}.${imageExtension(data, image.mime)}` || image.url !== `/api/agent/assets/${file}`) throw new Error('invalid asset')
      return { image, data }
    } catch { throw new MediaError(404, 'ASSET_NOT_FOUND', '图片素材缺失或损坏，请保留原图或重新生成。') }
  }
  return {
    read,
    async cached(requestKey: string): Promise<StoredImage | undefined> {
      if (!/^[a-f0-9]{64}$/.test(requestKey)) return
      try {
        const index = JSON.parse(await readFile(join(directory, `request-${requestKey}.json`), 'utf8')) as StoredImage
        const { image } = await read(index.file)
        return index.requestKey === requestKey && index.hash === image.hash ? index : undefined
      } catch { return }
    },
    async put(bytes: Uint8Array, mime: string, metadata: Pick<StoredImage, 'requestKey' | 'model' | 'prompt'>): Promise<StoredImage> {
      if (!bytes.length || bytes.length > maxBytes) throw new MediaError(422, 'IMAGE_TOO_LARGE', '生成图片超过素材大小限制，请减少分辨率。')
      const extension = imageExtension(bytes, mime)
      const hash = digest(bytes)
      const file = `${hash}.${extension}`
      const image: StoredImage = { ...metadata, file, hash, bytes: bytes.length, mime, url: `/api/agent/assets/${file}`, createdAt: Date.now() }
      await atomic(file, bytes)
      await atomic(`${file}.json`, JSON.stringify(image))
      await atomic(`request-${metadata.requestKey}.json`, JSON.stringify(image))
      return image
    },
  }
}
