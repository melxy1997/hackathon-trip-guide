import { publishedToDraft } from '../../lib/draftStore.ts'
import { resolveMediaUrl, type PublishedAttraction } from '../../lib/tourPackage.ts'
import type { DraftAttraction } from '../../types/attraction.ts'
import type { AgentCandidate } from './contracts.ts'
import { assertAgentCandidate } from './validators.ts'

export interface AgentDraftProvenance {
  requestId?: string
  artifactId?: string
  artifactVersion?: number
  artifactHash?: string
}

/** Converts a validated handoff into an independent, unsaved editor draft. */
export function createAgentDraft(
  basePkg: PublishedAttraction,
  candidate: AgentCandidate,
  newId: string,
  provenance: AgentDraftProvenance = {},
): DraftAttraction {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(newId) || ['__proto__', 'constructor', 'prototype'].includes(newId) || newId === basePkg.id) {
    throw new Error('Agent 草稿需要不同于基础包的安全新 ID。')
  }
  const validated = assertAgentCandidate(candidate, basePkg)
  const assets: Record<string, string> = { ...(basePkg.assets ?? {}) }
  for (const resource of validated.resourceManifest.resources) {
    if (Object.hasOwn(assets, resource.assetRef) && assets[resource.assetRef] !== resource.value) {
      throw new Error(`Agent 候选素材不可覆盖基础包同名素材：${resource.assetRef}`)
    }
    assets[resource.assetRef] = resource.value
  }

  const draft = publishedToDraft(basePkg)
  const resolve = (ref: string) => resolveMediaUrl({ assets }, ref)
  const experience = structuredClone(validated.experience)
  experience.id = newId
  for (const scene of experience.scenes) for (const block of scene.blocks) {
    if (block.assetRef) block.assetRef = resolve(block.assetRef)
  }
  const now = Date.now()
  return {
    ...draft,
    id: newId,
    name: `${basePkg.name} · ${experience.title}`,
    description: experience.premise,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    coverImage: resolve(basePkg.coverImage),
    spots: draft.spots.map(spot => ({ ...spot, image: resolve(spot.image) })),
    experience,
    presentation: structuredClone(validated.presentation),
    storyReview: {
      status: 'pending',
      generatedBy: 'agent',
      sourceAttractionId: basePkg.id,
      ...(provenance.requestId ? { requestId: provenance.requestId } : {}),
      ...(provenance.artifactId ? { artifactId: provenance.artifactId } : {}),
      ...(provenance.artifactVersion !== undefined ? { artifactVersion: provenance.artifactVersion } : {}),
      ...(provenance.artifactHash ? { artifactHash: provenance.artifactHash } : {}),
      diagnostics: validated.diagnostics.map(item => item.message),
    },
  }
}
