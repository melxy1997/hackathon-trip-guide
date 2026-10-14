import { assertBuilderCandidate, buildTemplate, type BuilderResult } from './builder.ts'
import { assertExperience } from './experienceSchema.ts'
import { publishedToDraft } from '../lib/draftStore.ts'
import { resolveMediaUrl, type PublishedAttraction } from '../lib/tourPackage.ts'
import type { DraftAttraction } from '../types/attraction.ts'

/** Start from the creator's own POIs, without first publishing or using a model. */
export function createTemplateStory(draft: DraftAttraction): DraftAttraction {
  const pkg: PublishedAttraction = { schemaVersion: 1, id: draft.id, name: draft.name, description: draft.description,
    start: draft.start, zoom: draft.zoom, spots: draft.spots, coverImage: draft.coverImage, publishedAt: draft.updatedAt }
  const result = buildTemplate(pkg, { attractionId: pkg.id, theme: `${draft.name}：写给未来的一封信`, audience: 'general', duration: 5, tone: 'poetic', mode: 'template' }, crypto.randomUUID())
  return { ...draft, status: 'draft', experience: result.experience,
    storyReview: { status: 'pending', generatedBy: 'template', sourceAttractionId: draft.id, requestId: result.requestId, diagnostics: result.diagnostics } }
}

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
