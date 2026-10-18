// Uses the real Job, drafts, media and publish handlers in a temporary directory.
// Model/search services are explicit automation substitutes; never real-provider evidence.
import assert from 'node:assert/strict'
import http from 'node:http'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { createBuilderApi } from '../.generated/agent/server/agent/api.js'
import { fixtureModel, fixtureResearch } from '../server/agent/__tests__/fixture-model.mjs'
const { createSpotApi } = createRequire(import.meta.url)('../libs/spots-store.cjs')
const { chromium } = await import(process.env.TIMEWALKER_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TIMEWALKER_BASE_URL || 'http://127.0.0.1:5175'
const output = process.env.TIMEWALKER_TEST_OUTPUT || '/tmp/timewalker-builder'
await mkdir(output, { recursive: true })
const root = await mkdtemp(path.join(os.tmpdir(), 'builder-browser-'))
await cp(new URL('../public/spots/', import.meta.url), path.join(root, 'public/spots'), { recursive: true })
const model = await fixtureModel(); const drafts = createSpotApi(root)
const api = createBuilderApi({ storageRoot: root, privateRoot: path.join(root, 'agent-jobs'), drafts, getConfig: () => ({ apiKey: 'automation-fixture', baseUrl: model.base, model: 'explicit-automation-fixture' }), readEnv: name => name === 'TAVILY_API_KEY' ? 'automation-fixture' : '', research: fixtureResearch })
const server = http.createServer(async (req, res) => {
  if (await api.handle(req, res) || await drafts.handle(req, res)) return
  const url = new URL(req.url, 'http://localhost')
  const file = drafts.resolvePublicFile(url.pathname)
  if (file) { res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'image/jpeg'); res.end(await readFile(file)); return }
  res.writeHead(404); res.end()
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const backend = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true, executablePath: process.env.TIMEWALKER_CHROMIUM, args: ['--no-sandbox'] })
const errors = []
const forward = async route => {
    const request = route.request(); const url = new URL(request.url())
    const headers = { ...request.headers(), origin: backend }; delete headers.host
    const response = await route.fetch({ url: backend + url.pathname + url.search, headers })
    await route.fulfill({ response })
}
const attach = async context => {
  for (const pattern of ['**/api/builder/**', '**/__trip_guide/**', '**/spots/**']) await context.route(pattern, forward)
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); await attach(context)
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/#/publish/yuyuan/content`)
  await page.getByRole('button', { name: 'AI 完整创作', exact: true }).click()
  await page.getByRole('heading', { name: '从一个灵感，走到一份完整作品', exact: true }).waitFor()
  const original = await readFile(path.join(root, '.timewalker-drafts/yuyuan.json'), 'utf8')
  await page.getByRole('combobox', { name: '体验模式', exact: true }).selectOption('story')
  await page.getByRole('textbox', { name: '创作命题', exact: true }).fill('以一封家书串起园林，让游客沿两条不同线索发现信的主人。')
  await page.getByRole('button', { name: '研究地点，生成两个创意', exact: true }).click()
  await page.getByRole('button', { name: '选择「未寄出的家书」并编写', exact: true }).waitFor()
  await page.reload()
  await page.getByRole('button', { name: '选择「未寄出的家书」并编写', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '选择「借来的月光」并编写', exact: true }).count(), 1)
  await page.screenshot({ path: `${output}/concepts-390.png`, fullPage: true })
  await page.getByRole('button', { name: '选择「未寄出的家书」并编写', exact: true }).click()
  await page.getByRole('region', { name: '完成候选', exact: true }).waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.getByRole('button', { name: '采纳为新草稿，进入真实预览', exact: true }).click()
  await page.waitForURL(/#\/publish\/attr-agent-[^/]+\/preview/)
  await page.getByText('预览中', { exact: true }).waitFor()
  await page.getByRole('dialog', { name: '开始故事漫游', exact: true }).waitFor()
  const newId = new URL(page.url()).hash.split('/')[2]
  assert.notEqual(newId, 'yuyuan')
  assert.equal(await readFile(path.join(root, '.timewalker-drafts/yuyuan.json'), 'utf8'), original)
  await page.screenshot({ path: `${output}/preview-390.png`, fullPage: true })
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await page.getByRole('link', { name: '去前台看', exact: true }).waitFor()
  const published = JSON.parse(await readFile(path.join(root, `public/spots/${newId}.json`), 'utf8'))
  assert.equal(published.mode, 'story'); assert.equal(published.story.title, '未寄出的家书')
  const visitor = await browser.newContext({ viewport: { width: 320, height: 844 } }); await attach(visitor)
  const clean = await visitor.newPage(); clean.on('pageerror', error => errors.push(error.message))
  await clean.goto(`${base}/#/tour/${newId}`)
  await clean.getByRole('dialog', { name: '开始故事漫游', exact: true }).waitFor()
  assert.equal(await clean.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('builder:'))), false)
  await visitor.close(); await context.close()
  // The actual dev service (without fixture credentials) must state its configuration clearly.
  const unavailable = await browser.newContext({ viewport: { width: 320, height: 844 } })
  await unavailable.route('**/__trip_guide/**', forward)
  const noConfig = await unavailable.newPage()
  await noConfig.goto(`${base}/#/publish/yuyuan/agent`)
  await noConfig.getByText(/创作服务尚未配置完整/).waitFor()
  assert.equal(await noConfig.getByRole('button', { name: '研究地点，生成两个创意', exact: true }).isDisabled(), true)
  assert.ok(await noConfig.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await unavailable.close()
  assert.deepEqual(errors, [])
  console.log('PASS real content entry → Job research/concepts → refresh recovery → selection → independent draft → actual visitor preview → real temporary publish → clean 320px visitor; model/research are explicit fixtures.')
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {})
    await writeFile(`${output}/failure.txt`, `${page.url()}\n${await page.locator('body').innerText()}\n${JSON.stringify(errors)}`)
  }
  throw error
} finally { await browser.close(); api.close(); await new Promise(resolve => server.close(resolve)); await model.close(); await rm(root, { recursive: true, force: true }) }
