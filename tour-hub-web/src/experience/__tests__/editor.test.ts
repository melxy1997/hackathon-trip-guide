import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publishedToDraft, toPublishedPackage } from '../../lib/draftStore.ts'
import { fixture } from './fixtures.ts'

test('editing and packaging legacy fields preserves story and isolated clones', async () => {
  const { pkg } = fixture()
  const draft = publishedToDraft(pkg)
  assert.deepEqual(draft.experience, pkg.experience)
  draft.experience!.scenes[0].blocks[1].text = '这是人工修改后的虚构家书。'
  draft.description = '修改简介'
  // Embedded fixture images avoid browser-only FileReader in this unit test.
  draft.coverImage = 'data:image/jpeg;base64,YQ=='
  draft.spots.forEach(s => { s.image = draft.coverImage })
  const next = await toPublishedPackage(draft)
  assert.equal(next.description, '修改简介')
  assert.equal(next.experience?.scenes[0].blocks[1].text, '这是人工修改后的虚构家书。')
  assert.notEqual(next.experience, draft.experience)
  assert.notEqual(pkg.experience?.scenes[0].blocks[1].text, next.experience?.scenes[0].blocks[1].text)
})
test('story assets survive imported package editing and validation occurs before packaging', async () => {
  const { pkg } = fixture()
  pkg.assets = { 'assets/story.jpg': 'data:image/jpeg;base64,YQ==' }
  pkg.experience!.scenes[0].blocks[0].assetRef = 'assets/story.jpg'
  const draft = publishedToDraft(pkg)
  assert.equal(draft.experience!.scenes[0].blocks[0].assetRef, pkg.assets['assets/story.jpg'])
  draft.experience!.scenes[0].transitions![0].to = 'missing'
  await assert.rejects(toPublishedPackage(draft), /未知目标/)
})
