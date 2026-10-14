import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTemplate, assertBuilderCandidate, assertBuilderInput, suggestedBuilderTheme, validationSuggestion, type BuilderInput } from '../builder.ts'
import { presentationForPreset } from '../presentation.ts'
import { shouldResolveMapLocations, usesExhibitionOrder } from '../../pages/publishLocationMode.ts'
import { approveStoryDraft, createBuilderDraft, createTemplateStory } from '../builderDraft.ts'
import { saveDraft, getDraft, publishDraft, publishedToDraft } from '../../lib/draftStore.ts'
import { createStoryState, transition } from '../storyEngine.ts'
import type { ExperienceEvent } from '../events.ts'
import { fixture, sceneEvent } from './fixtures.ts'

const brief: BuilderInput = { attractionId: 'yuyuan-timewalker', theme: '一封写给未来的信', audience: 'general', duration: 5, tone: 'poetic', mode: 'template' }
test('unpublished local POIs can become a pending story without changing draft identity or source', () => {
  const { pkg } = fixture()
  const draft = publishedToDraft({ ...pkg, experience: undefined })
  const before = structuredClone(draft)
  const story = createTemplateStory(draft)
  assert.equal(story.id, draft.id)
  assert.equal(story.storyReview?.status, 'pending')
  assert.ok(story.experience)
  assert.deepEqual(draft, before)
  assert.throws(() => createTemplateStory({ ...draft, spots: draft.spots.slice(0, 2) }))
})
test('template uses known POIs and media; both branches reach ending through the real reducer', () => {
  const { pkg } = fixture()
  const result = buildTemplate(pkg, brief, 'template-1')
  assertBuilderCandidate(result.experience, pkg)
  assert.equal(result.mode, 'template'); assert.equal(result.reviewRequired, true)
  const observations = result.experience.scenes.map(s => s.interaction).filter(i => i?.type === 'photo_or_tap')
  assert.equal(observations.length, 2)
  assert.notEqual(observations[0]?.prompt, observations[1]?.prompt)
  assert.ok(observations.every(i => i?.type === 'photo_or_tap' && i.prompt && i.hints?.length))
  assert.ok(result.experience.scenes.every(s => s.blocks.filter(b => b.text).every(b => b.fictional)))
  for (const branch of ['nature', 'craft']) {
    const exp = result.experience
    let state = createStoryState(exp, branch)
    const send = (e: ExperienceEvent) => { const next = transition(exp, state, e); assert.deepEqual(next.diagnostics, []); state = next.state }
    send({ type: 'START' })
    send({ type: 'SKIP_SCENE', ...sceneEvent(state) })
    send({ type: 'LOCATION_ENTER', spotId: pkg.spots[1].id, source: 'simulated', ...sceneEvent(state) })
    send({ type: 'SKIP_SCENE', ...sceneEvent(state) })
    send({ type: 'CHOICE_SELECTED', interactionId: 'choose-lens', optionId: branch, ...sceneEvent(state) })
    send({ type: 'LOCATION_ENTER', spotId: pkg.spots[2].id, source: 'simulated', ...sceneEvent(state) })
    send({ type: 'SKIP_SCENE', ...sceneEvent(state) })
    send({ type: 'OBSERVATION_CONFIRMED', interactionId: `${branch}-look`, method: 'manual', ...sceneEvent(state) })
    send({ type: 'LOCATION_ENTER', spotId: pkg.spots[3].id, source: 'simulated', ...sceneEvent(state) })
    send({ type: 'SKIP_SCENE', ...sceneEvent(state) })
    assert.equal(state.phase, 'completed'); assert.equal(state.variables.lens, branch)
    assert.equal(state.observations[0].method, 'manual'); assert.equal(state.visitedSceneIds.length, 4)
  }
})
test('motif semantics select cosmos, heritage, and neutral vocabularies without package-id branching', () => {
  const { pkg } = fixture()
  const cosmosPackage = { ...pkg, id: 'renamed-indoor-sample', presentation: presentationForPreset('cosmos') }
  const cosmos = buildTemplate(cosmosPackage, { ...brief, attractionId: cosmosPackage.id, theme: '遥远回声' }, 'cosmos')
  const cosmosText = JSON.stringify(cosmos.experience)
  assert.match(cosmosText, /接收.*讯号/)
  assert.match(cosmosText, /回溯讯号起点/)
  assert.match(cosmosText, /推演讯号目的地/)
  assert.match(cosmosText, /展项现象/)
  assert.match(cosmosText, /航行与观测记录/)
  assert.doesNotMatch(cosmosText, /纸笺|石头|手札|自然的一页|创造的一页|寻找自然的形状|留意创造的细节/)
  assert.deepEqual(cosmos.experience.initialVariables, { signalView: 'unset', observed: false })
  for (const option of cosmos.experience.scenes[1].interaction?.type === 'single_choice' ? cosmos.experience.scenes[1].interaction.options : []) assert.equal(option.actions[0].type === 'setVar' && option.actions[0].key, 'signalView')

  const heritagePackage = { ...pkg, id: 'renamed-heritage-sample', presentation: presentationForPreset('heritage') }
  const heritage = buildTemplate(heritagePackage, { ...brief, attractionId: heritagePackage.id }, 'heritage')
  const heritageText = JSON.stringify(heritage.experience)
  assert.match(heritageText, /纸笺/)
  assert.match(heritageText, /自然的一页/)
  assert.match(heritageText, /手札/)

  const legacyPackage = { ...pkg, id: 'legacy-without-presentation', presentation: undefined }
  const legacy = buildTemplate(legacyPackage, { ...brief, attractionId: legacyPackage.id, theme: '旧城回声' }, 'legacy')
  const legacyText = JSON.stringify(legacy.experience)
  assert.match(legacyText, /纸笺|自然的一页|手札/)
  assert.equal(suggestedBuilderTheme({ name: '旧样例' }), '旧样例：写给未来的一封信')
})
test('theme suggestions and indoor location decisions derive from presentation', () => {
  assert.match(suggestedBuilderTheme({ name: '天文展', presentation: presentationForPreset('cosmos') }), /讯号/)
  assert.match(suggestedBuilderTheme({ name: '古园', presentation: presentationForPreset('heritage') }), /一封信/)
  assert.equal(suggestedBuilderTheme({ name: '旧样例' }), '旧样例：写给未来的一封信')
  const indoor = presentationForPreset('cosmos')
  assert.equal(usesExhibitionOrder(indoor), true)
  assert.equal(shouldResolveMapLocations(indoor), false)
  assert.equal(usesExhibitionOrder(presentationForPreset('heritage')), false)
  assert.equal(shouldResolveMapLocations(undefined), true)
})
test('legacy packages without story or sources can produce honest fictional drafts', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../../public/data/attractions/yuyuan.json', import.meta.url), 'utf8'))
  const result = buildTemplate(pkg, { ...brief, attractionId: pkg.id, audience: 'family', tone: 'lively' }, 'template-2')
  assertBuilderCandidate(result.experience, pkg)
  assert.deepEqual(result.experience.sources, [])
  assert.match(result.experience.scenes[2].blocks[1].text!, /孩子/)
})
test('malformed briefs, insufficient POIs, invented sources and media are rejected', () => {
  const { pkg } = fixture()
  for (const patch of [{ attractionId: '../secret' }, { theme: '' }, { duration: 2 }, { mode: 'fake-ai' }]) assert.throws(() => assertBuilderInput({ ...brief, ...patch }))
  assert.throws(() => buildTemplate({ ...pkg, spots: pkg.spots.slice(0, 2) }, brief, 'x'), /至少三个/)
  const result = buildTemplate(pkg, brief, 'x')
  const badSource = structuredClone(result.experience)
  badSource.sources.push({ id: 'fake', title: '伪造引用', url: 'https://fake.example', authority: 'official' })
  assert.throws(() => assertBuilderCandidate(badSource, pkg), /资料库之外/)
  const badMedia = structuredClone(result.experience)
  badMedia.scenes[0].blocks[0].assetRef = 'https://fake.example/photo.jpg'
  assert.throws(() => assertBuilderCandidate(badMedia, pkg), /资料库之外/)
  assert.match(validationSuggestion('scene:choice 未知目标 missing'), /下一章/)
})
test('adoption isolates original; pending review blocks publish, approved content edits reset review', async () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
  try {
    const { pkg } = fixture()
    const result = buildTemplate(pkg, brief, 'x')
    const draft = saveDraft(createBuilderDraft(pkg, result, 'attr-review-test'))
    assert.notEqual(draft.id, pkg.id); assert.equal(draft.storyReview?.status, 'pending')
    await assert.rejects(publishDraft(draft.id), /尚未人工审核/)
    const approved = saveDraft(approveStoryDraft(draft))
    assert.equal(approved.storyReview?.status, 'approved')
    assert.equal(saveDraft({ ...approved, status: 'published' }).storyReview?.status, 'approved')
    const edited = structuredClone(approved)
    const observation = edited.experience!.scenes[2].interaction
    assert.equal(observation?.type, 'photo_or_tap')
    if (observation?.type === 'photo_or_tap') observation.prompt = '修改后的观察提示，需要重新审核。'
    const saved = saveDraft(edited)
    assert.equal(saved.storyReview?.status, 'pending'); assert.equal(saved.storyReview?.reviewedAt, undefined)
    assert.equal(getDraft(draft.id)?.storyReview?.status, 'pending')
    await assert.rejects(publishDraft(draft.id), /尚未人工审核/)
    assert.notEqual(pkg.experience?.scenes[0].blocks[1].text, edited.experience!.scenes[0].blocks[1].text)
    saved.experience!.scenes[0].transitions![0].to = 'missing'
    assert.throws(() => approveStoryDraft(saved), /未知目标/)
  } finally { Reflect.deleteProperty(globalThis, 'localStorage') }
})
