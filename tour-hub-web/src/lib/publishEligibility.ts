import type { DraftAttraction } from '../types/attraction'

type PublishableDraft = Pick<DraftAttraction, 'spots' | 'storyReview'>

export function canPublishDraft(draft: PublishableDraft): boolean {
  return draft.spots.length > 0 && (!draft.storyReview || draft.storyReview.status === 'approved')
}

export function publishReadiness(draft: PublishableDraft): string {
  if (!draft.spots.length) return '还需：生成至少一个地点'
  if (draft.storyReview?.status === 'pending') return '还需：确认人工审核'
  return draft.storyReview ? '已可发布' : '可按普通导览发布'
}
