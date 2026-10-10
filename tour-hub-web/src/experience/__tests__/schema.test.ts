import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertPublishedAttraction } from '../../lib/tourPackage.ts'
import { assertExperience, safeAssetUrl } from '../experienceSchema.ts'
import { fixture } from './fixtures.ts'

test('legacy attraction and new embedded experience are independently loadable', () => {
  const legacy = JSON.parse(readFileSync(new URL('../../../public/data/attractions/yuyuan.json', import.meta.url), 'utf8'))
  assert.equal(assertPublishedAttraction(legacy).experience, undefined)
  assert.equal(assertPublishedAttraction(fixture().pkg).experience?.scenes.length, 5)
})
const corruptions: Array<[string, (x: Record<string, any>) => void, RegExp]> = [
  ['unknown target', x => { x.scenes[0].transitions[0].to = 'missing' }, /scene:prologue.*未知目标/],
  ['duplicate scene', x => { x.scenes[1].id = x.scenes[0].id }, /场景 ID 无效或重复/],
  ['duplicate block', x => { x.scenes[0].blocks[1].id = x.scenes[0].blocks[0].id }, /内容块 ID 无效或重复/],
  ['unknown action', x => { x.scenes[1].interaction.options[0].actions[0].type = 'runScript' }, /未知动作/],
  ['action extra field', x => { x.scenes[1].interaction.options[0].actions[0].script = 'alert(1)' }, /非契约字段/],
  ['undeclared variable', x => { x.scenes[1].interaction.options[0].actions[0].key = 'missing' }, /变量或值类型无效/],
  ['wrong variable value type', x => { x.scenes[1].interaction.options[0].actions[0].value = true }, /变量或值类型无效/],
  ['missing source', x => { x.scenes[2].blocks[1].sourceIds = [] }, /事实讲述需关联来源/],
  ['unknown source', x => { x.scenes[2].blocks[1].sourceIds = ['missing'] }, /引用未知来源/],
  ['unknown spot', x => { x.scenes[0].spotId = 'missing' }, /未知地点/],
  ['unknown block type', x => { x.scenes[0].blocks[0].type = 'script' }, /未知内容块类型/],
  ['unsafe media', x => { x.scenes[0].blocks[0].assetRef = 'javascript:alert(1)' }, /媒体引用无法安全解析/],
  ['duplicate option', x => { x.scenes[1].interaction.options[1].id = 'nature' }, /选项 ID 无效或重复/],
  ['unknown interaction', x => { x.scenes[1].interaction.type = 'runCode' }, /未知互动类型/],
  ['conflicting transitions', x => { x.scenes[1].transitions = [{ to: 'epilogue' }] }, /不能同时定义/],
  ['no observation fallback', x => { delete x.scenes[2].interaction.fallback }, /必须允许人工确认/],
  ['ending has outgoing edge', x => { x.scenes[4].transitions = [{ to: 'prologue' }] }, /终幕不可有互动或出边/],
  ['cycle', x => { x.scenes[0].transitions[0].to = 'prologue' }, /不支持循环/],
  ['unreachable branch', x => { x.scenes[1].interaction.options[1].actions[1].sceneId = 'jade-nature' }, /scene:jade-craft.*不可达/],
  ['invalid scalar', x => { x.initialVariables.observedJade = {} }, /标量值无效/],
  ['missing initial scene', x => { x.initialSceneId = 'missing' }, /首幕不存在/],
  ['conditional path without fallback', x => { x.scenes[0].transitions[0].when = { var: 'aestheticLens', op: 'eq', value: 'unset' } }, /必须是无条件兜底/],
  ['unknown condition', x => { x.scenes[0].transitions.unshift({ to: 'rockery', when: { var: 'aestheticLens', op: 'eval', value: 'unset' } }) }, /转移条件无效/],
]
for (const [label, corrupt, expected] of corruptions) test(`reject ${label} with actionable location`, () => {
  const { pkg, definition } = fixture()
  corrupt(definition)
  assert.throws(() => assertExperience(definition, { spotIds: pkg.spots.map(s => s.id) }), expected)
})
test('malformed nested structures produce validation errors, not crashes', () => {
  const { pkg, definition } = fixture()
  const raw = definition as unknown as Record<string, unknown>
  raw.scenes = [null, { id: 'scene', blocks: [null], interaction: null }]
  assert.throws(() => assertExperience(raw, { spotIds: pkg.spots.map(s => s.id) }), /体验包校验失败/)
})
test('media refs resolve package assets and reject credentials, SVG data and path escapes', () => {
  const { pkg, definition } = fixture()
  definition.scenes[0].blocks[0].assetRef = 'assets/opening.jpg'
  assertExperience(definition, { spotIds: pkg.spots.map(s => s.id), assets: { 'assets/opening.jpg': 'data:image/jpeg;base64,YQ==' } })
  for (const url of ['http://example.com/image.jpg', '//example.com/a.jpg', '/%2e%2e/escape', 'https://user:password@example.com/a', 'data:image/svg+xml;base64,YQ==']) assert.equal(safeAssetUrl(url, 'image'), false, url)
})
