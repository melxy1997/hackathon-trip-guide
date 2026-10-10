import type { ExperienceDefinitionV1 } from './experienceSchema.ts'
import { isExperienceEvent, type ExperienceEvent } from './events.ts'
import { createStoryState, transition, type ExperienceState } from './storyEngine.ts'

interface Checkpoint {
  schemaVersion: 1
  packageVersion: number
  definition: string
  sessionId: string
  events: ExperienceEvent[]
}
export const sessionKey = (id: string) => `timewalker:session:v1:${id}`

/** Replay checked events instead of trusting editable serialized variables or progress. */
export function restoreSession(raw: string | null, pkg: ExperienceDefinitionV1, packageVersion: number): { state: ExperienceState; events: ExperienceEvent[] } | null {
  if (!raw || raw.length > 1_000_000) return null
  try {
    const c = JSON.parse(raw) as Checkpoint
    if (c.schemaVersion !== 1 || c.packageVersion !== packageVersion || c.definition !== JSON.stringify(pkg) || typeof c.sessionId !== 'string' || !c.sessionId.length || c.sessionId.length > 100 || !Array.isArray(c.events) || c.events.length > 1000) return null
    let state = createStoryState(pkg, c.sessionId)
    for (const event of c.events) {
      if (!isExperienceEvent(event)) return null
      const result = transition(pkg, state, event)
      if (result.state === state || result.diagnostics.length || result.state.phase === 'error') return null
      state = result.state
    }
    return state.phase === 'idle' ? null : { state, events: c.events }
  } catch { return null }
}

export function serializeSession(pkg: ExperienceDefinitionV1, packageVersion: number, state: ExperienceState, events: ExperienceEvent[]): string {
  return JSON.stringify({ schemaVersion: 1, packageVersion, definition: JSON.stringify(pkg), sessionId: state.sessionId, events } satisfies Checkpoint)
}
