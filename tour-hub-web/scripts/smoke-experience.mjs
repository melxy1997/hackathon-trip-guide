/** Optional browser check; uses Playwright from TIMEWALKER_PLAYWRIGHT_MODULE or local installation. */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const { chromium } = await import(process.env.TIMEWALKER_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TIMEWALKER_BASE_URL || 'http://127.0.0.1:5174'
const output = process.env.TIMEWALKER_TEST_OUTPUT || '/tmp/timewalker-smoke'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.TIMEWALKER_CHROMIUM ? { executablePath: process.env.TIMEWALKER_CHROMIUM } : {}), args: ['--no-sandbox'] })
let modelRequests = 0
const errors = []
const contexts = []
async function pageFor(viewport = { width: 1365, height: 900 }) {
  const context = await browser.newContext({ viewport })
  contexts.push(context)
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/chat/completions', route => { modelRequests++; return route.abort() })
  return page
}
async function complete(page, branch, refresh = false) {
  await page.goto(`${base}/`)
  await page.getByRole('link').filter({ hasText: '沉浸故事' }).click()
  await page.getByRole('button', { name: '开启时空漫游', exact: true }).click()
  await page.getByRole('button', { name: '前往下一站', exact: true }).click()
  if (refresh) {
    await page.reload()
    await page.getByText('已恢复本机保存的故事进度', { exact: false }).waitFor()
  }
  await page.getByRole('button', { name: '模拟到达大假山', exact: true }).click()
  await page.getByRole('button', { name: '读完了，继续探索', exact: true }).click()
  await page.getByRole('button', { name: branch === 'nature' ? /山林野趣/ : /匠心造景/ }).click()
  await page.getByRole('button', { name: '模拟到达玉玲珑', exact: true }).click()
  await page.getByRole('heading', { name: branch === 'nature' ? '第三幕：石中自然' : '第三幕：石与匠心', exact: true }).waitFor()
  await page.getByRole('button', { name: '读完了，继续探索', exact: true }).click()
  await page.getByRole('button', { name: '我已观察，收下这份发现', exact: true }).click()
  await page.getByRole('button', { name: '模拟到达点春堂', exact: true }).click()
  await page.getByRole('button', { name: '读完家书，收下手账', exact: true }).click()
  await page.getByRole('heading', { name: '我的时空手账', exact: true }).waitFor()
  assert.match(await page.locator('.tw-journal-detail').innerText(), branch === 'nature' ? /山林野趣/ : /匠心造景/)
  assert.match(await page.locator('.tw-journal-detail').innerText(), /人工确认/)
  assert.equal(await page.locator('.tw-journal-detail ol li').count(), 4)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow')
}
try {
  for (let i = 0; i < 5; i++) {
    const page = await pageFor(i === 1 ? { width: 390, height: 844 } : undefined)
    await complete(page, i % 2 ? 'craft' : 'nature', i === 0)
    await page.reload()
    await page.getByRole('heading', { name: '我的时空手账', exact: true }).waitFor()
    console.log(`PASS rehearsal ${i + 1}: ${i % 2 ? 'craft' : 'nature'}, ending and persisted journal`)
    if (i === 1) await page.screenshot({ path: `${output}/mobile-journal.png`, fullPage: true })
    await page.context().close()
  }
  const fallback = await pageFor({ width: 390, height: 844 })
  await fallback.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], speak: utterance => queueMicrotask(() => utterance.onerror?.(new Event('error'))), cancel: () => {}, addEventListener: () => {}, removeEventListener: () => {} } })
  })
  await fallback.route('**/spots/**', route => route.fulfill({ status: 404, body: 'missing image' }))
  await fallback.goto(`${base}/experience/yuyuan-timewalker`)
  await fallback.getByRole('button', { name: '开启时空漫游', exact: true }).click()
  await fallback.getByRole('button', { name: '开启旁白', exact: true }).click()
  await fallback.getByText('旁白暂不可用', { exact: false }).waitFor()
  assert.equal(await fallback.locator('.tw-speaking').count(), 0, 'failed speech clears the active narration highlight')
  await fallback.getByText('场景图片暂不可用', { exact: false }).waitFor()
  await fallback.getByRole('button', { name: '前往下一站', exact: true }).click()
  await fallback.getByRole('button', { name: '模拟到达大假山', exact: true }).click()
  await fallback.getByRole('button', { name: '读完了，继续探索', exact: true }).click()
  await fallback.getByRole('button', { name: /山林野趣/ }).click()
  await fallback.getByRole('button', { name: '模拟到达玉玲珑', exact: true }).click()
  await fallback.getByRole('button', { name: '读完了，继续探索', exact: true }).click()
  await fallback.getByRole('button', { name: '我已观察，收下这份发现', exact: true }).click()
  await fallback.getByRole('button', { name: '模拟到达点春堂', exact: true }).click()
  await fallback.getByRole('button', { name: '读完家书，收下手账', exact: true }).click()
  await fallback.getByRole('heading', { name: '我的时空手账', exact: true }).waitFor()
  console.log('PASS missing images and failed speech still reach ending; model requests blocked')

  const editor = await pageFor()
  await editor.goto(`${base}/publish/yuyuan-timewalker`)
  await editor.getByRole('button', { name: '3. 故事编排', exact: true }).click()
  await editor.getByRole('button', { name: '2. 地点与内容', exact: true }).click()
  await editor.getByText('节点内容', { exact: true }).waitFor()
  await editor.getByRole('button', { name: '3. 故事编排', exact: true }).click()
  const updated = '测试草稿：一封虚构家书，把山水留给后来走进园林的你。'
  await editor.getByRole('textbox', { name: /章节旁白/ }).fill(updated)
  await editor.getByRole('link', { name: '预览草稿故事', exact: true }).click()
  await editor.getByRole('button', { name: '开启时空漫游', exact: true }).click()
  await editor.getByText(updated, { exact: true }).waitFor()
  assert.equal(await editor.locator('.tw-director').count(), 1)
  await editor.getByRole('button', { name: '终幕：一园一念', exact: true }).click()
  await editor.getByRole('button', { name: '读完家书，收下手账', exact: true }).click()
  await editor.getByText('这次还没有留下审美选择', { exact: true }).waitFor()
  await editor.getByText('这次没有完成观察任务', { exact: true }).waitFor()
  console.log('PASS story editor → saved local draft → player preview; director journal does not fabricate choices')

  const legacy = await pageFor()
  await legacy.goto(`${base}/tour/yuyuan`)
  await legacy.getByText('缺少 VITE_AMAP_KEY', { exact: false }).first().waitFor()
  await legacy.goto(`${base}/experience/yuyuan`)
  await legacy.getByRole('link', { name: '打开景点导览', exact: true }).waitFor()
  await legacy.goto(`${base}/experience/does-not-exist`)
  await legacy.getByRole('heading', { name: '故事暂时无法打开', exact: true }).waitFor()
  console.log('PASS legacy tour, no-story fallback and missing-package error')

  const opening = await pageFor()
  await opening.goto(`${base}/experience/yuyuan-timewalker`)
  await opening.getByRole('button', { name: '开启时空漫游', exact: true }).waitFor()
  await opening.emulateMedia({ reducedMotion: 'reduce' })
  await opening.screenshot({ path: `${output}/opening.png`, fullPage: true })
  assert.equal(await opening.locator('.tw-director').count(), 0, 'normal entry hides director console')
  assert.equal(modelRequests, 0, 'core flow has no model dependency')
  assert.deepEqual(errors, [], 'no browser page exceptions')
  console.log('PASS normal entry hides director console; zero model requests; zero page errors')
} finally {
  await Promise.allSettled(contexts.map(c => c.close()))
  await browser.close()
}
