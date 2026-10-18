/* global window, FileReader */
import {
  CONTRACT_SCHEMA_VERSION,
  resolveMediaUrl,
  toCatalogItem,
  type AttractionCatalog,
  type LngLat,
  type PublishedAttraction,
  type PublishedSpot,
} from './tourPackage'
import { exportPackageViaServer, type MediaFile } from './exportTarget'
import { managementUrl, readApiJson } from './managementApi'
import { loadPublishedAttraction } from './catalog'
import type { DraftAttraction, Spot } from '../types/attraction'

export const DEFAULT_MAP_ZOOM = 18.5

const pendingSaves = new Map<string, Promise<unknown>>()

function draftsApiUrl(id?: string): string {
  return managementUrl(`/__trip_guide/drafts${id ? `/${encodeURIComponent(id)}` : ''}`)
}

async function readDraftApiJson<T>(res: Response, method = 'GET', url = res.url): Promise<T> {
  return readApiJson<T>(res, { method, url, failureMessage: '草稿请求失败' })
}

function startFromFirstSpot(spots: Spot[], fallback?: LngLat): LngLat {
  const first = spots[0]
  if (first) return { lng: first.lng, lat: first.lat }
  return fallback || { lng: 121.49195, lat: 31.2272 }
}

/** 坐标字段统一过一道：坏值当没写（视野中心只影响开场取景，缺省回落成 start） */
function validPos(pos: LngLat | undefined | null): LngLat | undefined {
  if (!pos || typeof pos.lng !== 'number' || typeof pos.lat !== 'number') return undefined
  return pos
}

function normalizeDraft(raw: DraftAttraction): DraftAttraction {
  const spots = Array.isArray(raw.spots) ? raw.spots : []
  const hasStart =
    raw.start &&
    typeof raw.start.lng === 'number' &&
    typeof raw.start.lat === 'number' &&
    (raw.start.lng !== 0 || raw.start.lat !== 0)
  return {
    ...raw,
    spots,
    city: typeof raw.city === 'string' ? raw.city : '',
    amapContext: typeof raw.amapContext === 'string' ? raw.amapContext : '',
    candidates: Array.isArray(raw.candidates) ? raw.candidates : [],
    zoom: typeof raw.zoom === 'number' && raw.zoom > 0 ? raw.zoom : DEFAULT_MAP_ZOOM,
    start: hasStart ? raw.start : startFromFirstSpot(spots, raw.start),
    view: validPos(raw.view),
  }
}

/** 仅未发布/编辑中的草稿（与 public/spots 分离） */
export async function listLocalDrafts(): Promise<DraftAttraction[]> {
  const url = draftsApiUrl()
  const data = await readDraftApiJson<{ ok: true; items: DraftAttraction[] }>(
    await fetch(url, { cache: 'no-cache' }),
    'GET',
    url,
  )
  return Array.isArray(data.items) ? data.items.map(normalizeDraft).sort((a, b) => b.updatedAt - a.updatedAt) : []
}

export async function getDraft(id: string): Promise<DraftAttraction | null> {
  const url = draftsApiUrl(id)
  const res = await fetch(url, { cache: 'no-cache' })
  if (res.status === 404) return null
  const data = await readDraftApiJson<{ ok: true; item: DraftAttraction }>(res, 'GET', url)
  return normalizeDraft(data.item)
}

export function publishedToDraft(pkg: PublishedAttraction): DraftAttraction {
  const now = Date.now()
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    status: 'published',
    start: pkg.start,
    view: validPos(pkg.view),
    zoom: pkg.zoom || DEFAULT_MAP_ZOOM,
    spots: pkg.spots.map((s) => ({
      ...s,
      image: resolveMediaUrl(pkg, s.image),
    })),
    coverImage: resolveMediaUrl(pkg, pkg.coverImage),
    visitorAvatar: pkg.visitorAvatar ? resolveMediaUrl(pkg, pkg.visitorAvatar) : undefined,
    createdAt: pkg.publishedAt || now,
    updatedAt: now,
    mode: pkg.mode === 'story' ? 'story' : undefined,
    story: pkg.story ? { ...pkg.story } : undefined,
  }
}

async function createDraftOnServer(item: DraftAttraction): Promise<DraftAttraction> {
  const url = draftsApiUrl()
  const data = await readDraftApiJson<{ ok: true; item: DraftAttraction }>(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    }),
    'POST',
    url,
  )
  return normalizeDraft(data.item)
}

/** 编辑器用：服务端草稿优先，否则从已发布包创建一份可编辑草稿。 */
export async function ensureEditableDraft(id: string): Promise<DraftAttraction | null> {
  const stored = await getDraft(id)
  if (stored) return stored
  try {
    return await createDraftOnServer(publishedToDraft(await loadPublishedAttraction(id)))
  } catch {
    return null
  }
}

export async function createDraft(input: {
  name: string
  description: string
  start?: LngLat
}): Promise<DraftAttraction> {
  const now = Date.now()
  const start = input.start || { lng: 121.49195, lat: 31.2272 }
  const item: DraftAttraction = {
    id: `attr-${now.toString(36)}`,
    name: input.name.trim() || '未命名景点',
    description: input.description.trim(),
    status: 'draft',
    start,
    zoom: DEFAULT_MAP_ZOOM,
    spots: [],
    coverImage: '/spots/map-intro.jpg',
    createdAt: now,
    updatedAt: now,
  }
  return createDraftOnServer(item)
}

export async function saveDraft(next: DraftAttraction): Promise<DraftAttraction> {
  const previous = pendingSaves.get(next.id) || Promise.resolve()
  const request = previous.catch(() => undefined).then(async () => {
    const url = draftsApiUrl(next.id)
    const data = await readDraftApiJson<{ ok: true; item: DraftAttraction }>(
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...next, updatedAt: Date.now() }),
      }),
      'PUT',
      url,
    )
    return normalizeDraft(data.item)
  })
  pendingSaves.set(next.id, request)
  try {
    return await request
  } finally {
    if (pendingSaves.get(next.id) === request) pendingSaves.delete(next.id)
  }
}

export async function deleteDraft(id: string): Promise<boolean> {
  const url = draftsApiUrl(id)
  const res = await fetch(url, { method: 'DELETE' })
  if (res.status === 404) return false
  await readDraftApiJson<{ ok: true }>(res, 'DELETE', url)
  return true
}

/**
 * 节点文案是否还是新建时的占位内容 —— 「已编辑 / 未编辑」的唯一判定口径。
 * 三种占位：带显式标记、没有任何要点、要点只剩高德自动写入的「地址：」行。
 */
export function isSpotPlaceholder(spot: Spot): boolean {
  const bullets = (spot.slides[0]?.bullets || []).map((b) => b.trim()).filter(Boolean)
  if (bullets.length === 0) return true
  if (bullets.some((b) => b.includes('待完善讲解要点'))) return true
  return bullets.every((b) => b.startsWith('地址：'))
}

export function newSpotAt(pos: LngLat, index: number): Spot {
  const n = index + 1
  return {
    id: `spot-${Date.now().toString(36)}-${n}`,
    name: `节点 ${n}`,
    poetic: '',
    lng: pos.lng,
    lat: pos.lat,
    triggerRadiusMeters: 38,
    image: '/spots/map-intro.jpg',
    imageCredit: '',
    slides: [
      {
        title: `节点 ${n}`,
        bullets: ['待完善讲解要点'],
        narration: `这里是第 ${n} 站。`,
      },
    ],
  }
}

/** 从高德候选地点生成漫游节点（坐标已确定，讲解文案待补） */
export function newSpotFromCandidate(
  poi: { name: string; location: LngLat; address?: string },
  index: number,
): Spot {
  const n = index + 1
  return {
    id: `spot-${Date.now().toString(36)}-${n}`,
    name: poi.name,
    poetic: '',
    lng: poi.location.lng,
    lat: poi.location.lat,
    triggerRadiusMeters: 38,
    image: '/spots/map-intro.jpg',
    imageCredit: '',
    searchHint: poi.name,
    slides: [
      {
        title: poi.name,
        bullets: [poi.address ? `地址：${poi.address}` : '待完善讲解要点'],
        narration: `这里是${poi.name}。`,
      },
    ],
  }
}

function extFromMimeOrRef(ref: string, mime?: string): string {
  if (mime?.includes('png')) return '.png'
  if (mime?.includes('webp')) return '.webp'
  if (mime?.includes('gif')) return '.gif'
  if (mime?.includes('jpeg') || mime?.includes('jpg')) return '.jpg'
  const m = /\.(png|jpe?g|webp|gif)(?:\?|$)/i.exec(ref)
  if (m) return `.${m[1].toLowerCase().replace('jpeg', 'jpg')}`
  if (ref.startsWith('data:image/png')) return '.png'
  if (ref.startsWith('data:image/webp')) return '.webp'
  if (ref.startsWith('data:image/gif')) return '.gif'
  return '.jpg'
}

/** 图片引用 → Blob（支持 data: / http(s) / 站点相对路径） */
async function toBlob(ref: string): Promise<Blob> {
  if (!ref) throw new Error('空图片引用')
  if (ref.startsWith('data:')) {
    const decoded = await fetch(ref)
    if (!decoded.ok) throw new Error('图片解码失败')
    return decoded.blob()
  }
  const url = /^https?:\/\//i.test(ref) ? ref : new URL(ref, window.location.origin).href
  const res = await fetch(url)
  if (!res.ok) throw new Error(`图片读取失败: ${ref} (${res.status})`)
  return res.blob()
}

function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false
  const va = new Uint8Array(a)
  const vb = new Uint8Array(b)
  for (let i = 0; i < va.length; i++) {
    if (va[i] !== vb[i]) return false
  }
  return true
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片编码失败'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 草稿图片 → /spots/<id>/<节点>.<ext> 路径，图片本体另行落盘
 * 同一张图（按字节比较）只留一份引用，避免包内重复
 */
export async function prepareMedia(draft: DraftAttraction): Promise<{
  spots: Spot[]
  coverImage: string
  visitorAvatar?: string
  media: MediaFile[]
}> {
  const media: MediaFile[] = []
  const seen: { sig: string; buffer: ArrayBuffer; publicPath: string }[] = []

  const put = async (logicalName: string, ref: string): Promise<string> => {
    const blob = await toBlob(ref)
    const buffer = await blob.arrayBuffer()
    const sig = `${blob.type}:${buffer.byteLength}`

    const dup = seen.find((c) => c.sig === sig && sameBytes(c.buffer, buffer))
    if (dup) return dup.publicPath

    const relPath = `${draft.id}/${logicalName}${extFromMimeOrRef(ref, blob.type)}`
    const publicPath = `/spots/${relPath}`
    seen.push({ sig, buffer, publicPath })
    media.push({ relPath, publicPath, blob })
    return publicPath
  }

  const spots: Spot[] = []
  for (const spot of draft.spots) {
    const image = await put(spot.id, spot.image || '/spots/map-intro.jpg')
    spots.push({ ...spot, image })
  }

  const coverRef = draft.coverImage || spots[0]?.image || '/spots/map-intro.jpg'
  // 封面若与某个节点同图，复用同一路径
  const coverImage = spots.some((s) => s.image === coverRef) ? coverRef : await put('cover', coverRef)

  // 游客头像：没传就整份不出现，前台照旧用内置吉祥物
  const visitorAvatar = draft.visitorAvatar ? await put('visitor', draft.visitorAvatar) : undefined

  return { spots, coverImage, visitorAvatar, media }
}

/** 故事模式才把 mode/story 写进发布包；打卡包这两个字段一律不出现 */
function storyFields(draft: DraftAttraction): Pick<PublishedAttraction, 'mode' | 'story'> {
  if (draft.mode !== 'story') return {}
  return { mode: 'story', story: draft.story ?? {} }
}

/** 上传过游客头像才把 visitorAvatar 写进发布包 */
function avatarField(visitorAvatar: string | undefined): Pick<PublishedAttraction, 'visitorAvatar'> {
  return visitorAvatar ? { visitorAvatar } : {}
}

/** 作者框过视野中心才写进包；不写 = 前台照旧以游客起点为中心 */
function viewField(view: LngLat | undefined): Pick<PublishedAttraction, 'view'> {
  return view ? { view } : {}
}

/** searchHint 只给发布端检索，不进展示契约 */
function toPublishedSpots(spots: Spot[]): PublishedSpot[] {
  return spots.map((spot) => {
    const published = { ...spot }
    delete published.searchHint
    return published
  })
}

/** 草稿 → 展示端契约发布包（图片为 /spots/... 路径引用，二进制由 media 落盘） */
export async function toPublishedPackage(draft: DraftAttraction): Promise<{
  pkg: PublishedAttraction
  media: MediaFile[]
}> {
  const first = draft.spots[0]
  if (!first) throw new Error('没有节点，无法发布')
  const prepared = await prepareMedia(draft)
  return {
    pkg: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      id: draft.id,
      name: draft.name,
      description: draft.description,
      start: draft.start,
      zoom: draft.zoom || DEFAULT_MAP_ZOOM,
      spots: toPublishedSpots(prepared.spots),
      coverImage: prepared.coverImage,
      publishedAt: Date.now(),
      ...viewField(draft.view),
      ...storyFields(draft),
      ...avatarField(prepared.visitorAvatar),
    },
    media: prepared.media,
  }
}

/** 开发服务不可用时的兜底：把同一批图片内嵌为 data URL，产出单文件包 */
export async function toSelfContainedPackage(draft: DraftAttraction): Promise<PublishedAttraction> {
  const prepared = await prepareMedia(draft)
  const assets: Record<string, string> = {}
  for (const item of prepared.media) {
    assets[item.publicPath] = await blobToDataUrl(item.blob)
  }
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    id: draft.id,
    name: draft.name,
    description: draft.description,
    start: draft.start,
    zoom: draft.zoom || DEFAULT_MAP_ZOOM,
    spots: toPublishedSpots(prepared.spots),
    coverImage: prepared.coverImage,
    publishedAt: Date.now(),
    assets,
    ...viewField(draft.view),
    ...storyFields(draft),
    ...avatarField(prepared.visitorAvatar),
  }
}

export function buildCatalog(packages: PublishedAttraction[]): AttractionCatalog {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    updatedAt: Date.now(),
    items: packages.map(toCatalogItem),
  }
}

/**
 * 发布：图片落成文件、包体写入本应用 public/spots（与前台同一数据源），随后更新服务端草稿状态。
 */
export async function publishDraft(
  id: string,
  opts?: { zoom?: number; start?: LngLat },
): Promise<{
  draft: DraftAttraction
  pkg: PublishedAttraction
  mode: 'config'
  imageCount: number
  targetLabel?: string
} | null> {
  const item = await getDraft(id)
  if (!item || item.spots.length === 0) return null
  const draft = {
    ...item,
    status: 'published' as const,
    start: opts?.start || item.start,
    zoom: typeof opts?.zoom === 'number' && opts.zoom > 0 ? opts.zoom : item.zoom || DEFAULT_MAP_ZOOM,
    coverImage: item.coverImage || item.spots[0].image,
  }
  const { pkg, media } = await toPublishedPackage(draft)
  const written = await exportPackageViaServer(pkg, media)
  const saved = await saveDraft(draft)
  return {
    draft: saved,
    pkg,
    mode: 'config',
    imageCount: media.length,
    targetLabel: written.publicPath,
  }
}
