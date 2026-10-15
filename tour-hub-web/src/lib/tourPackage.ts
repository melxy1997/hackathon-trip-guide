/**
 * 导览发布包类型与校验
 * 外部 AI 生产内容请遵循项目 Skill：`.cursor/skills/trip-guide-content/SKILL.md`
 */

import { assertExperience, type ExperienceDefinitionV1 } from '../experience/experienceSchema.ts'
import { assertPresentation, type ExperiencePresentation } from '../experience/presentation.ts'

export const PACKAGE_SCHEMA_VERSION = 1 as const

export interface LngLat {
  lng: number
  lat: number
}

export interface Slide {
  title: string
  bullets: string[]
  narration: string
}

export interface PublishedSpot {
  id: string
  name: string
  poetic: string
  lng: number
  lat: number
  triggerRadiusMeters: number
  image: string
  imageCredit: string
  slides: Slide[]
}

export interface PublishedAttraction {
  relatedTrailId?: string
  presentation?: ExperiencePresentation
  schemaVersion: typeof PACKAGE_SCHEMA_VERSION
  id: string
  name: string
  description: string
  start: LngLat
  zoom: number
  spots: PublishedSpot[]
  coverImage: string
  publishedAt: number
  assets?: Record<string, string>
  routes?: Record<string, LngLat[]>
  experience?: ExperienceDefinitionV1
}

export interface CatalogItem {
  presentation?: ExperiencePresentation
  id: string
  name: string
  description: string
  coverImage: string
  publishedAt: number
  experience?: Pick<ExperienceDefinitionV1, 'title' | 'estimatedMinutes'>
}

export interface AttractionCatalog {
  schemaVersion: typeof PACKAGE_SCHEMA_VERSION
  updatedAt: number
  items: CatalogItem[]
}

export function resolveMediaUrl(
  pkg: Pick<PublishedAttraction, 'assets'> | null | undefined,
  ref: string | undefined | null,
): string {
  if (!ref) return ''
  if (ref.startsWith('data:') || /^https?:\/\//i.test(ref)) return ref
  const fromAssets = pkg?.assets?.[ref]
  if (fromAssets) return fromAssets
  return ref
}

export function toCatalogItem(pkg: PublishedAttraction): CatalogItem {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    coverImage: resolveMediaUrl(pkg, pkg.coverImage),
    publishedAt: pkg.publishedAt,
    ...(pkg.presentation ? { presentation: structuredClone(pkg.presentation) } : {}),
    ...(pkg.experience ? { experience: { title: pkg.experience.title, estimatedMinutes: pkg.experience.estimatedMinutes } } : {}),
  }
}

export function assertPublishedAttraction(raw: unknown): PublishedAttraction {
  if (!raw || typeof raw !== 'object') throw new Error('发布包无效：非对象')
  const p = raw as Partial<PublishedAttraction>
  if (p.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    throw new Error(`发布包 schemaVersion 不支持：${String(p.schemaVersion)}`)
  }
  if (p.relatedTrailId !== undefined && (typeof p.relatedTrailId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(p.relatedTrailId))) throw new Error('关联路线 ID 无效')
  if (!p.id || !p.name) throw new Error('发布包缺少 id/name')
  if (!p.start || typeof p.start.lng !== 'number' || typeof p.start.lat !== 'number') {
    throw new Error('发布包缺少合法 start')
  }
  if (typeof p.zoom !== 'number' || p.zoom <= 0) throw new Error('发布包缺少合法 zoom')
  if (!Array.isArray(p.spots) || p.spots.length === 0) throw new Error('发布包 spots 为空')
  for (const spot of p.spots) {
    if (!spot?.image) throw new Error(`节点 ${spot?.id || '?'} 缺少 image`)
  }
  if (!p.coverImage) throw new Error('发布包缺少 coverImage')
  assertPresentation(p.presentation)
  if (p.experience !== undefined) {
    assertExperience(p.experience, { spotIds: p.spots.map(s => s.id), assets: p.assets })
  }
  return p as PublishedAttraction
}

export function assertAttractionCatalog(raw: unknown): AttractionCatalog {
  if (!raw || typeof raw !== 'object') throw new Error('目录无效：非对象')
  const c = raw as Partial<AttractionCatalog>
  if (c.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    throw new Error(`目录 schemaVersion 不支持：${String(c.schemaVersion)}`)
  }
  if (!Array.isArray(c.items)) throw new Error('目录缺少 items')
  for (const item of c.items) assertPresentation(item.presentation)
  return c as AttractionCatalog
}

/** @deprecated 使用 PACKAGE_SCHEMA_VERSION */
export const CONTRACT_SCHEMA_VERSION = PACKAGE_SCHEMA_VERSION
