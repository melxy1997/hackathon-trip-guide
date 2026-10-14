import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publishedToDraft, toPublishedPackage } from '../../lib/draftStore.ts'
import { fixture } from './fixtures.ts'

test('story-only image and audio are collected into portable assets with references replaced', async () => {
  const draft = publishedToDraft(fixture().pkg)
  draft.coverImage = 'data:image/jpeg;base64,YQ=='
  draft.spots.forEach(s => { s.image = draft.coverImage })
  draft.experience?.scenes.forEach(scene => scene.blocks.forEach(block => { if (block.type === 'image') block.assetRef = draft.coverImage }))
  const image = 'data:image/png;base64,Yg=='
  const audio = 'data:audio/mpeg;base64,Yw=='
  draft.experience!.scenes[0].blocks[0].assetRef = image
  draft.experience!.scenes[0].blocks.push({ id: 'prepared-voice', type: 'audio', assetRef: audio })
  const pkg = await toPublishedPackage(draft)
  const blocks = pkg.experience!.scenes[0].blocks
  assert.equal(pkg.assets?.[blocks[0].assetRef!], image)
  const voice = blocks.find(b => b.id === 'prepared-voice')!
  assert.match(voice.assetRef!, /\.mp3$/)
  assert.equal(pkg.assets?.[voice.assetRef!], audio)
  assert.equal(draft.experience!.scenes[0].blocks[0].assetRef, image)
})

test('editing and packaging legacy fields preserves story and isolated clones', async () => {
  const { pkg } = fixture()
  const draft = publishedToDraft(pkg)
  assert.deepEqual(draft.experience, pkg.experience)
  draft.experience!.scenes[0].blocks[1].text = '这是人工修改后的虚构家书。'
  draft.description = '修改简介'
  // Embedded fixture images avoid browser-only FileReader in this unit test.
  draft.coverImage = 'data:image/jpeg;base64,YQ=='
  draft.spots.forEach(s => { s.image = draft.coverImage })
  draft.experience?.scenes.forEach(scene => scene.blocks.forEach(block => { if (block.type === 'image') block.assetRef = draft.coverImage }))
  const next = await toPublishedPackage(draft)
  assert.equal(next.description, '修改简介')
  assert.equal(next.experience?.scenes[0].blocks[1].text, '这是人工修改后的虚构家书。')
  const observation = next.experience?.scenes[2].interaction
  assert.equal(observation?.type, 'photo_or_tap')
  if (observation?.type === 'photo_or_tap') {
    assert.equal(observation.prompt, '找一处让你想到山林的轮廓、孔洞或光影。')
    assert.deepEqual(observation.hints, ['先看整块石头的外轮廓。', '再找一个像山洞、云朵或水流的局部。'])
  }
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
