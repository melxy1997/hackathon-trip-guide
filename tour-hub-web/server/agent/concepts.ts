import type { StoryConcept } from '../../src/experience/agent/contracts.ts'
import { assertStoryConcept } from '../../src/experience/agent/validators.ts'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

export function parseModelJson(content: string): unknown {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced ? fenced[1] : trimmed)
}

const normalized = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')

export function assertConceptResponse(raw: unknown): StoryConcept[] {
  if (!object(raw) || Object.keys(raw).length !== 1 || !Array.isArray(raw.concepts) || raw.concepts.length !== 2) {
    throw new Error('模型响应必须严格包含两个 concepts。')
  }
  const concepts = raw.concepts.map(assertStoryConcept)
  if (concepts[0].id === concepts[1].id) throw new Error('概念 ID 不可重复。')
  for (const field of ['premise', 'suspense', 'locationRole', 'resolution'] as const) {
    if (normalized(concepts[0][field]) === normalized(concepts[1][field])) throw new Error(`两个概念的 ${field} 必须实质不同。`)
  }
  return concepts
}
