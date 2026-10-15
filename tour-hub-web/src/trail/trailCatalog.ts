import { loadPublishedAttraction } from '../lib/catalog.ts'
import { assertTrail, trailId, type TrailCatalogItem } from './trailSchema.ts'

export async function loadTrail(id: string) {
  trailId(id)
  const response = await fetch(`/data/trails/${id}.json`, { cache: 'no-cache' })
  if (!response.ok) throw new Error('路线尚未发布或无法加载。')
  const trail = assertTrail(await response.json())
  const pkg = await loadPublishedAttraction(trail.baseAttractionId)
  return { trail: assertTrail(trail, pkg), pkg }
}
export async function loadTrailCatalog(): Promise<TrailCatalogItem[]> {
  const response = await fetch('/data/trails/catalog.json', { cache: 'no-cache' })
  if (!response.ok) throw new Error('路线目录暂不可用。')
  const raw = await response.json()
  if (raw?.schemaVersion !== 1 || !Array.isArray(raw.items) || raw.items.length > 100) throw new Error('路线目录格式无效。')
  return raw.items.map((item: TrailCatalogItem) => {
    trailId(item.id); trailId(item.baseAttractionId)
    if (typeof item.title !== 'string' || !item.title.trim() || typeof item.description !== 'string' || !Number.isInteger(item.checkpointCount) || item.checkpointCount < 3 || item.checkpointCount > 6) throw new Error('路线目录条目无效。')
    return item
  })
}
