import type { DraftAttraction, Spot } from '../types/attraction'
import type { LngLat } from './tourPackage'
import { requestModel } from './modelApi'

const OFFSETS: LngLat[] = [
  { lng: -0.00035, lat: 0.00012 },
  { lng: -0.00015, lat: 0.00035 },
  { lng: 0.00018, lat: -0.00008 },
  { lng: 0.00005, lat: 0.00048 },
  { lng: 0.00055, lat: -0.00055 },
]

type AiSpotDraft = {
  name: string
  poetic?: string
  searchHint?: string
  slides?: Array<{
    title?: string
    bullets?: string[]
    narration?: string
  }>
}

export type GenerateDraftInput = Pick<
  DraftAttraction,
  'name' | 'description' | 'start' | 'city' | 'amapContext'
>

function mockSpots(attraction: GenerateDraftInput): Spot[] {
  const base = attraction.name.replace(/\s+/g, '') || '景点'
  const fromContext =
    attraction.amapContext
      ?.split('\n')
      .filter((l) => /^\d+\./.test(l.trim()))
      .map((l) => l.replace(/^\d+\.\s*/, '').split(' · ')[0]?.trim())
      .filter(Boolean) || []
  const names =
    fromContext.length >= 3
      ? fromContext.slice(0, 5)
      : [`${base}入口`, `${base}主景`, `${base}庭院`, `${base}碑亭`, `${base}出口`]
  const count = Math.min(5, Math.max(3, names.length))
  const center = attraction.start
  return Array.from({ length: count }, (_, i) => {
    const off = OFFSETS[i % OFFSETS.length]
    const name = names[i]
    return {
      id: `draft-${Date.now().toString(36)}-${i}`,
      name,
      poetic: `${attraction.name} · 第 ${i + 1} 站`,
      lng: center.lng + off.lng,
      lat: center.lat + off.lat,
      triggerRadiusMeters: 38,
      image: '/spots/map-intro.jpg',
      imageCredit: '',
      searchHint: `${attraction.city || ''} ${attraction.name} ${name}`.trim(),
      slides: [
        {
          title: name,
          bullets: [
            attraction.description.slice(0, 36) || `${attraction.name}的重要停驻点`,
            '可结合高德地点信息完善讲解',
            '地图上可拖动校准坐标',
          ],
          narration: `欢迎来到${attraction.name}。我们现在来到${name}，请稍作停留，感受这里的气息。`,
        },
      ],
    }
  })
}

function toSpots(attraction: GenerateDraftInput, drafts: AiSpotDraft[]): Spot[] {
  const center = attraction.start
  return drafts.slice(0, 8).map((d, i) => {
    const off = OFFSETS[i % OFFSETS.length]
    const name = (d.name || `节点 ${i + 1}`).trim()
    const slide = d.slides?.[0]
    const hint = (
      d.searchHint ||
      `${attraction.city || ''} ${attraction.name} ${name}`.trim()
    ).trim()
    return {
      id: `draft-${Date.now().toString(36)}-${i}`,
      name,
      poetic: (d.poetic || `${attraction.name} · 第 ${i + 1} 站`).trim(),
      lng: center.lng + off.lng,
      lat: center.lat + off.lat,
      triggerRadiusMeters: 38,
      image: '/spots/map-intro.jpg',
      imageCredit: '',
      searchHint: hint,
      slides: [
        {
          title: (slide?.title || name).trim(),
          bullets:
            Array.isArray(slide?.bullets) && slide!.bullets!.length > 0
              ? slide!.bullets!.map((b) => String(b).trim()).filter(Boolean).slice(0, 5)
              : [`${name}是${attraction.name}的重要停驻点`],
          narration: (
            slide?.narration || `欢迎来到${attraction.name}。这里是${name}，请稍作停留。`
          ).trim(),
        },
      ],
    } as Spot
  })
}

/** Private model calls go through the server. Offline placeholders remain explicit. */
export async function generateDraftSpots(attraction: GenerateDraftInput): Promise<{ spots: Spot[]; mode: 'online' | 'template' }> {
  try {
    const result = await requestModel<{ spots: AiSpotDraft[] }>('/api/draft/spots', attraction)
    return { spots: toSpots(attraction, result.spots), mode: 'online' }
  } catch {
    return { spots: mockSpots(attraction), mode: 'template' }
  }
}
