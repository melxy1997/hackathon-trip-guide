export type SceneEvent = { sceneId: string; token: string }
export type ExperienceEvent =
  | { type: 'START' }
  | ({ type: 'LOCATION_ENTER'; spotId: string; source: 'simulated' } & SceneEvent)
  | ({ type: 'NARRATION_ENDED'; blockId: string } & SceneEvent)
  | ({ type: 'CHOICE_SELECTED'; interactionId: string; optionId: string } & SceneEvent)
  | ({ type: 'OBSERVATION_CONFIRMED'; interactionId: string; method: 'manual' } & SceneEvent)
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
    case 'OBSERVATION_CONFIRMED': return typeof e.interactionId === 'string' && e.method === 'manual'
    case 'SKIP_SCENE':
    case 'REPLAY_SCENE': return true
    default: return false
  }
}
