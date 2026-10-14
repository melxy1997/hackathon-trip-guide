import assert from 'node:assert/strict'
import { assertPublishedAttraction } from '../src/lib/tourPackage.ts'
const { chromium } = await import(process.env.TIMEWALKER_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TIMEWALKER_BASE_URL || 'http://127.0.0.1:5174'
const browser = await chromium.launch({ headless: true, executablePath: process.env.TIMEWALKER_CHROMIUM, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } })
const errors = []
const exported = []
page.on('pageerror', e => errors.push(e.message))
await page.route('**/__trip_guide/export', async route => {
  const pkg = assertPublishedAttraction(route.request().postDataJSON().package)
  exported.push(pkg)
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, absolutePath: '/tmp/test-export', attractionPath: `${pkg.id}.json`, catalogPath: 'catalog.json' }) })
})
try {
  await page.goto(`${base}/publish/yuyuan`)
  await page.getByRole('button', { name: '发布原版导览', exact: true }).click()
  await page.getByText('前台可立即查看', { exact: false }).waitFor()
  assert.equal(exported.length, 1)
  assert.equal(exported[0].experience, undefined)
  // A local POI draft has not been published and must not need catalog membership to start a story.
  await page.evaluate(() => {
    const key = 'trip-guide:drafts:v1'
    const drafts = JSON.parse(localStorage.getItem(key))
    const source = drafts.find(d => d.id === 'yuyuan')
    drafts.push({ ...source, id: 'local-creator-test', name: '本机新景点', status: 'draft' })
    localStorage.setItem(key, JSON.stringify(drafts))
  })
  await page.goto(`${base}/publish/local-creator-test`)
  await page.getByRole('button', { name: '从当前地点起稿故事', exact: true }).click()
  await page.getByRole('heading', { name: '故事编排', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '发布体验', exact: true }).isDisabled(), true)
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__handle.source').length > 0)
  await page.waitForTimeout(400)
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.react-flow__node')].every(node => {
    const n = node.getBoundingClientRect()
    return [...node.querySelectorAll('.react-flow__handle.source')].every(handle => {
      const h = handle.getBoundingClientRect(); const y = h.top + h.height / 2
      return y >= n.top && y <= n.bottom
    })
  })), 'graph source handles align inside their node rows')
  await page.getByLabel('我已核对事实与来源', { exact: false }).check()
  await page.getByRole('button', { name: '确认人工审核', exact: true }).click()
  await page.getByRole('button', { name: '发布体验', exact: true }).click()
  await page.getByText('前台可立即查看', { exact: false }).waitFor()
  assert.equal(exported.length, 2)
  assert.equal(exported[1].id, 'local-creator-test')
  assert.ok(exported[1].experience)
  await page.getByText('展示主题与开场', { exact: true }).click()
  await page.getByLabel('主题预设', { exact: true }).selectOption('cosmos')
  await page.getByText('待人工审核', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '发布体验', exact: true }).isDisabled(), true)
  await page.getByLabel('我已核对事实与来源', { exact: false }).check()
  await page.getByRole('button', { name: '确认人工审核', exact: true }).click()
  await page.getByRole('button', { name: '发布体验', exact: true }).click()
  await page.getByText('前台可立即查看', { exact: false }).waitFor()
  assert.equal(exported[2].presentation.preset, 'cosmos')
  await page.goto(`${base}/experience/local-creator-test?preview=1`)
  await page.getByRole('button', { name: '接收宇宙讯号', exact: true }).waitFor()
  assert.equal(await page.locator('.tw-experience').getAttribute('data-preset'), 'cosmos')
  assert.equal(await page.getByRole('link', { name: '打开原版地图导览' }).count(), 0)
  await page.getByText('接收端：此刻的你', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS legacy publish, unpublished POIs → pending story → review → validated export, graph handle bounds, presentation review reset/export/preview; no source writes/page errors.')
} finally { await browser.close() }
