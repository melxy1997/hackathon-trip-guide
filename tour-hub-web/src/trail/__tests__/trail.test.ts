import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertTrail, trailFingerprint, trailHref } from '../trailSchema.ts'
import { confirmCheckpoint, freshTrailSession, restoreTrailSession, trailCardSvg, undoCheckpoint } from '../trailSession.ts'
import type { PublishedAttraction } from '../../lib/tourPackage.ts'
const pkg = JSON.parse(readFileSync(new URL('../../../public/data/attractions/yuyuan.json', import.meta.url), 'utf8')) as PublishedAttraction
const fixture = () => assertTrail(JSON.parse(readFileSync(new URL('../../../public/data/trails/yuyuan-four-sights.json', import.meta.url), 'utf8')), pkg)

test('four-sight fixture references existing Yuyuan places and explicit separate story', () => {
  const trail = fixture()
  assert.equal(trail.baseAttractionId, 'yuyuan')
  assert.equal(trail.relatedExperienceId, 'yuyuan-timewalker')
  assert.deepEqual(trail.checkpoints.map(cp => cp.spotId), ['san-sui-tang', 'da-jia-shan', 'yu-ling-long', 'dian-chun-tang'])
  assert.deepEqual(assertTrail(JSON.parse(JSON.stringify(trail)), pkg), trail)
})
test('trail validation rejects wrong source, invented or duplicate places, unsafe links and unknown fields', () => {
  const trail = fixture()
  assert.throws(() => assertTrail(trail, { ...pkg, id: 'other' }), /基础景点/)
  const bad = structuredClone(trail); bad.checkpoints[0].spotId = 'made-up'
  assert.throws(() => assertTrail(bad, pkg), /未知地点/)
  const duplicate = structuredClone(trail); duplicate.checkpoints[1].spotId = duplicate.checkpoints[0].spotId
  assert.throws(() => assertTrail(duplicate, pkg), /重复/)
  assert.throws(() => assertTrail({ ...trail, checkpoints: trail.checkpoints.slice(0, 2) }), /3–6/)
  assert.throws(() => assertTrail({ ...trail, arbitrary: true }), /字段/)
  for (const href of ['javascript:alert(1)', '//evil.example', 'https://u:p@example.com', '/publish/new', '/trail/../secret']) assert.throws(() => trailHref(href))
  assert.equal(trailHref('/experience/yuyuan-timewalker'), '/experience/yuyuan-timewalker')
  assert.equal(trailHref('https://example.com/product'), 'https://example.com/product')
  const recommendation = structuredClone(trail); recommendation.recommendations![0].afterCheckpointId = 'missing'
  assert.throws(() => assertTrail(recommendation), /站点不存在/)
})
test('ordered check-in is idempotent, undo removes last stamp and completed route can be restored', () => {
  const trail = fixture()
  let session = freshTrailSession(trail)
  assert.equal(confirmCheckpoint(session, trail, trail.checkpoints[1].id), session)
  for (const cp of trail.checkpoints) {
    session = confirmCheckpoint(session, trail, cp.id)
    assert.equal(confirmCheckpoint(session, trail, cp.id), session)
  }
  assert.equal(session.completedCheckpointIds.length, 4)
  assert.deepEqual(restoreTrailSession(JSON.stringify(session), trail), session)
  assert.equal(undoCheckpoint(session).completedCheckpointIds.length, 3)
  assert.equal(session.completedCheckpointIds.length, 4)
})
test('changed route, corrupted and out-of-order sessions restart without fabricated progress', () => {
  const trail = fixture(); const session = confirmCheckpoint(freshTrailSession(trail), trail, 'hall')
  const changed = { ...trail, title: 'updated route' }
  assert.notEqual(trailFingerprint(changed), trailFingerprint(trail))
  for (const raw of ['{bad', JSON.stringify({ ...session, completedCheckpointIds: ['rockery'] }), JSON.stringify({ ...session, updatedAt: -1 })]) assert.equal(restoreTrailSession(raw, trail).completedCheckpointIds.length, 0)
  assert.equal(restoreTrailSession(JSON.stringify(session), changed).completedCheckpointIds.length, 0)
})
test('souvenir SVG uses actual stamps, escapes user content and references no network resources', () => {
  const trail = fixture(); trail.title = 'A < B & "探索"'
  const svg = trailCardSvg(trail, confirmCheckpoint(freshTrailSession(trail), trail, 'hall'))
  assert.match(svg, /已收集 1 \/ 4/)
  assert.match(svg, /A &lt; B &amp; &quot;/)
  assert.match(svg, /亭台初见/)
  assert.doesNotMatch(svg, /山间寻趣|https?:\/\/(?!www.w3.org)/)
})
