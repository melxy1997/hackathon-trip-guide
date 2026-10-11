export type SceneEvent = { sceneId: string; token: string }
export type Discovery = { x?: number; y?: number; category: 'shape' | 'light' | 'detail'; note?: string }
export function isDiscovery(raw: unknown): raw is Discovery {
  if (!raw || typeof raw !== 'object') return false
  const d = raw as Record<string, unknown>
  const point = typeof d.x === 'number' && Number.isFinite(d.x) && d.x >= 0 && d.x <= 1
    && typeof d.y === 'number' && Number.isFinite(d.y) && d.y >= 0 && d.y <= 1
  return (point || (d.x === undefined && d.y === undefined))
    && typeof d.category === 'string' && ['shape', 'light', 'detail'].includes(d.category)
    && (d.note === undefined || (typeof d.note === 'string' && d.note.length <= 120))
    && (point || (typeof d.note === 'string' && !!d.note.trim()))
}
export type ExperienceEvent =
  | { type: 'START' }
  | ({ type: 'LOCATION_ENTER'; spotId: string; source: 'simulated' } & SceneEvent)
  | ({ type: 'NARRATION_ENDED'; blockId: string } & SceneEvent)
  | ({ type: 'CHOICE_SELECTED'; interactionId: string; optionId: string } & SceneEvent)
  | ({ type: 'OBSERVATION_CONFIRMED'; interactionId: string; method: 'manual'; discovery?: Discovery } & SceneEvent)
  | ({ type: 'SKIP_SCENE' } & SceneEvent)
  | ({ type: 'REPLAY_SCENE' } & SceneEvent)
  | { type: 'DIRECTOR_JUMP'; sceneId: string }

export function isExperienceEvent(raw: unknown): raw is ExperienceEvent {
  if (!raw || typeof raw !== 'object') return false
  const e = raw as Record<string, unknown>
  if (e.type === 'START') return true
  if (e.type === 'DIRECTOR_JUMP') return typeof e.sceneId === 'string'
  if (typeof e.sceneId !== 'string' || typeof e.token !== 'string') return false
  switch (e.type) {
    case 'LOCATION_ENTER': return typeof e.spotId === 'string' && e.source === 'simulated'
    case 'NARRATION_ENDED': return typeof e.blockId === 'string'
    case 'CHOICE_SELECTED': return typeof e.interactionId === 'string' && typeof e.optionId === 'string'
    case 'OBSERVATION_CONFIRMED': return typeof e.interactionId === 'string' && e.method === 'manual' && (e.discovery === undefined || isDiscovery(e.discovery))
    case 'SKIP_SCENE':
    case 'REPLAY_SCENE': return true
    default: return false
  }
}
