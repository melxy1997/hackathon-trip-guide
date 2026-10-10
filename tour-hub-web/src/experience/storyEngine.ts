import type { Action, Condition, ExperienceDefinitionV1, Scene, StoryValue } from './experienceSchema.ts'
import type { ExperienceEvent } from './events.ts'

export type StoryPhase = 'idle' | 'awaitingLocation' | 'playing' | 'awaitingInteraction' | 'completed' | 'error'
export interface ExperienceState {
  sessionId: string
  currentSceneId: string | null
  phase: StoryPhase
  variables: Record<string, StoryValue>
  visitedSceneIds: string[]
  visitedSpotIds: string[]
  completedInteractionIds: string[]
  completedBlockIds: string[]
  memoryIds: string[]
  choices: Array<{ interactionId: string; optionId: string; label: string }>
  observations: Array<{ interactionId: string; method: 'manual' }>
  playbackToken: string | null
  lastEventSeq: number
  directorUsed: boolean
}
export type StoryEffect =
  | { type: 'DISPLAY_SCENE'; sceneId: string }
  | { type: 'REQUEST_LOCATION'; spotId: string }
  | { type: 'SAVE_CHECKPOINT' }
  | { type: 'SHOW_ENDING' }
export interface TransitionResult { state: ExperienceState; effects: StoryEffect[]; diagnostics: string[] }

export function createStoryState(pkg: ExperienceDefinitionV1, sessionId: string): ExperienceState {
  return { sessionId, currentSceneId: null, phase: 'idle', variables: { ...pkg.initialVariables }, visitedSceneIds: [], visitedSpotIds: [], completedInteractionIds: [], completedBlockIds: [], memoryIds: [], choices: [], observations: [], playbackToken: null, lastEventSeq: 0, directorUsed: false }
}
const add = (items: string[], id: string) => items.includes(id) ? items : [...items, id]
export const narrationBlocks = (scene: Scene) => scene.blocks.filter(b => b.type === 'narration' || b.type === 'audio')

function matches(c: Condition | undefined, vars: Record<string, StoryValue>): boolean {
  if (!c) return true
  if (c.op === 'eq') return vars[c.var] === c.value
  if (c.op === 'neq') return vars[c.var] !== c.value
  return Array.isArray(c.value) && c.value.includes(vars[c.var])
}

/** Pure reducer: no DOM, timers, storage, network or random IDs. */
export function transition(pkg: ExperienceDefinitionV1, state: ExperienceState, event: ExperienceEvent): TransitionResult {
  const ignored = (message?: string): TransitionResult => ({ state, effects: [], diagnostics: message ? [message] : [] })
  const scene = pkg.scenes.find(s => s.id === state.currentSceneId)
  if (event.type === 'START' && state.phase !== 'idle') return ignored()
  if (event.type !== 'START' && event.type !== 'DIRECTOR_JUMP') {
    if (!scene || event.sceneId !== scene.id || event.token !== state.playbackToken) return ignored()
  }
  let next: ExperienceState = { ...state, lastEventSeq: state.lastEventSeq + 1 }
  const effects: StoryEffect[] = [{ type: 'SAVE_CHECKPOINT' }]
  const error = (message: string): TransitionResult => ({ state: { ...next, phase: 'error' }, effects, diagnostics: [message] })
  const enter = (targetId: string, immediate = false): TransitionResult => {
    const target = pkg.scenes.find(s => s.id === targetId)
    if (!target) return error(`转移目标不存在：${targetId}`)
    const atSpot = !target.spotId || target.spotId === scene?.spotId
    const ready = immediate || atSpot
    next = { ...next, currentSceneId: target.id, playbackToken: `${state.sessionId}:${next.lastEventSeq}:${target.id}`, completedBlockIds: [], phase: ready ? 'playing' : 'awaitingLocation' }
    if (ready) {
      next.visitedSceneIds = add(next.visitedSceneIds, target.id)
      if (target.spotId) next.visitedSpotIds = add(next.visitedSpotIds, target.spotId)
    } else if (target.spotId) effects.push({ type: 'REQUEST_LOCATION', spotId: target.spotId })
    effects.push({ type: 'DISPLAY_SCENE', sceneId: target.id })
    return { state: next, effects, diagnostics: [] }
  }
  const advance = (): TransitionResult => {
    if (!scene) return error('当前场景不存在')
    if (scene.mode === 'ending') {
      next.phase = 'completed'
      effects.push({ type: 'SHOW_ENDING' })
      return { state: next, effects, diagnostics: [] }
    }
    const target = scene.transitions?.find(t => matches(t.when, next.variables))
    return target ? enter(target.to) : error(`scene:${scene.id} 没有可执行的后续转移`)
  }
  const apply = (actions: Action[]): TransitionResult => {
    next.variables = { ...next.variables }
    for (const a of actions) {
      if (a.type === 'setVar') next.variables[a.key] = a.value
      if (a.type === 'revealMemory') next.memoryIds = add(next.memoryIds, a.memoryId)
    }
    const go = actions.find(a => a.type === 'goTo')
    return go?.type === 'goTo' ? enter(go.sceneId) : error('互动缺少目标场景')
  }
  switch (event.type) {
    case 'START': return enter(pkg.initialSceneId, true)
    case 'DIRECTOR_JUMP':
      if (state.phase === 'idle') return ignored('请先开启故事')
      if (!pkg.scenes.some(s => s.id === event.sceneId)) return ignored(`未知导演场景 ${event.sceneId}`)
      next.directorUsed = true
      return enter(event.sceneId, true)
    case 'LOCATION_ENTER':
      if (state.phase !== 'awaitingLocation' || event.spotId !== scene?.spotId) return ignored()
      next.phase = 'playing'
      next.visitedSceneIds = add(state.visitedSceneIds, scene.id)
      next.visitedSpotIds = add(state.visitedSpotIds, event.spotId)
      return { state: next, effects, diagnostics: [] }
    case 'NARRATION_ENDED': {
      if (state.phase !== 'playing' || !scene) return ignored()
      const remaining = narrationBlocks(scene).filter(b => !state.completedBlockIds.includes(b.id))
      if (remaining[0]?.id !== event.blockId) return ignored()
      next.completedBlockIds = add(state.completedBlockIds, event.blockId)
      if (remaining.length > 1) return { state: next, effects, diagnostics: [] }
      if (!scene.interaction) return advance()
      next.phase = 'awaitingInteraction'
      return { state: next, effects, diagnostics: [] }
    }
    case 'SKIP_SCENE':
      if (state.phase !== 'playing' || !scene) return ignored()
      if (scene.interaction) {
        next.phase = 'awaitingInteraction'
        next.completedBlockIds = narrationBlocks(scene).map(b => b.id)
        return { state: next, effects, diagnostics: [] }
      }
      return advance()
    case 'REPLAY_SCENE':
      if (!scene || !['playing', 'awaitingInteraction'].includes(state.phase)) return ignored()
      next.phase = 'playing'
      next.completedBlockIds = []
      next.playbackToken = `${state.sessionId}:${next.lastEventSeq}:${scene.id}`
      return { state: next, effects, diagnostics: [] }
    case 'CHOICE_SELECTED': {
      const it = scene?.interaction
      if (state.phase !== 'awaitingInteraction' || it?.type !== 'single_choice' || it.id !== event.interactionId) return ignored()
      const option = it.options.find(o => o.id === event.optionId)
      if (!option) return ignored(`scene:${scene?.id} 未知选项 ${event.optionId}`)
      next.completedInteractionIds = add(state.completedInteractionIds, it.id)
      next.choices = [...state.choices, { interactionId: it.id, optionId: option.id, label: option.label }]
      return apply(option.actions)
    }
    case 'OBSERVATION_CONFIRMED': {
      const it = scene?.interaction
      if (state.phase !== 'awaitingInteraction' || it?.type !== 'photo_or_tap' || it.id !== event.interactionId) return ignored()
      next.completedInteractionIds = add(state.completedInteractionIds, it.id)
      next.observations = [...state.observations, { interactionId: it.id, method: event.method }]
      return apply(it.actionsOnComplete)
    }
  }
}
