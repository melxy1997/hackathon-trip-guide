import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStoryState, transition } from '../storyEngine.ts'
import { fixture, sceneEvent } from './fixtures.ts'
import type { ExperienceEvent } from '../events.ts'

for (const branch of ['nature', 'craft'] as const) test(`complete ${branch} path with honest visited spots and memory`, () => {
  const { definition } = fixture()
  let state = createStoryState(definition, branch)
  const send = (e: ExperienceEvent) => { const result = transition(definition, state, e); assert.deepEqual(result.diagnostics, []); state = result.state }
  send({ type: 'START' })
  assert.equal(state.phase, 'playing')
  send({ type: 'SKIP_SCENE', ...sceneEvent(state) })
  assert.equal(state.phase, 'awaitingLocation')
  assert.deepEqual(state.visitedSpotIds, ['san-sui-tang'])
  send({ type: 'LOCATION_ENTER', spotId: 'da-jia-shan', source: 'simulated', ...sceneEvent(state) })
  send({ type: 'NARRATION_ENDED', blockId: 'rockery-voice', ...sceneEvent(state) })
  const choice: ExperienceEvent = { type: 'CHOICE_SELECTED', interactionId: 'aesthetic-choice', optionId: branch, ...sceneEvent(state) }
  send(choice)
  assert.equal(state.currentSceneId, `jade-${branch}`)
  assert.equal(state.variables.aestheticLens, branch)
  const afterChoice = state
  send(choice)
  assert.equal(state, afterChoice, 'double-click does not transition twice')
  send({ type: 'LOCATION_ENTER', spotId: 'yu-ling-long', source: 'simulated', ...sceneEvent(state) })
  send({ type: 'SKIP_SCENE', ...sceneEvent(state) })
  const observation: ExperienceEvent = { type: 'OBSERVATION_CONFIRMED', interactionId: branch === 'nature' ? 'jade-observation-n' : 'jade-observation-c', method: 'manual', ...sceneEvent(state) }
  send(observation)
  const afterObservation = state
  send(observation)
  assert.equal(state, afterObservation)
  assert.equal(state.variables.observedJade, true)
  assert.deepEqual(state.memoryIds, ['jade-observed'])
  send({ type: 'LOCATION_ENTER', spotId: 'dian-chun-tang', source: 'simulated', ...sceneEvent(state) })
  send({ type: 'NARRATION_ENDED', blockId: 'ending-voice', ...sceneEvent(state) })
  assert.equal(state.phase, 'completed')
  assert.deepEqual(state.visitedSceneIds, ['prologue', 'rockery', `jade-${branch}`, 'epilogue'])
  assert.deepEqual(state.visitedSpotIds, ['san-sui-tang', 'da-jia-shan', 'yu-ling-long', 'dian-chun-tang'])
  assert.equal(state.choices[0].optionId, branch)
  assert.equal(state.observations[0].method, 'manual')
})
test('stale media/choice/location events cannot advance a new scene instance', () => {
  const { definition } = fixture()
  const first = transition(definition, createStoryState(definition, 'test'), { type: 'START' }).state
  const jumped = transition(definition, first, { type: 'DIRECTOR_JUMP', sceneId: 'epilogue' }).state
  assert.equal(jumped.directorUsed, true)
  assert.equal(transition(definition, jumped, { type: 'NARRATION_ENDED', blockId: 'opening-voice', ...sceneEvent(first) }).state, jumped)
  const restarted = transition(definition, createStoryState(definition, 'new-session'), { type: 'START' }).state
  assert.equal(transition(definition, restarted, { type: 'SKIP_SCENE', ...sceneEvent(first) }).state, restarted)
})
test('skip on required choice exposes interaction without silently choosing a default', () => {
  const { definition } = fixture()
  const start = transition(definition, createStoryState(definition, 'test'), { type: 'START' }).state
  const rockery = transition(definition, start, { type: 'DIRECTOR_JUMP', sceneId: 'rockery' }).state
  const next = transition(definition, rockery, { type: 'SKIP_SCENE', ...sceneEvent(rockery) }).state
  assert.equal(next.phase, 'awaitingInteraction')
  assert.equal(next.variables.aestheticLens, 'unset')
  assert.equal(transition(definition, next, { type: 'SKIP_SCENE', ...sceneEvent(next) }).state, next)
  assert.match(transition(definition, next, { type: 'CHOICE_SELECTED', interactionId: 'aesthetic-choice', optionId: 'bad', ...sceneEvent(next) }).diagnostics[0], /未知选项/)
})
test('multiple narration blocks play in order and ignore duplicate completions', () => {
  const { definition } = fixture()
  definition.scenes[0].blocks.push({ id: 'second-voice', type: 'narration', text: '第二段', fictional: true })
  const start = transition(definition, createStoryState(definition, 'test'), { type: 'START' }).state
  const event: ExperienceEvent = { type: 'NARRATION_ENDED', blockId: 'opening-voice', ...sceneEvent(start) }
  const next = transition(definition, start, event).state
  assert.equal(next.currentSceneId, 'prologue')
  assert.equal(transition(definition, next, event).state, next)
  assert.equal(transition(definition, next, { type: 'NARRATION_ENDED', blockId: 'second-voice', ...sceneEvent(next) }).state.currentSceneId, 'rockery')
})
test('wrong location and completed-state controls are inert', () => {
  const { definition } = fixture()
  const first = transition(definition, createStoryState(definition, 'test'), { type: 'START' }).state
  const pending = transition(definition, first, { type: 'SKIP_SCENE', ...sceneEvent(first) }).state
  assert.equal(transition(definition, pending, { type: 'LOCATION_ENTER', spotId: 'yu-ling-long', source: 'simulated', ...sceneEvent(pending) }).state, pending)
  const ending = transition(definition, pending, { type: 'DIRECTOR_JUMP', sceneId: 'epilogue' }).state
  const done = transition(definition, ending, { type: 'SKIP_SCENE', ...sceneEvent(ending) }).state
  assert.equal(transition(definition, done, { type: 'SKIP_SCENE', ...sceneEvent(done) }).state, done)
  assert.equal(transition(definition, done, { type: 'START' }).state, done)
})
test('first matching declarative condition wins; invalid target reports an error', () => {
  const { definition } = fixture()
  definition.scenes[0].transitions = [{ when: { var: 'aestheticLens', op: 'in', value: ['unset', 'nature'] }, to: 'rockery' }, { to: 'epilogue' }]
  const first = transition(definition, createStoryState(definition, 'test'), { type: 'START' }).state
  assert.equal(transition(definition, first, { type: 'SKIP_SCENE', ...sceneEvent(first) }).state.currentSceneId, 'rockery')
  definition.scenes[0].transitions = [{ to: 'missing' }]
  assert.equal(transition(definition, first, { type: 'SKIP_SCENE', ...sceneEvent(first) }).state.phase, 'error')
})

test('replaying a scene invalidates old callbacks and director reentry allows a fresh choice', () => {
  const { definition } = fixture()
  const first = transition(definition, createStoryState(definition, 'test'), { type: 'START' }).state
  const rockery = transition(definition, first, { type: 'DIRECTOR_JUMP', sceneId: 'rockery' }).state
  const awaiting = transition(definition, rockery, { type: 'SKIP_SCENE', ...sceneEvent(rockery) }).state
  const replayed = transition(definition, awaiting, { type: 'REPLAY_SCENE', ...sceneEvent(awaiting) }).state
  assert.equal(replayed.phase, 'playing')
  assert.notEqual(replayed.playbackToken, awaiting.playbackToken)
  assert.equal(transition(definition, replayed, { type: 'NARRATION_ENDED', blockId: 'rockery-voice', ...sceneEvent(rockery) }).state, replayed)
  const choose = transition(definition, replayed, { type: 'SKIP_SCENE', ...sceneEvent(replayed) }).state
  const nature = transition(definition, choose, { type: 'CHOICE_SELECTED', interactionId: 'aesthetic-choice', optionId: 'nature', ...sceneEvent(choose) }).state
  const revisit = transition(definition, nature, { type: 'DIRECTOR_JUMP', sceneId: 'rockery' }).state
  const chooseAgain = transition(definition, revisit, { type: 'SKIP_SCENE', ...sceneEvent(revisit) }).state
  const craft = transition(definition, chooseAgain, { type: 'CHOICE_SELECTED', interactionId: 'aesthetic-choice', optionId: 'craft', ...sceneEvent(chooseAgain) }).state
  assert.equal(craft.variables.aestheticLens, 'craft')
  assert.equal(craft.choices.length, 2, 'journal records both actual director choices')
})
