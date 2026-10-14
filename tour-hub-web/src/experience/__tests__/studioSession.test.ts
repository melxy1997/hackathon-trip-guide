import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixtures.ts'
import { packageFingerprint } from '../agent/validators.ts'
import { parseStudioSession, sameBrief, saveStudioSession, STUDIO_SESSION_KEY, validateStudioSession, type StudioSession } from '../agent/studioSession.ts'

const brief = { attractionId: fixture().pkg.id, theme: '园林来信', audience: 'general' as const, targetMinutes: 5, style: 'heritage' as const }
const session = (): StudioSession => ({ schemaVersion: 1, savedAt: 123, brief: { ...brief }, concepts: [], selection: '' })

test('Studio progress round-trips input and concept selection, rejects corrupt envelopes and unknown fields', () => {
  assert.deepEqual(parseStudioSession(JSON.stringify(session())), session())
  for (const value of [{ ...session(), schemaVersion: 2 }, { ...session(), concepts: [{}] }, { ...session(), selection: 'missing' }, { ...session(), apiKey: 'never-save' }]) {
    assert.throws(() => parseStudioSession(JSON.stringify(value)))
  }
  assert.throws(() => parseStudioSession('{broken'))
  assert.throws(() => parseStudioSession(' '.repeat(8 * 1024 * 1024 + 1)), /8 MiB/)
})

test('Studio brief edits invalidate old concepts even when package ID is unchanged', () => {
  assert.equal(sameBrief(undefined, brief), false)
  assert.equal(sameBrief({ ...brief }, brief), true)
  for (const change of [{ theme: '另一封信' }, { attractionId: 'other' }, { targetMinutes: 3 }, { audience: 'family' as const }, { style: 'cosmos' as const }]) assert.equal(sameBrief({ ...brief, ...change }, brief), false)
})

test('Studio restoration rejects stale package binding; quota failure preserves previous snapshot', async () => {
  const pkg = fixture().pkg
  const progress = session()
  progress.basePackage = { id: pkg.id, version: pkg.publishedAt, fingerprint: packageFingerprint(pkg) }
  await validateStudioSession(progress, async () => pkg)
  await assert.rejects(validateStudioSession(progress, async () => ({ ...pkg, publishedAt: pkg.publishedAt + 1 })), /基础包已更新/)
  const saved = new Map<string, string>()
  const storage = { setItem: (key: string, value: string) => { saved.set(key, value) } }
  assert.equal(saveStudioSession(session(), storage), true)
  const previous = saved.get(STUDIO_SESSION_KEY)
  assert.equal(saveStudioSession(session(), { setItem: () => { throw new Error('quota') } }), false)
  assert.equal(saved.get(STUDIO_SESSION_KEY), previous)
  const large = { ...session(), brief: { ...brief, theme: 'x'.repeat(800_000) } }
  assert.equal(saveStudioSession(large, storage), false)
  assert.equal(saved.get(STUDIO_SESSION_KEY), previous)
})
