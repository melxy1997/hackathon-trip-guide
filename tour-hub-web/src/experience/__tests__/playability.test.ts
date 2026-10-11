import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDiscovery, isExperienceEvent, type Discovery, type ExperienceEvent } from '../events.ts'
import { assertExperience } from '../experienceSchema.ts'
import { journeyProgress, journeyTitle, journalSvg, journalText } from '../journey.ts'
import { createStoryState, transition } from '../storyEngine.ts'
import { restoreSession, serializeSession } from '../sessionStore.ts'
import { fixture, sceneEvent } from './fixtures.ts'

function atObservation() {
  const { pkg, definition } = fixture()
  let state = createStoryState(definition, 'discovery-test')
  const events: ExperienceEvent[] = []
  const send = (event: ExperienceEvent) => { events.push(event); const result = transition(definition, state, event); assert.deepEqual(result.diagnostics, []); state = result.state }
  send({ type: 'START' })
  send({ type: 'SKIP_SCENE', ...sceneEvent(state) })
  send({ type: 'LOCATION_ENTER', spotId: 'da-jia-shan', source: 'simulated', ...sceneEvent(state) })
  send({ type: 'SKIP_SCENE', ...sceneEvent(state) })
  send({ type: 'CHOICE_SELECTED', interactionId: 'aesthetic-choice', optionId: 'nature', ...sceneEvent(state) })
  send({ type: 'LOCATION_ENTER', spotId: 'yu-ling-long', source: 'simulated', ...sceneEvent(state) })
  send({ type: 'SKIP_SCENE', ...sceneEvent(state) })
  return { pkg, definition, events, state }
}

test('personal discovery is copied into real observation state; duplicates and stale tokens cannot replace it', () => {
  const { definition, state } = atObservation()
  const discovery: Discovery = { x: .4, y: .6, category: 'light', note: '  光从石头中穿过。  ' }
  const event: ExperienceEvent = { type: 'OBSERVATION_CONFIRMED', interactionId: 'jade-observation-n', method: 'manual', discovery, ...sceneEvent(state) }
  const next = transition(definition, state, event).state
  assert.deepEqual(next.observations[0].discovery, { x: .4, y: .6, category: 'light', note: '光从石头中穿过。' })
  discovery.note = '后来改写的外部对象'
  assert.equal(next.observations[0].discovery?.note, '光从石头中穿过。')
  assert.equal(transition(definition, next, event).state, next)
  const replayed = transition(definition, state, { type: 'REPLAY_SCENE', ...sceneEvent(state) }).state
  assert.equal(transition(definition, replayed, event).state, replayed)
})
test('text-only discovery and legacy manual confirmation remain valid without a photo or point', () => {
  const { definition, state } = atObservation()
  const event = { type: 'OBSERVATION_CONFIRMED' as const, interactionId: 'jade-observation-n', method: 'manual' as const, ...sceneEvent(state) }
  const legacy = transition(definition, state, event).state
  assert.deepEqual(legacy.observations, [{ interactionId: 'jade-observation-n', method: 'manual' }])
  const text = transition(definition, state, { ...event, discovery: { category: 'detail', note: '这段风景让我想到家人。' } }).state
  assert.equal(text.observations[0].discovery?.x, undefined)
  assert.equal(text.observations[0].discovery?.note, '这段风景让我想到家人。')
})
test('untrusted coordinates, missing pairs, empty discoveries and overlong notes are rejected before state changes', () => {
  const { definition, state } = atObservation()
  const invalid = [
    { x: -.1, y: .5, category: 'detail' }, { x: .1, y: Infinity, category: 'detail' },
    { x: .1, category: 'detail', note: 'a' }, { x: 2, y: .5, category: 'detail' },
    { category: 'unknown', note: 'a' }, { category: 'light', note: 'a'.repeat(121) },
    { x: .5, y: .5, category: ['detail'] },
    { category: 'detail', note: '  ' }, { category: 'detail' },
  ]
  for (const discovery of invalid) {
    assert.equal(isDiscovery(discovery), false)
    const event = { type: 'OBSERVATION_CONFIRMED', interactionId: 'jade-observation-n', method: 'manual', ...sceneEvent(state), discovery }
    assert.equal(isExperienceEvent(event), false)
    const result = transition(definition, state, event as ExperienceEvent)
    assert.equal(result.state, state); assert.match(result.diagnostics[0], /观察记录无效/)
  }
})
test('confirmed discoveries survive checkpoint replay; corrupted discovery data resets session safely', () => {
  const { pkg, definition, events, state } = atObservation()
  const event: ExperienceEvent = { type: 'OBSERVATION_CONFIRMED', interactionId: 'jade-observation-n', method: 'manual', ...sceneEvent(state), discovery: { x: .2, y: .8, category: 'shape', note: '像山的轮廓。' } }
  const next = transition(definition, state, event).state
  const raw = serializeSession(definition, pkg.publishedAt, next, [...events, event])
  assert.deepEqual(restoreSession(raw, definition, pkg.publishedAt)?.state, next)
  const broken = JSON.parse(raw); broken.events.at(-1).discovery.x = -1
  assert.equal(restoreSession(JSON.stringify(broken), definition, pkg.publishedAt), null)
})
test('progress and playthrough title come from actual visits and choices, not all package POIs or presets', () => {
  const { definition, state } = atObservation()
  assert.deepEqual(journeyProgress(definition, state), { spotIds: ['san-sui-tang', 'da-jia-shan', 'yu-ling-long', 'dian-chun-tang'], visited: 3, total: 4 })
  assert.equal(journeyTitle(state), '山林寻趣者')
  const initial = createStoryState(definition, 'initial')
  initial.variables.aestheticLens = 'craft'
  assert.equal(journeyTitle(initial), '章节体验者', 'a variable alone does not fabricate a choice')
})
test('saved card and shared text contain personal discovery, escape markup and use no remote resources', () => {
  const { definition, state } = atObservation()
  definition.title = '<script>alert("标题")</script>'
  const event: ExperienceEvent = { type: 'OBSERVATION_CONFIRMED', interactionId: 'jade-observation-n', method: 'manual', ...sceneEvent(state), discovery: { category: 'detail', note: '<image href="https://evil.example"/> & 亲人的信\u0000\ud800' } }
  const next = transition(definition, state, event).state
  const svg = journalSvg(definition, next)
  assert.match(svg, /&lt;script&gt;/); assert.doesNotMatch(svg.match(/<[^>]+>/g)!.join(''), /<script|<image|foreignObject|href=/)
  assert.ok(!svg.includes('\u0000') && !svg.includes('\ud800'))
  assert.match(svg, /亲人的信/)
  const shared = journalText(definition, next)
  assert.match(shared, /亲人的信/); assert.match(shared, /人工确认/); assert.match(shared, /山林野趣/)
})
test('director-only ending keeps export honest and does not award unseen choices or observations', () => {
  const { definition } = fixture()
  let state = transition(definition, createStoryState(definition, 'director'), { type: 'START' }).state
  state = transition(definition, state, { type: 'DIRECTOR_JUMP', sceneId: 'epilogue' }).state
  state = transition(definition, state, { type: 'SKIP_SCENE', ...sceneEvent(state) }).state
  const text = journalText(definition, state)
  assert.match(text, /使用过导演跳幕/); assert.match(text, /尚未完成观察/); assert.match(text, /尚未留下选择/)
  assert.equal(journeyTitle(state), '章节体验者'); assert.doesNotMatch(journalSvg(definition, state), /山林寻趣者|匠心寻迹者/)
})
test('choice descriptions are optional, bounded and validated through the shared contract', () => {
  const { pkg, definition } = fixture()
  const scene = definition.scenes.find(s => s.interaction?.type === 'single_choice')!
  assert.ok(scene.interaction?.type === 'single_choice')
  scene.interaction.options[0].description = 'a'.repeat(241)
  assert.throws(() => assertExperience(definition, { spotIds: pkg.spots.map(s => s.id) }), /选项说明/)
  delete scene.interaction.options[0].description
  assertExperience(definition, { spotIds: pkg.spots.map(s => s.id) })
})
