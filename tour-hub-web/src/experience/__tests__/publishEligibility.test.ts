import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canPublishDraft, publishReadiness } from '../../lib/publishEligibility.ts'

test('storyless drafts with spots retain the manual publish path', () => {
  assert.equal(canPublishDraft({ spots: [{} as never] }), true)
  assert.equal(publishReadiness({ spots: [{} as never] }), '可按普通导览发布')
})

test('story review is required only when a story candidate exists', () => {
  assert.equal(canPublishDraft({ spots: [{} as never], storyReview: { status: 'pending', generatedBy: 'manual' } }), false)
  assert.equal(publishReadiness({ spots: [{} as never], storyReview: { status: 'pending', generatedBy: 'manual' } }), '还需：确认人工审核')
  assert.equal(canPublishDraft({ spots: [{} as never], storyReview: { status: 'approved', generatedBy: 'manual' } }), true)
  assert.equal(publishReadiness({ spots: [{} as never], storyReview: { status: 'approved', generatedBy: 'manual' } }), '已可发布')
})

test('drafts without spots cannot publish', () => {
  assert.equal(canPublishDraft({ spots: [] }), false)
  assert.equal(publishReadiness({ spots: [] }), '还需：生成至少一个地点')
})
