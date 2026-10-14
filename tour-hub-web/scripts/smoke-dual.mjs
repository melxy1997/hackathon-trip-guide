import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { playPlanetarium } from './planetarium-flow.mjs'
const { chromium } = await import(process.env.TIMEWALKER_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TIMEWALKER_BASE_URL || 'http://127.0.0.1:5174'
const output = process.env.TIMEWALKER_TEST_OUTPUT || '/tmp/timewalker-dual'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.TIMEWALKER_CHROMIUM, args: ['--no-sandbox'] })
const catalog = JSON.parse(await readFile(new URL('../public/data/catalog.json', import.meta.url), 'utf8'))
const reordered = { ...catalog, items: [...catalog.items].sort((a, b) => Number(b.id === 'shanghai-planetarium') - Number(a.id === 'shanghai-planetarium')) }
const errors = []
let requests = 0
try {
  for (const [branch, width, missing] of [['origin', 390, false], ['destination', 320, false], ['origin', 390, true]]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', acceptDownloads: true })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/**', route => { requests++; return route.abort() })
    await page.route('**/data/catalog.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reordered) }))
    await page.goto(base)
    await page.locator('a[data-preset="cosmos"]').waitFor()
    assert.equal(await page.locator('a[data-preset="heritage"]').count(), 1)
    assert.equal(await page.locator('a[data-preset="cosmos"]').count(), 1)
    assert.equal(await page.locator('a[href="/tour/shanghai-planetarium"]').count(), 0, 'publishing indoor story first never exposes map feature')
    if (missing) await page.route('**/experience-assets/shanghai-planetarium/*.png', route => route.fulfill({ status: 404, body: 'missing art fixture' }))
    await page.goto(`${base}/experience/shanghai-planetarium`)
    await page.getByRole('button', { name: '接收宇宙讯号', exact: true }).waitFor()
    if (!missing) {
      await page.waitForFunction(() => document.querySelector('.tw-backdrop')?.naturalWidth > 0)
      await page.screenshot({ path: `${output}/cosmos-opening-${width}.png`, fullPage: true })
    }
    await playPlanetarium(page, base, branch, missing ? '缺图时也能寄出回信' : `寄给未来的${branch}回信`, output, missing)
    if (!missing) await page.screenshot({ path: `${output}/cosmos-journal-${width}.png`, fullPage: true })
    await page.reload()
    await page.getByRole('heading', { name: '我的航行记录', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.tw-experience')).backgroundColor), 'rgb(7, 20, 39)')
    await context.close()
  }
  assert.equal(requests, 0)
  assert.deepEqual(errors, [])
  console.log('PASS two home themes, both cosmos branches at 320/390px, art/missing-art, notes/refresh, blue SVG/XML/download and no map/model calls/page errors.')
} finally { await browser.close() }
