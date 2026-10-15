import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { trailExportPlugin } from '../../../vite-plugin-trail-export.ts'
import { assertTrail } from '../trailSchema.ts'

test('Trail dev publishing writes actual static files/catalog, serializes updates and rejects invalid/cross-origin input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'timewalker-trail-publish-'))
  await mkdir(join(root, 'public/data/attractions'), { recursive: true })
  for (const id of ['yuyuan', 'yuyuan-timewalker']) await copyFile(fileURLToPath(new URL(`../../../public/data/attractions/${id}.json`, import.meta.url)), join(root, `public/data/attractions/${id}.json`))
  const original = assertTrail(JSON.parse(await readFile(new URL('../../../public/data/trails/yuyuan-four-sights.json', import.meta.url), 'utf8')))
  const server = await createServer({ root, configFile: false, plugins: [trailExportPlugin()], server: { host: '127.0.0.1', port: 0 } })
  try {
    await server.listen(); const address = server.httpServer!.address(); assert.ok(address && typeof address !== 'string')
    const base = `http://127.0.0.1:${address.port}`
    const post = (trail: unknown, origin = base) => fetch(`${base}/__trip_guide/trails/export`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ trail }) })
    const outputs = await Promise.all([post({ ...original, id: 'operator-a' }), post({ ...original, id: 'operator-b' })])
    assert.ok(outputs.every(response => response.status === 200))
    const catalog = await (await fetch(`${base}/data/trails/catalog.json`)).json() as { items: unknown[] }
    assert.equal(catalog.items.length, 2)
    const trail = assertTrail(await (await fetch(`${base}/data/trails/operator-a.json`)).json())
    assert.equal(trail.id, 'operator-a')
    assert.equal(trail.baseAttractionId, 'yuyuan')
    assert.ok(trail.publishedAt! > 0)
    const invalid = structuredClone(trail); invalid.checkpoints[0].spotId = 'unknown'
    assert.equal((await post(invalid)).status, 400)
    assert.equal((await post({ ...trail, id: '../../escape' })).status, 400)
    assert.equal((await post(trail, 'https://elsewhere.example')).status, 400)
    assert.equal((await post({ ...trail, relatedExperienceId: 'missing-story' })).status, 400)
    assert.deepEqual(JSON.parse(await readFile(join(root, 'public/data/trails/operator-a.json'), 'utf8')), trail)
    const seed = JSON.parse(await readFile(new URL('../../../public/data/attractions/yuyuan.json', import.meta.url), 'utf8'))
    assert.deepEqual(JSON.parse(await readFile(join(root, 'public/data/attractions/yuyuan.json'), 'utf8')), seed)
  } finally { await server.close(); await rm(root, { recursive: true, force: true }) }
})
