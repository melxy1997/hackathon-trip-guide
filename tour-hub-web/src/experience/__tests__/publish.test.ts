import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { exportToDisplayPlugin } from '../../../vite-plugin-export-to-display.ts'
import { fixture } from './fixtures.ts'
import { presentationForPreset } from '../presentation.ts'

test('local dev publishing validates and writes experience + catalog without losing existing entries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'timewalker-publish-'))
  const { pkg } = fixture()
  pkg.presentation = presentationForPreset('cosmos')
  await mkdir(path.join(root, 'public/data/attractions'), { recursive: true })
  await writeFile(path.join(root, `public/data/attractions/${pkg.id}.json`), JSON.stringify(pkg))
  await writeFile(path.join(root, 'public/data/catalog.json'), JSON.stringify({ schemaVersion: 1, updatedAt: 1, items: [{ id: 'existing' }] }))
  const server = await createServer({ root, configFile: false, plugins: [exportToDisplayPlugin()], server: { host: '127.0.0.1', port: 0 } })
  try {
    await server.listen()
    const address = server.httpServer!.address()
    assert.ok(address && typeof address !== 'string')
    const base = `http://127.0.0.1:${address.port}`
    pkg.experience!.scenes[0].blocks[1].text = '发布集成测试：这是人工修订后的虚构家书。'
    const post = (body: unknown) => fetch(`${base}/__trip_guide/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package: body }) })
    const response = await post(pkg)
    assert.equal(response.status, 200)
    const reloadResponse = await fetch(`${base}/data/attractions/${pkg.id}.json`)
    assert.equal(reloadResponse.status, 200)
    const reloaded = await reloadResponse.json()
    assert.equal(reloaded.experience.scenes[0].blocks[1].text, pkg.experience!.scenes[0].blocks[1].text)
    assert.deepEqual(reloaded.presentation, pkg.presentation)
    assert.deepEqual(JSON.parse(await readFile(path.join(root, `public/data/attractions/${pkg.id}.json`), 'utf8')).experience, pkg.experience)
    const catalog = JSON.parse(await readFile(path.join(root, 'public/data/catalog.json'), 'utf8'))
    assert.equal(catalog.items[0].experience.title, pkg.experience!.title)
    assert.deepEqual(catalog.items[0].presentation, pkg.presentation)
    assert.equal(catalog.items[1].id, 'existing')
    assert.equal((await post({ ...pkg, id: '../../escape' })).status, 400)
    const invalid = structuredClone(pkg)
    invalid.experience!.scenes[0].transitions![0].to = 'missing'
    assert.notEqual((await post(invalid)).status, 200)
    assert.deepEqual(JSON.parse(await readFile(path.join(root, `public/data/attractions/${pkg.id}.json`), 'utf8')).experience, pkg.experience, 'invalid package does not overwrite valid story')
  } finally {
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
})
