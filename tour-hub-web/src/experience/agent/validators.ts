import { assertExperience, safeAssetUrl } from '../experienceSchema.ts'
import { assertPresentation } from '../presentation.ts'
import { resolveMediaUrl, type PublishedAttraction } from '../../lib/tourPackage.ts'
import type {
  AgentCandidate, AgentDiagnostic, BasePackageIdentity, BeatBranch, BeatSheet, CandidateResource,
  CreativeBrief, LocationMedia, LocationNotes, LocationSource, ResourceManifest, StoryBeat, StoryConcept,
} from './contracts.ts'

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/
const FINGERPRINT = /^[a-f0-9]{16}$/
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const fail = (path: string, message: string): never => { throw new Error(`Agent 候选校验失败：${path} ${message}`) }
const strict = (raw: unknown, keys: readonly string[], path: string): Record<string, unknown> => {
  if (!object(raw)) fail(path, '必须是对象。')
  const value = raw as Record<string, unknown>
  const unknown = Object.keys(value).find(key => !keys.includes(key))
  if (unknown) fail(path, `包含未知字段 ${unknown}。`)
  return value
}
const text = (raw: unknown, max: number, path: string): string => {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > max) fail(path, `必须是 1–${max} 字文本。`)
  return (raw as string).trim()
}
const id = (raw: unknown, path: string): string => {
  if (typeof raw !== 'string' || !ID.test(raw) || ['__proto__', 'constructor', 'prototype'].includes(raw)) fail(path, '必须是安全 ID。')
  return raw as string
}
const oneOf = <T extends string>(value: unknown, values: readonly T[], path: string): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) fail(path, `必须是 ${values.join('/')} 之一。`)
  return value as T
}
const array = (raw: unknown, min: number, max: number, path: string): unknown[] => {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) fail(path, `必须包含 ${min}–${max} 项。`)
  return raw as unknown[]
}
const unique = (values: string[], path: string) => {
  if (new Set(values).size !== values.length) fail(path, 'ID 不可重复。')
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
function hash32(input: string, seed: number): string {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Stable, browser-safe content identity for optimistic base-package checks. */
export function packageFingerprint(pkg: PublishedAttraction): string {
  const serialized = canonical(pkg)
  return hash32(serialized, 0x811c9dc5) + hash32(serialized, 0x9e3779b9)
}

function assertBasePackage(raw: unknown, path: string): BasePackageIdentity {
  const value = strict(raw, ['id', 'version', 'fingerprint'], path)
  const version = value.version
  if (!Number.isSafeInteger(version) || (version as number) < 0) fail(`${path}.version`, '必须是非负安全整数。')
  if (typeof value.fingerprint !== 'string' || !FINGERPRINT.test(value.fingerprint)) fail(`${path}.fingerprint`, '必须是 16 位小写十六进制指纹。')
  return { id: id(value.id, `${path}.id`), version: version as number, fingerprint: value.fingerprint as string }
}

export function assertCreativeBrief(raw: unknown): CreativeBrief {
  const value = strict(raw, ['attractionId', 'theme', 'audience', 'targetMinutes', 'style'], 'brief')
  if (!Number.isInteger(value.targetMinutes) || (value.targetMinutes as number) < 3 || (value.targetMinutes as number) > 30) fail('brief.targetMinutes', '必须是 3–30 分钟整数。')
  return {
    attractionId: id(value.attractionId, 'brief.attractionId'), theme: text(value.theme, 120, 'brief.theme'),
    audience: oneOf(value.audience, ['general', 'family'], 'brief.audience'), targetMinutes: value.targetMinutes as number,
    style: oneOf(value.style, ['heritage', 'cosmos'], 'brief.style'),
  }
}

function assertSource(raw: unknown, path: string): LocationSource {
  const value = strict(raw, ['id', 'url', 'title', 'authority'], path)
  const url = text(value.url, 2000, `${path}.url`)
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail(`${path}.url`, '必须是无凭据 HTTPS URL。') } catch { fail(`${path}.url`, '必须是无凭据 HTTPS URL。') }
  return { id: id(value.id, `${path}.id`), url, title: text(value.title, 200, `${path}.title`), authority: oneOf(value.authority, ['official', 'secondary'], `${path}.authority`) }
}

function assertMedia(raw: unknown, path: string): LocationMedia {
  const value = strict(raw, ['id', 'kind', 'assetRef', 'sourceIds'], path)
  const sourceIds = array(value.sourceIds, 0, 20, `${path}.sourceIds`).map((item, index) => id(item, `${path}.sourceIds[${index}]`))
  unique(sourceIds, `${path}.sourceIds`)
  return { id: id(value.id, `${path}.id`), kind: oneOf(value.kind, ['image', 'audio'], `${path}.kind`), assetRef: text(value.assetRef, 500, `${path}.assetRef`), sourceIds }
}

export function assertLocationNotes(raw: unknown): LocationNotes {
  const value = strict(raw, ['basePackage', 'spots', 'media', 'sources'], 'locationNotes')
  const spots = array(value.spots, 1, 100, 'locationNotes.spots').map((rawSpot, index) => {
    const path = `locationNotes.spots[${index}]`
    const spot = strict(rawSpot, ['id', 'name', 'summary'], path)
    return { id: id(spot.id, `${path}.id`), name: text(spot.name, 120, `${path}.name`), summary: text(spot.summary, 2000, `${path}.summary`) }
  })
  const media = array(value.media, 0, 200, 'locationNotes.media').map((item, index) => assertMedia(item, `locationNotes.media[${index}]`))
  const sources = array(value.sources, 0, 100, 'locationNotes.sources').map((item, index) => assertSource(item, `locationNotes.sources[${index}]`))
  unique(spots.map(spot => spot.id), 'locationNotes.spots'); unique(media.map(item => item.id), 'locationNotes.media'); unique(sources.map(source => source.id), 'locationNotes.sources')
  const sourceIds = new Set(sources.map(source => source.id))
  for (const item of media) for (const sourceId of item.sourceIds) if (!sourceIds.has(sourceId)) fail(`locationNotes.media.${item.id}`, `引用了未知来源 ${sourceId}。`)
  return { basePackage: assertBasePackage(value.basePackage, 'locationNotes.basePackage'), spots, media, sources }
}

export function assertStoryConcept(raw: unknown): StoryConcept {
  const value = strict(raw, ['id', 'title', 'premise', 'protagonist', 'desire', 'suspense', 'locationRole', 'resolution'], 'concept')
  return {
    id: id(value.id, 'concept.id'), title: text(value.title, 160, 'concept.title'), premise: text(value.premise, 500, 'concept.premise'),
    protagonist: text(value.protagonist, 300, 'concept.protagonist'), desire: text(value.desire, 300, 'concept.desire'),
    suspense: text(value.suspense, 500, 'concept.suspense'), locationRole: text(value.locationRole, 500, 'concept.locationRole'),
    resolution: text(value.resolution, 500, 'concept.resolution'),
  }
}

function assertBranch(raw: unknown, path: string): BeatBranch {
  const value = strict(raw, ['id', 'label', 'summary', 'spotId', 'sceneIds', 'rejoinsAtBeatId'], path)
  const sceneIds = array(value.sceneIds, 1, 20, `${path}.sceneIds`).map((item, index) => id(item, `${path}.sceneIds[${index}]`))
  unique(sceneIds, `${path}.sceneIds`)
  return { id: id(value.id, `${path}.id`), label: text(value.label, 100, `${path}.label`), summary: text(value.summary, 1000, `${path}.summary`), spotId: id(value.spotId, `${path}.spotId`), sceneIds, rejoinsAtBeatId: id(value.rejoinsAtBeatId, `${path}.rejoinsAtBeatId`) }
}

function assertBeat(raw: unknown, path: string): StoryBeat {
  const value = strict(raw, ['id', 'type', 'title', 'summary', 'spotId', 'sceneIds', 'observationTask', 'branches'], path)
  const sceneIds = array(value.sceneIds, 1, 20, `${path}.sceneIds`).map((item, index) => id(item, `${path}.sceneIds[${index}]`))
  unique(sceneIds, `${path}.sceneIds`)
  const beat: StoryBeat = {
    id: id(value.id, `${path}.id`), type: oneOf(value.type, ['opening', 'development', 'choice', 'observation', 'ending'], `${path}.type`),
    title: text(value.title, 160, `${path}.title`), summary: text(value.summary, 1000, `${path}.summary`), spotId: id(value.spotId, `${path}.spotId`), sceneIds,
  }
  if (value.observationTask !== undefined) beat.observationTask = text(value.observationTask, 500, `${path}.observationTask`)
  if (value.branches !== undefined) {
    beat.branches = array(value.branches, 2, 4, `${path}.branches`).map((branch, index) => assertBranch(branch, `${path}.branches[${index}]`))
    unique(beat.branches.map(branch => branch.id), `${path}.branches`)
  }
  if ((beat.type === 'choice') !== !!beat.branches) fail(path, 'choice 节拍必须且只能包含 branches。')
  if (beat.type === 'observation' && !beat.observationTask) fail(path, 'observation 节拍必须包含 observationTask。')
  return beat
}

export function assertBeatSheet(raw: unknown): BeatSheet {
  const value = strict(raw, ['conceptId', 'beats'], 'beatSheet')
  const beats = array(value.beats, 4, 6, 'beatSheet.beats').map((beat, index) => assertBeat(beat, `beatSheet.beats[${index}]`))
  unique(beats.map(beat => beat.id), 'beatSheet.beats')
  if (beats[0].type !== 'opening' || beats.at(-1)?.type !== 'ending') fail('beatSheet.beats', '首节拍必须为 opening，末节拍必须为 ending。')
  const beatIds = new Set(beats.map(beat => beat.id))
  for (const beat of beats) for (const branch of beat.branches ?? []) if (!beatIds.has(branch.rejoinsAtBeatId)) fail(`beatSheet.beats.${beat.id}`, `分支汇合节拍 ${branch.rejoinsAtBeatId} 不存在。`)
  return { conceptId: id(value.conceptId, 'beatSheet.conceptId'), beats }
}

function assertResource(raw: unknown, path: string): CandidateResource {
  const value = strict(raw, ['id', 'kind', 'assetRef', 'value', 'sourceIds'], path)
  const kind = oneOf(value.kind, ['image', 'audio'], `${path}.kind`)
  const resourceValue = text(value.value, 3_000_000, `${path}.value`)
  if (!safeAssetUrl(resourceValue, kind)) fail(`${path}.value`, '不是安全可解析的媒体。')
  const sourceIds = array(value.sourceIds, 0, 20, `${path}.sourceIds`).map((item, index) => id(item, `${path}.sourceIds[${index}]`))
  unique(sourceIds, `${path}.sourceIds`)
  return { id: id(value.id, `${path}.id`), kind, assetRef: text(value.assetRef, 500, `${path}.assetRef`), value: resourceValue, sourceIds }
}

function assertManifest(raw: unknown): ResourceManifest {
  const value = strict(raw, ['resources', 'sources'], 'resourceManifest')
  const resources = array(value.resources, 0, 100, 'resourceManifest.resources').map((item, index) => assertResource(item, `resourceManifest.resources[${index}]`))
  const sources = array(value.sources, 0, 100, 'resourceManifest.sources').map((item, index) => assertSource(item, `resourceManifest.sources[${index}]`))
  unique(resources.map(item => item.id), 'resourceManifest.resources'); unique(resources.map(item => item.assetRef), 'resourceManifest.resources.assetRef'); unique(sources.map(item => item.id), 'resourceManifest.sources')
  const sourceIds = new Set(sources.map(source => source.id))
  for (const resource of resources) for (const sourceId of resource.sourceIds) if (!sourceIds.has(sourceId)) fail(`resourceManifest.resources.${resource.id}`, `引用了未知来源 ${sourceId}。`)
  return { resources, sources }
}

function assertDiagnostic(raw: unknown, path: string): AgentDiagnostic {
  const value = strict(raw, ['level', 'message', 'beatId', 'sceneId'], path)
  const result: AgentDiagnostic = { level: oneOf(value.level, ['info', 'warning'], `${path}.level`), message: text(value.message, 1000, `${path}.message`) }
  if (value.beatId !== undefined) result.beatId = id(value.beatId, `${path}.beatId`)
  if (value.sceneId !== undefined) result.sceneId = id(value.sceneId, `${path}.sceneId`)
  return result
}

function equalIdentity(left: BasePackageIdentity, right: BasePackageIdentity): boolean {
  return left.id === right.id && left.version === right.version && left.fingerprint === right.fingerprint
}

/** Validates an agent handoff without importing server code or mutating the package/candidate. */
export function assertAgentCandidate(raw: unknown, pkg: PublishedAttraction): AgentCandidate {
  const value = strict(raw, ['schemaVersion', 'basePackage', 'brief', 'locationNotes', 'selectedConcept', 'beatSheet', 'experience', 'presentation', 'resourceManifest', 'diagnostics'], 'candidate')
  if (value.schemaVersion !== 1) fail('candidate.schemaVersion', '只支持 schemaVersion=1。')
  const basePackage = assertBasePackage(value.basePackage, 'candidate.basePackage')
  const expected: BasePackageIdentity = { id: pkg.id, version: pkg.publishedAt, fingerprint: packageFingerprint(pkg) }
  if (basePackage.id !== expected.id) fail('candidate.basePackage.id', `与基础包 ${expected.id} 不一致。`)
  if (basePackage.version !== expected.version) fail('candidate.basePackage.version', `基础包版本已失效，当前版本为 ${expected.version}。`)
  if (basePackage.fingerprint !== expected.fingerprint) fail('candidate.basePackage.fingerprint', '基础包内容指纹已失效。')

  const brief = assertCreativeBrief(value.brief)
  const locationNotes = assertLocationNotes(value.locationNotes)
  const selectedConcept = assertStoryConcept(value.selectedConcept)
  const beatSheet = assertBeatSheet(value.beatSheet)
  const resourceManifest = assertManifest(value.resourceManifest)
  const diagnostics = array(value.diagnostics, 0, 100, 'candidate.diagnostics').map((item, index) => assertDiagnostic(item, `candidate.diagnostics[${index}]`))
  if (brief.attractionId !== expected.id) fail('candidate.brief.attractionId', '与基础包标识不一致。')
  if (!equalIdentity(locationNotes.basePackage, expected)) fail('candidate.locationNotes.basePackage', '与当前基础包标识、版本或指纹不一致。')
  if (beatSheet.conceptId !== selectedConcept.id) fail('candidate.beatSheet.conceptId', '与所选概念 ID 不一致。')

  const packageSpots = new Map(pkg.spots.map(spot => [spot.id, spot.name]))
  unique(locationNotes.spots.map(spot => spot.id), 'candidate.locationNotes.spots')
  for (const spot of locationNotes.spots) if (packageSpots.get(spot.id) !== spot.name) fail(`candidate.locationNotes.spots.${spot.id}`, '不是基础包中的已知地点或名称不一致。')
  const knownSpotIds = new Set(locationNotes.spots.map(spot => spot.id))
  for (const beat of beatSheet.beats) {
    if (!knownSpotIds.has(beat.spotId)) fail(`candidate.beatSheet.beats.${beat.id}.spotId`, `未知地点 ${beat.spotId}。`)
    for (const branch of beat.branches ?? []) if (!knownSpotIds.has(branch.spotId)) fail(`candidate.beatSheet.beats.${beat.id}.branches.${branch.id}.spotId`, `未知地点 ${branch.spotId}。`)
  }

  const sources = [...locationNotes.sources, ...resourceManifest.sources]
  unique(sources.map(source => source.id), 'candidate sources')
  const packageSources = pkg.experience?.sources ?? []
  for (const source of locationNotes.sources) if (!packageSources.some(known => canonical(known) === canonical(source))) fail(`candidate.locationNotes.sources.${source.id}`, '不属于基础包已有来源。')
  const allSourceIds = new Set(sources.map(source => source.id))
  const assets: Record<string, string> = { ...(pkg.assets ?? {}) }
  const controlledRefs = new Map(resourceManifest.resources.map(resource => [resource.assetRef, resource]))
  for (const resource of resourceManifest.resources) {
    if (Object.hasOwn(assets, resource.assetRef) && assets[resource.assetRef] !== resource.value) fail(`candidate.resourceManifest.resources.${resource.id}`, '不可覆盖基础包同名素材。')
    assets[resource.assetRef] = resource.value
  }
  const packageMedia = [pkg.coverImage, ...pkg.spots.map(spot => spot.image), ...(pkg.experience?.scenes.flatMap(scene => scene.blocks.flatMap(block => block.assetRef ? [block.assetRef] : [])) ?? [])]
  const allowedMedia = new Set([
    ...packageMedia.flatMap(ref => [ref, resolveMediaUrl(pkg, ref)]),
    ...Object.entries(pkg.assets ?? {}).flatMap(([ref, value]) => [ref, value]),
    ...resourceManifest.resources.flatMap(resource => [resource.assetRef, resource.value]),
  ])
  for (const media of locationNotes.media) {
    const resolved = resolveMediaUrl({ assets }, media.assetRef)
    if (!allowedMedia.has(media.assetRef) && !allowedMedia.has(resolved)) fail(`candidate.locationNotes.media.${media.id}`, `媒体 ${media.assetRef} 无法通过基础包或候选资源清单解析。`)
    if (!safeAssetUrl(resolved, media.kind)) fail(`candidate.locationNotes.media.${media.id}`, `媒体 ${media.assetRef} 无法安全解析。`)
    for (const sourceId of media.sourceIds) if (!allSourceIds.has(sourceId)) fail(`candidate.locationNotes.media.${media.id}`, `引用了未知来源 ${sourceId}。`)
  }
  for (const resource of resourceManifest.resources) for (const sourceId of resource.sourceIds) if (!allSourceIds.has(sourceId)) fail(`candidate.resourceManifest.resources.${resource.id}`, `引用了未知来源 ${sourceId}。`)

  const presentation = assertPresentation(value.presentation)
  if (!presentation) fail('candidate.presentation', '必须提供展示配置。')
  const requiredPresentation = presentation as NonNullable<typeof presentation>
  const experience = assertExperience(value.experience, { spotIds: [...knownSpotIds], assets })
  for (const source of experience.sources) if (!sources.some(known => canonical(known) === canonical(source))) fail(`candidate.experience.sources.${source.id}`, '未登记在基础包资料或候选资源清单中。')
  const sceneIds = new Set(experience.scenes.map(scene => scene.id))
  const mappedSceneIds = beatSheet.beats.flatMap(beat => [...beat.sceneIds, ...(beat.branches ?? []).flatMap(branch => branch.sceneIds)])
  const mappedSceneSet = new Set(mappedSceneIds)
  if (mappedSceneSet.size !== sceneIds.size || [...mappedSceneSet].some(sceneId => !sceneIds.has(sceneId))) fail('candidate.beatSheet', '节拍与 experience 场景映射不一致。')
  for (const beat of beatSheet.beats) {
    for (const sceneId of beat.sceneIds) if (experience.scenes.find(scene => scene.id === sceneId)?.spotId !== beat.spotId) fail(`candidate.beatSheet.beats.${beat.id}`, `场景 ${sceneId} 的地点与节拍不一致。`)
    for (const branch of beat.branches ?? []) for (const sceneId of branch.sceneIds) if (experience.scenes.find(scene => scene.id === sceneId)?.spotId !== branch.spotId) fail(`candidate.beatSheet.beats.${beat.id}.branches.${branch.id}`, `场景 ${sceneId} 的地点与分支不一致。`)
  }
  const manifestRefs = new Set(resourceManifest.resources.map(resource => resource.assetRef))
  for (const scene of experience.scenes) for (const block of scene.blocks) {
    const resolved = block.assetRef ? resolveMediaUrl({ assets }, block.assetRef) : undefined
    if (block.assetRef && !allowedMedia.has(block.assetRef) && !allowedMedia.has(resolved!)) fail(`candidate.experience.scene:${scene.id}`, `媒体 ${block.assetRef} 无法通过基础包或候选资源清单解析。`)
    if (block.assetRef && !safeAssetUrl(resolved, block.type === 'audio' ? 'audio' : 'image')) fail(`candidate.experience.scene:${scene.id}`, `媒体 ${block.assetRef} 无法安全解析。`)
    if (block.assetRef && controlledRefs.has(block.assetRef) && !manifestRefs.has(block.assetRef)) fail(`candidate.experience.scene:${scene.id}`, '受控素材未登记。')
    for (const sourceId of block.sourceIds ?? []) if (!allSourceIds.has(sourceId)) fail(`candidate.experience.scene:${scene.id}`, `引用了未知来源 ${sourceId}。`)
  }
  return { schemaVersion: 1, basePackage, brief, locationNotes, selectedConcept, beatSheet, experience, presentation: requiredPresentation, resourceManifest, diagnostics }
}
