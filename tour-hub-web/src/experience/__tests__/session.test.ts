import { test } from 'node:test'
import assert from 'node:assert/strict'
import { restoreSession, serializeSession } from '../sessionStore.ts'
import { createStoryState, transition } from '../storyEngine.ts'
import { fixture, sceneEvent } from './fixtures.ts'
import type { ExperienceEvent } from '../events.ts'

test('checkpoint resumes pending location by deterministic replay', () => {
  const { pkg, definition } = fixture()
  let state = createStoryState(definition, 'resume-test')
  const events: ExperienceEvent[] = [{ type: 'START' }]
  state = transition(definition, state, events[0]).state
  events.push({ type: 'SKIP_SCENE', ...sceneEvent(state) })
  state = transition(definition, state, events[1]).state
  const serialized = serializeSession(definition, pkg.publishedAt, state, events)
  assert.deepEqual(restoreSession(serialized, definition, pkg.publishedAt)?.state, state)
  assert.equal(restoreSession(serialized, definition, pkg.publishedAt + 1), null)
  const changed = structuredClone(definition)
  changed.scenes[0].title = '新版本'
  assert.equal(restoreSession(serialized, changed, pkg.publishedAt), null)
  const bad = JSON.parse(serialized)
  bad.events.push({ type: 'CHOICE_SELECTED', sceneId: 'rockery', token: 'fake', interactionId: 'aesthetic-choice', optionId: 'craft' })
  assert.equal(restoreSession(JSON.stringify(bad), definition, pkg.publishedAt), null)
})
test('malformed, unsupported and oversized checkpoints do not break startup', () => {
  const { pkg, definition } = fixture()
  for (const raw of [null, 'invalid json', '{}', JSON.stringify({ schemaVersion: 2 }), 'a'.repeat(1_000_001)]) assert.equal(restoreSession(raw, definition, pkg.publishedAt), null)
})
