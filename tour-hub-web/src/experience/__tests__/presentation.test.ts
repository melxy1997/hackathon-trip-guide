import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertPresentation, presentationForPreset, resolvePresentation } from '../presentation.ts'
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
test('presentation round-trips through editor, package and catalog and resets human review on change', async () => {
  const { pkg } = fixture()
  pkg.presentation = presentationForPreset('cosmos')
  const draft = publishedToDraft(assertPublishedAttraction(pkg))
  assert.deepEqual(draft.presentation, pkg.presentation)
  draft.presentation!.openingText = '我们从未见过的未来。'
  assert.notEqual(draft.presentation!.openingText, pkg.presentation.openingText)
  draft.coverImage = 'data:image/jpeg;base64,YQ=='
  draft.spots.forEach(s => { s.image = draft.coverImage })
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
  assert.match(journalText(definition, state, p), /我的航行记录/)
  assert.match(journalText(definition, state, p), /手动展区体验/)
  const svg = journalSvg(definition, state, p)
  assert.match(svg, /#071427/)
  assert.match(svg, /&lt;我的讯号&gt;/)
  assert.doesNotMatch(svg, /<script|foreignObject|<image|我的时空手账/)
})
