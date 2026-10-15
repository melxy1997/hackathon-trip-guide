import type { PublishedAttraction } from '../lib/tourPackage.ts'
import { assertTrail, trailId, type TrailDefinitionV1 } from './trailSchema.ts'
const PREFIX = 'timewalker:trail-draft:v1:'

/** Draft fields may temporarily be empty or have fewer than three stops; validate fully at publish. */
export function getTrailDraft(id: string): TrailDefinitionV1 | null {
  trailId(id)
  try {
    const raw = localStorage.getItem(`${PREFIX}${id}`)
    if (!raw || raw.length > 64_000) return null
    const value = JSON.parse(raw) as TrailDefinitionV1
    if (value?.schemaVersion !== 1 || value.id !== id || typeof value.title !== 'string' || typeof value.description !== 'string'
      || typeof value.baseAttractionId !== 'string' || (value.coverImage !== undefined && typeof value.coverImage !== 'string')
      || (value.relatedExperienceId !== undefined && typeof value.relatedExperienceId !== 'string') || (value.estimatedMinutes !== undefined && typeof value.estimatedMinutes !== 'number')
      || !Array.isArray(value.checkpoints) || value.checkpoints.length > 6
      || value.checkpoints.some(cp => !cp || !['id', 'spotId', 'heading', 'instruction', 'stampLabel'].every(key => typeof cp[key as keyof typeof cp] === 'string'))
      || (value.recommendations !== undefined && (!Array.isArray(value.recommendations) || value.recommendations.length > 1 || value.recommendations.some(rec => !rec || !['id', 'afterCheckpointId', 'title', 'description', 'label'].every(key => typeof rec[key as keyof typeof rec] === 'string') || (rec.href !== undefined && typeof rec.href !== 'string'))))) return null
    trailId(value.baseAttractionId)
    return value
  } catch { return null }
}
export function saveTrailDraft(trail: TrailDefinitionV1): boolean {
  try { trailId(trail.id); const content = JSON.stringify(trail); if (content.length > 64_000) return false; localStorage.setItem(`${PREFIX}${trail.id}`, content); return true } catch { return false }
}
export function listTrailDrafts(): TrailDefinitionV1[] {
  try { return Object.keys(localStorage).filter(key => key.startsWith(PREFIX)).flatMap(key => { const draft = getTrailDraft(key.slice(PREFIX.length)); return draft ? [draft] : [] }) } catch { return [] }
}
export function newTrail(pkg: PublishedAttraction, id = `trail-${crypto.randomUUID()}`): TrailDefinitionV1 {
  return { schemaVersion: 1, id, baseAttractionId: pkg.id, title: `${pkg.name} · 我的主题探索`, description: '按自己的节奏走过目的地，收集一枚枚风景印章。', coverImage: pkg.coverImage, estimatedMinutes: 40,
    checkpoints: pkg.spots.slice(0, 4).map((spot, index) => ({ id: `stop-${index + 1}`, spotId: spot.id, heading: `${index + 1}. ${spot.name}`, instruction: `在${spot.name}留意一处喜欢的细节，再亲手确认完成探索。`, stampLabel: spot.name.slice(0, 20) })) }
}
export function validatedTrailDraft(trail: TrailDefinitionV1, pkg: PublishedAttraction) { return assertTrail(trail, pkg) }
