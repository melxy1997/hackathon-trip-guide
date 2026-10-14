import type { AgentCandidate, BasePackageIdentity, CreativeBrief, StoryConcept } from './contracts.ts'
import type { AgentDraftProvenance } from './draft.ts'
import { assertAgentCandidate, assertCreativeBrief, assertStoryConcept, packageFingerprint } from './validators.ts'
import type { PublishedAttraction } from '../../lib/tourPackage.ts'

export const STUDIO_SESSION_KEY = 'timewalker:studio:v1'
export const MAX_STUDIO_FILE_BYTES = 8 * 1024 * 1024
const MAX_LOCAL_CHARS = 750_000

export interface StudioEvidence {
  requestId: string
  model?: string
  durationMs?: number
  attempts?: number
}
export interface StudioSession {
  schemaVersion: 1
  savedAt: number
  brief: CreativeBrief
  concepts: StoryConcept[]
  conceptBrief?: CreativeBrief
  basePackage?: BasePackageIdentity
  selection: string
  researchId?: string
  compiled?: { candidate: AgentCandidate; provenance: AgentDraftProvenance; evidence?: StudioEvidence }
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export function sameBrief(left: CreativeBrief | undefined, right: CreativeBrief): boolean {
  return !!left && ['attractionId', 'theme', 'audience', 'targetMinutes', 'style'].every(key => left[key as keyof CreativeBrief] === right[key as keyof CreativeBrief])
}
const bounded = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max

/** Parse envelope first; candidate/base-package validation needs the current published package. */
export function parseStudioSession(content: string): StudioSession {
  if (new TextEncoder().encode(content).length > MAX_STUDIO_FILE_BYTES) throw new Error('创作成果文件超过 8 MiB，请使用较小的素材引用。')
  const value: unknown = JSON.parse(content)
  if (!object(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.savedAt) || (value.savedAt as number) < 0
    || Object.keys(value).some(key => !['schemaVersion', 'savedAt', 'brief', 'concepts', 'conceptBrief', 'basePackage', 'selection', 'researchId', 'compiled'].includes(key))) throw new Error('创作成果文件格式无效。')
  const brief = assertCreativeBrief(value.brief)
  if (!Array.isArray(value.concepts) || ![0, 2].includes(value.concepts.length)) throw new Error('保存的构想必须为空或恰好两个。')
  const concepts = value.concepts.map(assertStoryConcept)
  if (concepts.length && concepts[0].id === concepts[1].id) throw new Error('保存的构想 ID 重复。')
  if (typeof value.selection !== 'string' || (value.selection && !concepts.some(c => c.id === value.selection))) throw new Error('保存的构想选择无效。')
  const result: StudioSession = { schemaVersion: 1, savedAt: value.savedAt as number, brief, concepts, selection: value.selection }
  if (concepts.length) {
    result.conceptBrief = assertCreativeBrief(value.conceptBrief)
    const base = value.basePackage
    if (!object(base) || base.id !== result.conceptBrief.attractionId || !Number.isSafeInteger(base.version) || (base.version as number) < 0 || typeof base.fingerprint !== 'string' || !/^[a-f0-9]{16}$/.test(base.fingerprint)) throw new Error('保存的基础包绑定无效。')
    result.basePackage = { id: base.id as string, version: base.version as number, fingerprint: base.fingerprint }
  }
  if (value.researchId !== undefined) {
    if (typeof value.researchId !== 'string' || !/^research-[a-f0-9-]{36}$/.test(value.researchId)) throw new Error('保存的研究 ID 无效。')
    result.researchId = value.researchId
  }
  if (value.compiled !== undefined) {
    const compiled = value.compiled
    if (!object(compiled) || !object(compiled.candidate) || !object(compiled.provenance)) throw new Error('保存的候选格式无效。')
    const provenance: AgentDraftProvenance = {}
    for (const key of ['requestId', 'artifactId', 'artifactHash'] as const) {
      if (compiled.provenance[key] !== undefined) {
        if (!bounded(compiled.provenance[key], 200)) throw new Error('候选来源记录无效。')
        provenance[key] = compiled.provenance[key] as string
      }
    }
    if (compiled.provenance.artifactVersion !== undefined) {
      if (!Number.isSafeInteger(compiled.provenance.artifactVersion) || (compiled.provenance.artifactVersion as number) < 1) throw new Error('候选产物版本无效。')
      provenance.artifactVersion = compiled.provenance.artifactVersion as number
    }
    result.compiled = { candidate: compiled.candidate as unknown as AgentCandidate, provenance }
    const evidence = compiled.evidence
    if (evidence !== undefined) {
      if (!object(evidence) || !bounded(evidence.requestId, 200) || (evidence.model !== undefined && !bounded(evidence.model, 200))) throw new Error('运行记录格式无效。')
      for (const key of ['durationMs', 'attempts']) if (evidence[key] !== undefined && (!Number.isSafeInteger(evidence[key]) || (evidence[key] as number) < 0)) throw new Error('运行耗时或次数无效。')
      result.compiled.evidence = { requestId: evidence.requestId as string, ...(evidence.model ? { model: evidence.model as string } : {}),
        ...(evidence.durationMs !== undefined ? { durationMs: evidence.durationMs as number } : {}), ...(evidence.attempts !== undefined ? { attempts: evidence.attempts as number } : {}) }
    }
  }
  return result
}

export async function validateStudioSession(session: StudioSession, load: (id: string) => Promise<PublishedAttraction>): Promise<StudioSession> {
  if (session.basePackage) {
    const pkg = await load(session.basePackage.id)
    if (pkg.publishedAt !== session.basePackage.version || packageFingerprint(pkg) !== session.basePackage.fingerprint) throw new Error('保存的构想基础包已更新，请重新生成构想。')
  }
  if (session.compiled) {
    const candidate = session.compiled.candidate
    const brief = assertCreativeBrief(candidate.brief)
    session.compiled.candidate = assertAgentCandidate(candidate, await load(brief.attractionId))
  }
  return session
}

export function saveStudioSession(session: StudioSession, storage: Pick<Storage, 'setItem'>): boolean {
  const content = JSON.stringify(session)
  if (content.length > MAX_LOCAL_CHARS) return false
  try { storage.setItem(STUDIO_SESSION_KEY, content); return true } catch { return false }
}
