import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTemplate, type BuilderInput } from '../builder.ts'
import { presentationForPreset } from '../presentation.ts'
import { assertPublishedAttraction, type PublishedAttraction } from '../../lib/tourPackage.ts'
import {
  assertAgentCandidate, assertBeatSheet, assertCreativeBrief, assertLocationNotes, assertStoryConcept,
  packageFingerprint,
} from '../agent/validators.ts'
import type { AgentCandidate, AgentStyle, StoryBeat } from '../agent/contracts.ts'

function loadPackage(file: string): PublishedAttraction {
  return assertPublishedAttraction(JSON.parse(readFileSync(new URL(`../../../public/data/attractions/${file}`, import.meta.url), 'utf8')))
}

function candidateFor(pkg: PublishedAttraction, style: AgentStyle): AgentCandidate {
  const basePackage = { id: pkg.id, version: pkg.publishedAt, fingerprint: packageFingerprint(pkg) }
  const input: BuilderInput = { attractionId: pkg.id, theme: style === 'cosmos' ? '来自未来的回声' : '一封穿越时间的家书', audience: 'general', duration: 5, tone: 'poetic', mode: 'template' }
  const experience = buildTemplate(pkg, input, `agent-${style}`).experience
  const branchSceneIds = experience.scenes.filter(scene => scene.mode === 'observation').map(scene => scene.id)
  const choiceScene = experience.scenes.find(scene => scene.interaction?.type === 'single_choice')!
  const endingScene = experience.scenes.find(scene => scene.mode === 'ending')!
  const beats: StoryBeat[] = [
    { id: 'opening-beat', type: 'opening', title: '开场', summary: '主角收到一条需要追踪的线索。', spotId: experience.scenes[0].spotId!, sceneIds: [experience.scenes[0].id] },
    { id: 'choice-beat', type: 'choice', title: '选择', summary: '玩家选择理解线索的视角。', spotId: choiceScene.spotId!, sceneIds: [choiceScene.id], branches: branchSceneIds.map((sceneId, index) => ({ id: `branch-${index + 1}`, label: `视角 ${index + 1}`, summary: '沿所选视角展开一段观察。', spotId: experience.scenes.find(scene => scene.id === sceneId)!.spotId!, sceneIds: [sceneId], rejoinsAtBeatId: 'ending-beat' })) },
    { id: 'observation-beat', type: 'observation', title: '观察', summary: '玩家完成分支对应的现场观察。', spotId: experience.scenes.find(scene => scene.id === branchSceneIds[0])!.spotId!, sceneIds: branchSceneIds, observationTask: '找到一处与线索呼应的形状或变化。' },
    { id: 'ending-beat', type: 'ending', title: '回收', summary: '两条路径汇合并回应开场悬念。', spotId: endingScene.spotId!, sceneIds: [endingScene.id] },
  ]
  const selectedConcept = {
    id: `${style}-concept`, title: input.theme, premise: '一条跨越时间的线索等待玩家回应。', protagonist: '此刻到访的玩家',
    desire: '理解线索为何抵达这里', suspense: '线索来自何处，又为何选择此刻出现？', locationRole: '地点的结构与展项推动线索逐步显形。', resolution: '玩家的观察成为寄往未来的回答。',
  }
  const knownRefs = [...new Set([pkg.coverImage, ...pkg.spots.map(spot => spot.image)])]
  return {
    schemaVersion: 1, basePackage,
    brief: { attractionId: pkg.id, theme: input.theme, audience: input.audience, targetMinutes: input.duration, style },
    locationNotes: {
      basePackage: { ...basePackage }, spots: pkg.spots.map(spot => ({ id: spot.id, name: spot.name, summary: spot.slides[0]?.narration || spot.poetic })),
      media: knownRefs.map((assetRef, index) => ({ id: `media-${index + 1}`, kind: 'image', assetRef, sourceIds: [] })),
      sources: structuredClone(pkg.experience?.sources ?? []),
    },
    selectedConcept, beatSheet: { conceptId: selectedConcept.id, beats }, experience,
    presentation: structuredClone(pkg.presentation ?? presentationForPreset(style)), resourceManifest: { resources: [], sources: [] },
    diagnostics: [{ level: 'warning', message: '史实与素材授权仍需人工审核。' }],
  }
}

const samples = [
  ['heritage', 'yuyuan-timewalker.json'],
  ['cosmos', 'shanghai-planetarium.json'],
] as const

for (const [style, file] of samples) test(`${style} agent candidate validates against its unchanged base package`, () => {
  const pkg = loadPackage(file)
  const candidate = candidateFor(pkg, style)
  const validated = assertAgentCandidate(candidate, pkg)
  assert.deepEqual(validated, candidate)
  assert.equal(candidate.beatSheet.beats.length, 4)
  assert.ok(candidate.experience.scenes.length > candidate.beatSheet.beats.length, 'branch scenes may exceed player beat count')
})

test('unknown spot and media references are rejected with actionable paths', () => {
  const pkg = loadPackage('yuyuan-timewalker.json')
  const unknownSpot = structuredClone(candidateFor(pkg, 'heritage'))
  unknownSpot.beatSheet.beats[0].spotId = 'invented-gate'
  assert.throws(() => assertAgentCandidate(unknownSpot, pkg), /未知地点 invented-gate/)

  const unknownMedia = structuredClone(candidateFor(pkg, 'heritage'))
  unknownMedia.experience.scenes[0].blocks[0].assetRef = '/invented/missing.jpg'
  assert.throws(() => assertAgentCandidate(unknownMedia, pkg), /媒体.*无法通过基础包或候选资源清单解析/)
})

test('existing experience validator rejects actions outside the V1 whitelist', () => {
  const pkg = loadPackage('shanghai-planetarium.json')
  const candidate = candidateFor(pkg, 'cosmos')
  const choice = candidate.experience.scenes.find(scene => scene.interaction?.type === 'single_choice')!
  if (choice.interaction?.type !== 'single_choice') assert.fail('choice fixture missing')
  ;(choice.interaction.options[0].actions as unknown[])[0] = { type: 'fetch', url: 'https://example.com' }
  assert.throws(() => assertAgentCandidate(candidate, pkg), /未知动作 fetch/)
})

test('stale base package version and fingerprint are rejected independently', () => {
  const pkg = loadPackage('yuyuan-timewalker.json')
  const staleVersion = candidateFor(pkg, 'heritage')
  staleVersion.basePackage.version--
  staleVersion.locationNotes.basePackage.version--
  assert.throws(() => assertAgentCandidate(staleVersion, pkg), /基础包版本已失效/)

  const staleFingerprint = candidateFor(pkg, 'heritage')
  staleFingerprint.basePackage.fingerprint = '0000000000000000'
  staleFingerprint.locationNotes.basePackage.fingerprint = '0000000000000000'
  assert.throws(() => assertAgentCandidate(staleFingerprint, pkg), /基础包内容指纹已失效/)
})

test('selected concept and beat/scene mappings must remain consistent', () => {
  const pkg = loadPackage('shanghai-planetarium.json')
  const conceptMismatch = candidateFor(pkg, 'cosmos')
  conceptMismatch.beatSheet.conceptId = 'another-concept'
  assert.throws(() => assertAgentCandidate(conceptMismatch, pkg), /概念 ID 不一致/)

  const sceneMismatch = candidateFor(pkg, 'cosmos')
  sceneMismatch.beatSheet.beats[0].sceneIds = ['missing-scene']
  assert.throws(() => assertAgentCandidate(sceneMismatch, pkg), /节拍与 experience 场景映射不一致/)
})

test('standalone contracts reject unknown fields and invalid beat bounds', () => {
  const pkg = loadPackage('yuyuan-timewalker.json')
  const candidate = candidateFor(pkg, 'heritage')
  assertCreativeBrief(candidate.brief); assertLocationNotes(candidate.locationNotes); assertStoryConcept(candidate.selectedConcept); assertBeatSheet(candidate.beatSheet)
  assert.throws(() => assertCreativeBrief({ ...candidate.brief, promptInjection: 'extra' }), /未知字段/)
  assert.throws(() => assertBeatSheet({ ...candidate.beatSheet, beats: candidate.beatSheet.beats.slice(0, 3) }), /4–6/)
})
