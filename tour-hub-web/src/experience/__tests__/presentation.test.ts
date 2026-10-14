import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertPresentation, presentationCopy, presentationForPreset, presentationPalette, resolvePresentation } from '../presentation.ts'
import { publishedToDraft, toPublishedPackage, saveDraft } from '../../lib/draftStore.ts'
import { assertPublishedAttraction, toCatalogItem } from '../../lib/tourPackage.ts'
import { approveStoryDraft } from '../builderDraft.ts'
import { fixture } from './fixtures.ts'
import { createStoryState } from '../storyEngine.ts'
import { journalSvg, journalText, journeyTitle } from '../journey.ts'

test('presentation preserves legacy defaults and strictly bounds enums, labels and fields', () => {
  assert.equal(resolvePresentation().labels.finish, '读完家书，收下手账')
  assert.equal(assertPresentation(undefined), undefined)
  const p = presentationForPreset('cosmos')
  assert.deepEqual(assertPresentation(p), p)
  for (const invalid of [null, [], { ...p, preset: ['cosmos'] }, { ...p, motif: 'script' }, { ...p, locationMode: 'gps' }, { ...p, openingText: 'x'.repeat(1001) }, { ...p, labels: { ...p.labels, finish: '' } }, { ...p, css: 'url(https://example.com)' }]) assert.throws(() => assertPresentation(invalid))
})
test('presentation resolves isolated heritage, cosmos and legacy framework copy and theme tokens', () => {
  const legacy = resolvePresentation()
  const heritageTheme = presentationPalette('heritage')
  const cosmosTheme = presentationPalette('cosmos')
  assert.deepEqual(legacy, presentationForPreset('heritage'))
  assert.equal(presentationCopy().journal.downloaded, presentationCopy(legacy).journal.downloaded)
  assert.match(presentationCopy(legacy).journal.downloaded, /手账/)
  assert.match(presentationCopy(legacy).offline.title, /故事/)
  assert.match(presentationCopy(presentationForPreset('cosmos')).journal.intro('测试体验'), /飞行记录/)
  assert.match(presentationCopy(presentationForPreset('cosmos')).offline.aria, /离线讯号/)
  assert.doesNotMatch(JSON.stringify(presentationCopy(presentationForPreset('cosmos'))), /手账|家书|园林|风景|装进口袋/)
  assert.equal(heritageTheme.background, '#151d1a')
  assert.equal(heritageTheme.stageRadius, '4px')
  assert.equal(cosmosTheme.surface, '#0b203c')
  assert.equal(cosmosTheme.onAccent, '#071427')
  assert.equal(cosmosTheme.stageRadius, '16px')
})

test('presentation round-trips through editor, package and catalog and resets human review on change', async () => {
  const { pkg } = fixture()
  pkg.presentation = presentationForPreset('cosmos')
  const draft = publishedToDraft(assertPublishedAttraction(pkg))
  assert.deepEqual(draft.presentation, pkg.presentation)
  draft.presentation!.openingText = '我们从未见过的未来。'
  assert.notEqual(draft.presentation!.openingText, pkg.presentation.openingText)
  draft.coverImage = 'data:image/jpeg;base64,YQ=='
  draft.spots.forEach(s => { s.image = draft.coverImage })
  draft.experience?.scenes.forEach(scene => scene.blocks.forEach(block => { if (block.type === 'image') block.assetRef = draft.coverImage }))
  const next = await toPublishedPackage(draft)
  assert.deepEqual(next.presentation, draft.presentation)
  assert.deepEqual(toCatalogItem(next).presentation, draft.presentation)
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } })
  try {
    const reviewed = saveDraft(approveStoryDraft(draft))
    const edited = saveDraft({ ...reviewed, presentation: { ...reviewed.presentation!, openingText: '新的开场' } })
    assert.equal(edited.storyReview?.status, 'pending')
    assert.equal(edited.storyReview?.reviewedAt, undefined)
  } finally { Reflect.deleteProperty(globalThis, 'localStorage') }
})
test('cosmos journal uses the selected role and portable theme without garden copy or external markup', () => {
  const { definition } = fixture()
  const p = presentationForPreset('cosmos')
  const state = createStoryState(definition, 'cosmos-test')
  state.variables.signalView = 'origin'
  state.choices.push({ interactionId: 'signal', optionId: 'origin', label: '<我的讯号>' })
  assert.equal(journeyTitle(state, p), '起源追寻者')
  const text = journalText(definition, state, p)
  assert.match(text, /我的航行记录/)
  assert.match(text, /本次航行识别/)
  assert.match(text, /解码选择/)
  assert.match(text, /手动展区体验/)
  assert.doesNotMatch(text, /旅途称号|我的发现|走过的章节/)
  const svg = journalSvg(definition, state, p)
  assert.match(svg, /#071427/)
  assert.match(svg, /TIMEWALKER · 讯号归档/)
  assert.match(svg, /解码选择|已归档的观测讯号|接收序列/)
  assert.match(svg, /&lt;我的讯号&gt;/)
  assert.doesNotMatch(svg, /<script|foreignObject|<image|我的时空手账|旅程留痕|我想记住的一刻|走过的章节/)
})
