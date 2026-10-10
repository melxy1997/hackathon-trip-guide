import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const { chromium } = await import(process.env.TIMEWALKER_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TIMEWALKER_BASE_URL || 'http://127.0.0.1:5173'
const output = process.env.TIMEWALKER_TEST_OUTPUT || '/tmp/timewalker-builder-smoke'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.TIMEWALKER_CHROMIUM, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } })
const page = await context.newPage()
const errors = []
let exportCalls = 0
page.on('pageerror', e => errors.push(e.message))
// Intercept the local export to avoid modifying tracked demo content. Real write is covered by publish.test.ts.
await page.route('**/__trip_guide/export', async route => {
  const body = route.request().postDataJSON()
  assert.ok(body.package.experience)
  exportCalls++
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, absolutePath: '/tmp/browser-export', attractionPath: 'test.json' }) })
})
try {
  await page.goto(`${base}/publish`)
  const builder = page.getByRole('region', { name: '故事 Builder' })
  await builder.getByLabel('故事主题').fill('月光下的第三封信')
  await builder.getByRole('button', { name: '生成候选故事' }).click()
  await builder.getByRole('heading', { name: '月光下的第三封信' }).waitFor()
  await builder.getByText('本地模板候选 · 未调用模型', { exact: false }).waitFor()
  await page.screenshot({ path: `${output}/builder-candidate.png`, fullPage: true })
  await builder.getByLabel('起稿方式').selectOption('online')
  await builder.getByLabel('故事主题').fill('失败时要保留的主题')
  await builder.getByRole('button', { name: '生成候选故事' }).click()
  await builder.getByRole('alert').filter({ hasText: '在线模型尚未配置' }).waitFor()
  assert.equal(await builder.getByLabel('故事主题').inputValue(), '失败时要保留的主题')
  assert.equal(await builder.getByRole('heading', { name: '月光下的第三封信' }).count(), 1)
  console.log('PASS local template and real gateway missing-config error preserve input and previous candidate')

  let intercepted = false
  await page.route('**/api/builder/draft', async route => {
    intercepted = true
    await new Promise(resolve => setTimeout(resolve, 200))
    try { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试延迟响应' } }) }) } catch { /* cancelled */ }
  })
  await builder.getByRole('button', { name: '生成候选故事' }).click()
  await page.waitForFunction(() => document.body.innerText.includes('取消生成'))
  // Wait for network dispatch, then cancel the outstanding generation.
  for (let n = 0; n < 50 && !intercepted; n++) await page.waitForTimeout(10)
  assert.ok(intercepted)
  await builder.getByRole('button', { name: '取消生成' }).click()
  await builder.getByRole('alert').filter({ hasText: '生成已取消' }).waitFor()
  await page.waitForTimeout(250)
  assert.equal(await builder.getByRole('heading', { name: '月光下的第三封信' }).count(), 1)
  assert.doesNotMatch(await builder.innerText(), /测试延迟响应/)
  await page.unroute('**/api/builder/draft')
  console.log('PASS cancelled request cannot replace the retained candidate')

  await builder.getByRole('button', { name: '采用候选稿并编辑' }).click()
  await page.getByRole('heading', { name: '故事编排', exact: true }).waitFor()
  assert.match(page.url(), /publish\/attr-.*tab=story/)
  const draftId = new URL(page.url()).pathname.split('/').at(-1)
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await page.getByText('候选故事尚未人工审核', { exact: false }).waitFor()
  assert.equal(exportCalls, 0)
  await page.getByLabel('我已核对事实与来源', { exact: false }).check()
  await page.getByRole('button', { name: '确认人工审核' }).click()
  await page.getByText('人工审核已确认', { exact: true }).waitFor()
  await page.getByRole('textbox', { name: /章节旁白/ }).fill('这是修改后的文学创作，月光把第三封信交到你的手里。')
  await page.getByText('待人工审核', { exact: true }).waitFor()
  await page.getByLabel('下一章节（兜底）').selectOption('opening')
  await page.getByText('修复建议：', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: '确认人工审核' }).isDisabled(), true)
  await page.getByLabel('下一章节（兜底）').selectOption('choice')
  await page.getByLabel('我已核对事实与来源', { exact: false }).check()
  await page.getByRole('button', { name: '确认人工审核' }).click()
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await page.getByText('已发布', { exact: false }).filter({ hasText: '前台可立即查看' }).waitFor()
  assert.equal(exportCalls, 1)
  console.log('PASS pending publish blocked, edits reset review, cyclic branch has repair hint, approved UI exports package')
  await page.screenshot({ path: `${output}/story-editor-reviewed.png`, fullPage: true })

  for (const branch of ['nature', 'craft']) {
    await page.goto(`${base}/experience/${draftId}?preview=1`)
    await page.getByRole('button', { name: '开启时空漫游' }).click()
    await page.getByText('这是修改后的文学创作', { exact: false }).waitFor()
    await page.getByRole('button', { name: '前往下一站', exact: true }).click()
    await page.getByRole('button', { name: '模拟到达大假山', exact: true }).click()
    await page.getByRole('button', { name: '读完了，继续探索' }).click()
    await page.getByRole('button', { name: branch === 'nature' ? '寻找自然的形状' : '留意创造的细节', exact: true }).click()
    await page.getByRole('button', { name: '模拟到达玉玲珑', exact: true }).click()
    await page.getByRole('button', { name: '读完了，继续探索' }).click()
    await page.getByRole('button', { name: '我已观察，收下这份发现' }).click()
    await page.getByRole('button', { name: '模拟到达点春堂', exact: true }).click()
    await page.getByRole('button', { name: '读完家书，收下手账' }).click()
    await page.getByRole('heading', { name: '我的时空手账' }).waitFor()
    assert.match(await page.locator('.tw-journal-detail').innerText(), /人工确认/)
    assert.equal(await page.locator('.tw-journal-detail ol li').count(), 4)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${base}/publish`)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'builder fits mobile')
  await page.goto(`${base}/publish/${draftId}?tab=story`)
  await page.getByRole('heading', { name: '故事编排', exact: true }).waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'editor fits mobile')
  assert.deepEqual(errors, [])
  console.log('PASS both generated branches preview through real player; mobile builder/editor; zero browser exceptions')
} finally { await browser.close() }
