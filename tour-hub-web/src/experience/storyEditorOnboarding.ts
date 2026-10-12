export const storyEditorOnboardingKey = 'trip-guide:story-editor:onboarding:v1'

type OnboardingRecord = { dismissed: boolean; completed: boolean }

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const initial: OnboardingRecord = { dismissed: false, completed: false }

export function readStoryEditorOnboarding(storage: StorageLike | null | undefined): OnboardingRecord {
  if (!storage) return initial
  try {
    const value = JSON.parse(storage.getItem(storyEditorOnboardingKey) ?? 'null')
    return value && typeof value.dismissed === 'boolean' && typeof value.completed === 'boolean' ? value : initial
  } catch {
    return initial
  }
}

export function writeStoryEditorOnboarding(storage: StorageLike | null | undefined, value: OnboardingRecord) {
  try { storage?.setItem(storyEditorOnboardingKey, JSON.stringify(value)) } catch { /* Local preferences must not block editing. */ }
}

export function shouldShowStoryEditorOnboarding(storage: StorageLike | null | undefined) {
  const value = readStoryEditorOnboarding(storage)
  return !value.dismissed && !value.completed
}
