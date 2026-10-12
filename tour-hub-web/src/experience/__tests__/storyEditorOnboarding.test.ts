import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readStoryEditorOnboarding, shouldShowStoryEditorOnboarding, storyEditorOnboardingKey, writeStoryEditorOnboarding } from '../storyEditorOnboarding.ts'

function memoryStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed))
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
}

test('story editor onboarding starts visible and persists dismiss or completion by versioned key', () => {
  const storage = memoryStorage()
  assert.equal(shouldShowStoryEditorOnboarding(storage), true)
  writeStoryEditorOnboarding(storage, { dismissed: true, completed: false })
  assert.deepEqual(readStoryEditorOnboarding(storage), { dismissed: true, completed: false })
  assert.equal(shouldShowStoryEditorOnboarding(storage), false)
  writeStoryEditorOnboarding(storage, { dismissed: false, completed: true })
  assert.equal(shouldShowStoryEditorOnboarding(storage), false)
  assert.ok(storage.getItem(storyEditorOnboardingKey))
})

test('story editor onboarding tolerates malformed or unavailable storage', () => {
  const storage = memoryStorage({ [storyEditorOnboardingKey]: '{bad' })
  assert.deepEqual(readStoryEditorOnboarding(storage), { dismissed: false, completed: false })
  assert.equal(shouldShowStoryEditorOnboarding(null), true)
  assert.doesNotThrow(() => writeStoryEditorOnboarding({ getItem: () => null, setItem: () => { throw new Error('blocked') } }, { dismissed: true, completed: false }))
})
