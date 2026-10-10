import { assertBuilderCandidate, type BuilderResult } from './builder.ts'
import { assertExperience } from './experienceSchema.ts'
import { publishedToDraft } from '../lib/draftStore.ts'
import { resolveMediaUrl, type PublishedAttraction } from '../lib/tourPackage.ts'
import type { DraftAttraction } from '../types/attraction.ts'

export function createBuilderDraft(pkg: PublishedAttraction, result: BuilderResult, id: string): DraftAttraction {
  if (result.sourceAttractionId !== pkg.id) throw new Error('候选稿与原景点不匹配，请重新生成。')
  const experience = structuredClone(assertBuilderCandidate(result.experience, pkg))
  for (const scene of experience.scenes) for (const block of scene.blocks) if (block.assetRef) block.assetRef = resolveMediaUrl(pkg, block.assetRef)
  const now = Date.now()
  return { ...publishedToDraft(pkg), id, name: `${pkg.name} · ${experience.title}`, description: experience.premise,
    experience: { ...experience, id }, status: 'draft', createdAt: now, updatedAt: now,
    storyReview: { status: 'pending', generatedBy: result.mode, sourceAttractionId: pkg.id, requestId: result.requestId, diagnostics: result.diagnostics } }
}

export function approveStoryDraft(draft: DraftAttraction): DraftAttraction {
  if (!draft.experience) throw new Error('草稿没有故事。')
  assertExperience(draft.experience, { spotIds: draft.spots.map(s => s.id) })
  return { ...draft, storyReview: { ...draft.storyReview, generatedBy: draft.storyReview?.generatedBy ?? 'manual', status: 'approved', reviewedAt: Date.now() } }
}
