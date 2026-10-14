import { createHash } from 'node:crypto'
import { buildTemplate, type BuilderInput } from '../../src/experience/builder.ts'
import { resolvePresentation, type ExperiencePresentation } from '../../src/experience/presentation.ts'
import type { PublishedAttraction } from '../../src/lib/tourPackage.ts'
import type { AgentCandidate, BasePackageIdentity, BeatSheet, CreativeBrief, LocationNotes, LocationSource, StoryConcept } from '../../src/experience/agent/contracts.ts'
import { assertAgentCandidate, assertBeatSheet, assertCreativeBrief, assertStoryConcept, packageFingerprint } from '../../src/experience/agent/validators.ts'
import { parseModelJson } from './concepts.ts'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : object(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value)

export interface CompileRequest {
  brief: CreativeBrief
  basePackage: BasePackageIdentity
  selectedConcept: StoryConcept
  researchId?: string
}

export interface CompiledArtifact {
  id: string
  version: 1
  hash: string
}

export function assertCompileRequest(raw: unknown): CompileRequest {
  if (!object(raw) || Object.keys(raw).some(key => !['brief', 'basePackage', 'selectedConcept', 'researchId'].includes(key)) || !Object.hasOwn(raw, 'brief') || !Object.hasOwn(raw, 'basePackage') || !Object.hasOwn(raw, 'selectedConcept')) {
    throw new Error('编译请求必须且只能包含 brief、basePackage、selectedConcept。')
  }
  const brief = assertCreativeBrief(raw.brief)
  const selectedConcept = assertStoryConcept(raw.selectedConcept)
  if (raw.researchId !== undefined && (typeof raw.researchId !== 'string' || !/^research-[a-f0-9-]{36}$/.test(raw.researchId))) throw new Error('researchId 必须是有效研究结果 ID。')
  const identity = raw.basePackage
  if (!object(identity) || Object.keys(identity).length !== 3 || typeof identity.id !== 'string' || identity.id !== brief.attractionId
    || !Number.isSafeInteger(identity.version) || (identity.version as number) < 0
    || typeof identity.fingerprint !== 'string' || !/^[a-f0-9]{16}$/.test(identity.fingerprint)) {
    throw new Error('basePackage 必须是与 brief 景点一致的有效包标识。')
  }
  return { brief, basePackage: { id: identity.id, version: identity.version as number, fingerprint: identity.fingerprint }, selectedConcept, ...(raw.researchId ? { researchId: raw.researchId as string } : {}) }
}

export function assertCurrentBinding(request: CompileRequest, pkg: PublishedAttraction): void {
  const current = { id: pkg.id, version: pkg.publishedAt, fingerprint: packageFingerprint(pkg) }
  if (request.brief.attractionId !== current.id || request.basePackage.id !== current.id) throw new Error('所选概念与基础包不匹配。')
  if (request.basePackage.version !== current.version) throw new Error('基础包版本已失效。')
  if (request.basePackage.fingerprint !== current.fingerprint) throw new Error('基础包内容指纹已失效。')
}

export function compileBlueprint(pkg: PublishedAttraction, request: CompileRequest, notes: LocationNotes) {
  const input: BuilderInput = {
    attractionId: pkg.id,
    theme: request.brief.theme,
    audience: request.brief.audience,
    duration: request.brief.targetMinutes,
    tone: request.brief.style === 'cosmos' ? 'lively' : 'poetic',
    mode: 'online',
  }
  const experience = buildTemplate(pkg, input, `compile-${request.selectedConcept.id}`).experience
  experience.sources = structuredClone(notes.sources)
  const presentation = resolvePresentation(pkg.presentation)
  return { experience, presentation, locationNotes: notes }
}

function equalPresentation(left: ExperiencePresentation, right: ExperiencePresentation): boolean {
  return canonical(left) === canonical(right)
}

export function assembleCandidate(raw: unknown, pkg: PublishedAttraction, request: CompileRequest, notes: LocationNotes, presentation: ExperiencePresentation, researchSources: LocationSource[] = []): AgentCandidate {
  if (!object(raw) || Object.keys(raw).length !== 3 || !Object.hasOwn(raw, 'beatSheet') || !Object.hasOwn(raw, 'experience') || !Object.hasOwn(raw, 'presentation')) {
    throw new Error('模型响应必须严格包含 beatSheet、experience、presentation。')
  }
  const beatSheet: BeatSheet = assertBeatSheet(raw.beatSheet)
  if (beatSheet.conceptId !== request.selectedConcept.id) throw new Error('节拍概念与所选概念不一致。')
  if (!equalPresentation(raw.presentation as ExperiencePresentation, presentation)) throw new Error('展示配置必须保持基础包设置。')
  return assertAgentCandidate({
    schemaVersion: 1,
    basePackage: request.basePackage,
    brief: request.brief,
    locationNotes: notes,
    selectedConcept: request.selectedConcept,
    beatSheet,
    experience: raw.experience,
    presentation,
    resourceManifest: { resources: [], sources: researchSources },
    diagnostics: [
      { level: 'info', message: '候选已通过场景、节拍、地点、动作、媒体和来源白名单校验。' },
      { level: 'warning', message: '模型已改写虚构叙事；故事效果和目标时长仍需人工审核。' },
    ],
  }, pkg)
}

export function parseCompileOutput(content: string, pkg: PublishedAttraction, request: CompileRequest, notes: LocationNotes, presentation: ExperiencePresentation, researchSources: LocationSource[] = []): AgentCandidate {
  return assembleCandidate(parseModelJson(content), pkg, request, notes, presentation, researchSources)
}

export function artifactFor(candidate: AgentCandidate): CompiledArtifact {
  const hash = createHash('sha256').update(canonical(candidate)).digest('hex')
  return { id: `agent-${hash.slice(0, 24)}`, version: 1, hash }
}

export function repairContext(content: string, error: unknown): { invalidOutput: string; diagnostics: string[] } {
  let invalidOutput: string
  try { invalidOutput = canonical(parseModelJson(content)) }
  catch { invalidOutput = content }
  const sanitize = (value: string) => value.replace(/https?:\/\/\S+/gi, '[redacted-url]').replace(/(?:bearer|api[_ -]?key)\s*[:=]?\s*\S+/gi, '[redacted-secret]')
  const message = error instanceof Error ? error.message : '结构或候选校验失败。'
  return { invalidOutput: sanitize(invalidOutput).slice(0, 20_000), diagnostics: [sanitize(message).slice(0, 500)] }
}
