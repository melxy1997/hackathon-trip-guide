import type { PublishedAttraction } from '../lib/tourPackage.ts'
import { safeAssetUrl } from '../experience/experienceSchema.ts'

export interface TrailDefinitionV1 {
  schemaVersion: 1
  id: string
  baseAttractionId: string
  title: string
  description: string
  coverImage?: string
  estimatedMinutes?: number
  relatedExperienceId?: string
  publishedAt?: number
  checkpoints: Array<{ id: string; spotId: string; heading: string; instruction: string; stampLabel: string }>
  recommendations?: Array<{ id: string; afterCheckpointId: string; title: string; description: string; label: 'editorial' | 'demo_promotion' | 'sponsored'; href?: string }>
}
export type TrailCatalogItem = Pick<TrailDefinitionV1, 'id' | 'baseAttractionId' | 'title' | 'description' | 'coverImage' | 'estimatedMinutes' | 'publishedAt'> & { checkpointCount: number }
const object = (raw: unknown): raw is Record<string, unknown> => !!raw && typeof raw === 'object' && !Array.isArray(raw)
const fail = (message: string): never => { throw new Error(`路线校验：${message}`) }
export function trailId(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(raw) || ['__proto__', 'prototype', 'constructor'].includes(raw)) return fail('ID 无效。')
  return raw
}
function text(raw: unknown, max: number, label: string): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > max) return fail(`${label}需要 1–${max} 字。`)
  return raw.trim()
}
function strict(raw: unknown, keys: string[]): Record<string, unknown> {
  if (!object(raw) || Object.keys(raw).some(key => !keys.includes(key))) return fail('对象或字段无效。')
  return raw
}
export function trailHref(raw: unknown): string {
  const href = text(raw, 2000, '推荐链接')
  // Internal links are limited to product detail pages, not arbitrary scripts or relative navigation.
  if (/^\/(?:experience|trail|tour)\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(href)) return href
  try { const url = new URL(href); if (url.protocol === 'https:' && !url.username && !url.password) return href } catch { /* explicit error below */ }
  return fail('推荐链接需为无凭据 HTTPS 或本站体验详情。')
}
export function assertTrail(raw: unknown, pkg?: PublishedAttraction): TrailDefinitionV1 {
  const value = strict(raw, ['schemaVersion', 'id', 'baseAttractionId', 'title', 'description', 'coverImage', 'estimatedMinutes', 'relatedExperienceId', 'publishedAt', 'checkpoints', 'recommendations'])
  if (value.schemaVersion !== 1) fail('只支持 schemaVersion=1。')
  const result: TrailDefinitionV1 = { schemaVersion: 1, id: trailId(value.id), baseAttractionId: trailId(value.baseAttractionId), title: text(value.title, 100, '路线标题'), description: text(value.description, 1000, '路线简介'), checkpoints: [] }
  if (pkg && pkg.id !== result.baseAttractionId) fail('路线与基础景点包不匹配。')
  if (!Array.isArray(value.checkpoints) || value.checkpoints.length < 3 || value.checkpoints.length > 6) fail('请选择 3–6 个不重复地点。')
  result.checkpoints = (value.checkpoints as unknown[]).map(rawCheckpoint => {
    const cp = strict(rawCheckpoint, ['id', 'spotId', 'heading', 'instruction', 'stampLabel'])
    const checkpoint = { id: trailId(cp.id), spotId: trailId(cp.spotId), heading: text(cp.heading, 100, '站点标题'), instruction: text(cp.instruction, 600, '站点说明'), stampLabel: text(cp.stampLabel, 20, '印章') }
    if (pkg && !pkg.spots.some(spot => spot.id === checkpoint.spotId)) fail(`未知地点 ${checkpoint.spotId}。`)
    return checkpoint
  })
  for (const key of ['id', 'spotId'] as const) if (new Set(result.checkpoints.map(cp => cp[key])).size !== result.checkpoints.length) fail('站点 ID 或地点重复。')
  if (value.coverImage !== undefined) {
    const ref = text(value.coverImage, 2000, '封面')
    if (!safeAssetUrl(pkg?.assets?.[ref] ?? ref, 'image')) fail('封面引用无效。')
    result.coverImage = ref
  }
  if (value.estimatedMinutes !== undefined) {
    if (!Number.isInteger(value.estimatedMinutes) || (value.estimatedMinutes as number) < 1 || (value.estimatedMinutes as number) > 480) fail('参考时长需为 1–480 分钟。')
    result.estimatedMinutes = value.estimatedMinutes as number
  }
  if (value.relatedExperienceId !== undefined) result.relatedExperienceId = trailId(value.relatedExperienceId)
  if (value.publishedAt !== undefined) {
    if (!Number.isSafeInteger(value.publishedAt) || (value.publishedAt as number) < 0) fail('发布时间无效。')
    result.publishedAt = value.publishedAt as number
  }
  if (value.recommendations !== undefined) {
    if (!Array.isArray(value.recommendations) || value.recommendations.length > 1) fail('首版最多配置一个可选推荐。')
    result.recommendations = (value.recommendations as unknown[]).map(rawRecommendation => {
      const rec = strict(rawRecommendation, ['id', 'afterCheckpointId', 'title', 'description', 'label', 'href'])
      const checkpointId = trailId(rec.afterCheckpointId)
      if (!result.checkpoints.some(cp => cp.id === checkpointId)) fail('推荐所关联的站点不存在。')
      if (!['editorial', 'demo_promotion', 'sponsored'].includes(rec.label as string)) fail('推荐标记无效。')
      return { id: trailId(rec.id), afterCheckpointId: checkpointId, title: text(rec.title, 100, '推荐标题'), description: text(rec.description, 600, '推荐说明'), label: rec.label as 'editorial' | 'demo_promotion' | 'sponsored', ...(rec.href !== undefined ? { href: trailHref(rec.href) } : {}) }
    })
  }
  return result
}
export function trailCatalogItem(trail: TrailDefinitionV1): TrailCatalogItem {
  const { id, baseAttractionId, title, description, coverImage, estimatedMinutes, publishedAt } = trail
  return { id, baseAttractionId, title, description, ...(coverImage ? { coverImage } : {}), ...(estimatedMinutes ? { estimatedMinutes } : {}), ...(publishedAt !== undefined ? { publishedAt } : {}), checkpointCount: trail.checkpoints.length }
}
export function trailFingerprint(trail: TrailDefinitionV1): string {
  let hash = 2166136261
  for (const char of JSON.stringify(assertTrail(trail))) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  return hash.toString(16)
}
