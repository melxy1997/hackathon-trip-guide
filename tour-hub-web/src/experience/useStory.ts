import { useEffect, useReducer } from 'react'
import type { PublishedAttraction } from '../lib/tourPackage'
import type { ExperienceDefinitionV1 } from './experienceSchema'
import type { ExperienceEvent } from './events'
import { createStoryState, transition, type ExperienceState } from './storyEngine'
import { restoreSession, serializeSession, sessionKey } from './sessionStore'

type Session = { state: ExperienceState; events: ExperienceEvent[]; diagnostics: string[]; resumed: boolean }
type Command = ExperienceEvent | { type: 'RESET'; sessionId: string }
const fresh = (definition: ExperienceDefinitionV1, sessionId: string): Session => ({ state: createStoryState(definition, sessionId), events: [], diagnostics: [], resumed: false })

export function useStory(pkg: PublishedAttraction & { experience: ExperienceDefinitionV1 }, preview: boolean) {
  const definition = pkg.experience
  const [session, dispatch] = useReducer((session: Session, event: Command): Session => {
    if (event.type === 'RESET') return fresh(definition, event.sessionId)
    const result = transition(definition, session.state, event)
    if (result.state === session.state && !result.diagnostics.length) return session
    return { ...session, state: result.state, diagnostics: result.diagnostics, events: result.state === session.state ? session.events : [...session.events, event] }
  }, undefined, () => {
    if (!preview) {
      try {
        const restored = restoreSession(localStorage.getItem(sessionKey(pkg.id)), definition, pkg.publishedAt)
        if (restored) return { ...restored, diagnostics: [], resumed: true }
      } catch { /* Storage unavailable: the in-memory story still works. */ }
    }
    return fresh(definition, crypto.randomUUID())
  })
  useEffect(() => {
    if (preview) return
    try {
      if (session.state.phase === 'idle') localStorage.removeItem(sessionKey(pkg.id))
      else localStorage.setItem(sessionKey(pkg.id), serializeSession(definition, pkg.publishedAt, session.state, session.events))
    } catch { /* Never block the story for a full or disabled browser store. */ }
  }, [session, definition, pkg.id, pkg.publishedAt, preview])
  return { ...session, dispatch, reset: () => dispatch({ type: 'RESET', sessionId: crypto.randomUUID() }) }
}
