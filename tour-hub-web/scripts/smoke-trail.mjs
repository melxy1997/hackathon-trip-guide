import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
const { chromium } = await import(process.env.TIMEWALKER_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TIMEWALKER_BASE_URL || 'http://127.0.0.1:5174'
const output = process.env.TIMEWALKER_TEST_OUTPUT || '/tmp/timewalker-trail'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.TIMEWALKER_CHROMIUM, args: ['--no-sandbox'] })
const errors = []
try {
  for (const width of [390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', acceptDownloads: true })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    let apiCalls = 0
    await page.route('**/api/**', route => { apiCalls++; return route.abort() })
    if (width === 320) await page.route('**/spots/*.jpg', route => route.fulfill({ status: 404, body: 'missing fixture' }))
    await page.goto(base)
    await page.getByRole('link', { name: /园林里的四重风景/ }).click()
    await page.getByRole('heading', { name: '园林里的四重风景', exact: true }).waitFor()
    await page.screenshot({ path: `${output}/trail-opening-${width}.png`, fullPage: true })
    for (let index = 0; index < 4; index++) {
      await page.getByRole('button', { name: /完成打卡/ }).click()
      await page.getByText(`已收集 ${index + 1} / 4 枚印章`, { exact: true }).waitFor()
      if (index === 1) {
        const recommendation = page.getByRole('complementary', { name: '可选推荐' })
        await recommendation.scrollIntoViewIfNeeded()
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('timewalker:trail-events:v1:yuyuan-four-sights') || '[]').some(event => event.type === 'promotion_view'))
        await page.reload()
        await page.getByText('已收集 2 / 4 枚印章', { exact: true }).waitFor()
      }
    }
    await page.getByRole('region', { name: '探索完成' }).waitFor()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '保存探索纪念卡' }).click()
    const card = await readFile(await (await downloadPromise).path(), 'utf8')
    assert.match(card, /已收集 4 \/ 4/)
    assert.match(card, /亭台初见/)
    assert.equal(await page.evaluate(svg => !new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror'), card), true)
    await page.screenshot({ path: `${output}/trail-finish-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: '撤销上一次打卡' }).click()
    await page.getByText('已收集 3 / 4 枚印章', { exact: true }).waitFor()
    assert.equal(await page.getByRole('region', { name: '探索完成' }).count(), 0)
    await page.getByRole('button', { name: /完成打卡/ }).click()
    await page.getByRole('button', { name: '重新开始探索', exact: true }).click()
    await page.getByRole('button', { name: '保留当前进度' }).click()
    await page.reload()
    await page.getByText('已收集 4 / 4 枚印章', { exact: true }).waitFor()
    await page.getByRole('button', { name: '重新开始探索', exact: true }).click()
    await page.getByRole('button', { name: '确认重新开始', exact: true }).click()
    await page.getByText('已收集 0 / 4 枚印章', { exact: true }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.equal(apiCalls, 0)
    await page.goto(`${base}/trail/does-not-exist`)
    await page.getByRole('heading', { name: '路线暂时无法打开' }).waitFor()
    await context.close()
  }
  assert.deepEqual(errors, [])
  console.log('PASS Trail ordered stamps, refresh, undo/reset, recommendation view, SVG download, 320/390px, missing images and missing route; no model/map calls')
} finally { await browser.close() }
