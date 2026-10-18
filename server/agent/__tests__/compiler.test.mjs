import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { compileCandidate } from '../../../.generated/agent/server/agent/compiler.js'
import { briefSchema, conceptsSchema } from '../../../.generated/agent/src/agent/contracts.js'
export const source = () => { const pkg = JSON.parse(fs.readFileSync(new URL('../../../public/spots/yuyuan.json', import.meta.url))); return { ...pkg, createdAt: 1, updatedAt: 10, status: 'draft' } }
export function fixture(mode = 'story') {
  const draft = source(); draft.spots = draft.spots.slice(0, 3); const ids = draft.spots.map(s => s.id)
  const plan = { entrySpotId: ids[0], nodes: ids.map((id, i) => ({ spotId: id, toSpotIds: mode === 'story' && i === 0 ? ids.slice(1) : mode === 'checkin' && ids[i + 1] ? [ids[i + 1]] : [], role: '探索', dramaticBeat: '地点参与情节推进' })) }
  const narrative = { title: '园林来信', description: '一封家书牵起园林记忆。', spots: plan.nodes.map(node => ({ spotId: node.spotId, poetic: '寻找来信的痕迹', slides: [{ title: '开场', bullets: ['观察一处细节'], narration: '你在园中发现了来信。' }], choices: mode === 'story' ? node.toSpotIds.map(toSpotId => ({ toSpotId, label: '沿线索探索', note: '自由停留' })) : [], ...(mode === 'story' && !node.toSpotIds.length ? { endingTitle: '回信已至' } : {}) })) }
  const brief = briefSchema.parse({ sourceDraftId: draft.id, prompt: '园林来信', mode })
  return { draft, brief, plan, narrative }
}
test('compiler preserves every place, coordinates and media, and supports multiple explicit endings', () => {
  const { draft, brief, plan, narrative } = fixture(); const before = JSON.stringify(draft)
  const result = compileCandidate(draft, brief, plan, narrative)
  assert.equal(JSON.stringify(draft), before)
  assert.equal(result.mode, 'story'); assert.equal(Object.keys(result.story.endings).length, draft.spots.length - 1)
  for (let i = 0; i < draft.spots.length; i++) for (const key of ['id', 'name', 'lng', 'lat', 'image', 'triggerRadiusMeters']) assert.equal(result.spots[i][key], draft.spots[i][key])
})
test('compiler rejects invented/duplicate/missing spots, mismatched choices and unreachable closed loops', () => {
  for (const mutate of [
    f => { f.plan.nodes[0].spotId = 'made-up' }, f => { f.narrative.spots.pop() },
    f => { f.plan.nodes[0].toSpotIds = ['unknown'] }, f => { f.narrative.spots[0].choices = [] },
    f => { f.plan.nodes[0].toSpotIds = []; f.narrative.spots[0].choices = []; f.narrative.spots[0].endingTitle = '结束' },
    f => { for (const [i, node] of f.plan.nodes.entries()) { node.toSpotIds = [f.plan.nodes[(i + 1) % f.plan.nodes.length].spotId]; f.narrative.spots[i].choices = [{ toSpotId: node.toSpotIds[0], label: '继续', note: '线索' }]; delete f.narrative.spots[i].endingTitle } },
  ]) { const f = fixture(); mutate(f); assert.throws(() => compileCandidate(f.draft, f.brief, f.plan, f.narrative)) }
})
test('checkin keeps place order and omits story; arbitrary fields and duplicate concepts fail', () => {
  const f = fixture('checkin'); f.draft.story = { title: '旧故事' }
  assert.equal(compileCandidate(f.draft, f.brief, f.plan, f.narrative).story, undefined)
  f.narrative.spots[0].script = 'alert(1)'
  assert.throws(() => compileCandidate(f.draft, f.brief, f.plan, f.narrative))
  const c = { conceptId: 'one', title: '故事', logline: '主线', visitorRole: '游客', conflict: '冲突', hook: '开场', climax: '高潮', ending: '结局', visualStyle: '绘本' }
  assert.throws(() => conceptsSchema.parse([c, { ...c, conceptId: 'two', title: '另一个标题' }]))
})
