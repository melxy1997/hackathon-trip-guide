import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createBuilderApi } from '../../../.generated/agent/server/agent/api.js'
import { fingerprint } from '../../../.generated/agent/server/agent/compiler.js'
import { fixtureModel, fixtureResearch } from './fixture-model.mjs'
const { createSpotApi } = createRequire(import.meta.url)('../../../libs/spots-store.cjs')
export async function waitJob(base, id, status) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const { job } = await (await fetch(`${base}/api/builder/jobs/${id}`)).json()
    if (job.status === status) return job
    if (job.status === 'failed') throw new Error(JSON.stringify(job))
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${status}`)
}
test('actual Job API researches, selects, compiles both modes and adopts a new persisted draft without source writes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'builder-flow-')); const model = await fixtureModel()
  const drafts = createSpotApi(root)
  const pkg = JSON.parse(await fs.readFile(new URL('../../../public/spots/yuyuan.json', import.meta.url), 'utf8'))
  const source = drafts.createDraft({ ...pkg, status: 'draft', spots: pkg.spots.slice(0, 3) })
  const before = fingerprint(source)
  const api = createBuilderApi({ storageRoot: root, drafts, getConfig: () => ({ apiKey: 'fixture-key', baseUrl: model.base, model: 'explicit-fixture' }), readEnv: name => name === 'TAVILY_API_KEY' ? 'explicit-fixture' : '', research: fixtureResearch })
  const server = http.createServer(async (req, res) => { if (await api.handle(req, res)) return; if (await drafts.handle(req, res)) return; res.writeHead(404); res.end() })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`
  const post = (url, body) => fetch(`${base}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    for (const mode of ['story', 'checkin']) {
      const created = await post('/api/builder/jobs', { sourceDraftId: source.id, mode, prompt: '沿一封家书探索园林' }); assert.equal(created.status, 202)
      let job = (await created.json()).job
      job = await waitJob(base, job.id, 'awaiting-selection'); assert.equal(job.concepts.length, 2); assert.ok(job.events.some(event => event.tool === 'web_search' && event.status === 'ok'))
      assert.equal((await post(`/api/builder/jobs/${job.id}/select-concept`, { conceptId: 'letter' })).status, 202)
      job = await waitJob(base, job.id, 'completed')
      const adopted = await post(`/api/builder/jobs/${job.id}/adopt`, { version: job.version, hash: job.candidateHash }); assert.equal(adopted.status, 201)
      const draft = (await adopted.json()).draft; assert.notEqual(draft.id, source.id); assert.equal(draft.mode, mode); assert.equal(draft.status, 'draft')
      assert.equal(fingerprint(drafts.readDraft(source.id)), before)
      assert.deepEqual(drafts.readDraft(draft.id), draft)
      const repeated = await post(`/api/builder/jobs/${job.id}/adopt`, { version: job.version, hash: job.candidateHash }); assert.equal((await repeated.json()).draft.id, draft.id)
      if (mode === 'story') assert.ok(Object.keys(draft.story.endings).length); else assert.equal(draft.story, undefined)
      // The source changed after generation; a new version may not silently adopt that stale snapshot.
      if (mode === 'checkin') {
        const update = await fetch(`${base}/__trip_guide/drafts/${source.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...source, description: '作者的新修改' }) }); assert.equal(update.status, 200)
        await post(`/api/builder/jobs/${job.id}/select-concept`, { conceptId: 'shadow' }); job = await waitJob(base, job.id, 'completed')
        assert.equal((await post(`/api/builder/jobs/${job.id}/adopt`, { version: job.version, hash: job.candidateHash })).status, 409)
      }
    }
    const created = await (await post('/api/builder/jobs', { sourceDraftId: source.id, mode: 'story', prompt: '取消演示' })).json()
    assert.equal((await post(`/api/builder/jobs/${created.job.id}/cancel`, {})).status, 200)
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal((await (await fetch(`${base}/api/builder/jobs/${created.job.id}`)).json()).job.status, 'cancelled')
  } finally { api.close(); await new Promise(resolve => server.close(resolve)); await model.close(); await fs.rm(root, { recursive: true, force: true }) }
})
