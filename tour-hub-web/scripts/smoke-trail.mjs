import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { trailExportPlugin } from '../vite-plugin-trail-export.ts'
const { chromium } = await import(process.env.TIMEWALKER_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TIMEWALKER_BASE_URL || 'http://127.0.0.1:5174'
const output = process.env.TIMEWALKER_TEST_OUTPUT || '/tmp/timewalker-trail'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.TIMEWALKER_CHROMIUM, args: ['--no-sandbox'] })
const errors = []
const publicationRoot = await mkdtemp(join(tmpdir(), 'timewalker-trail-browser-'))
await mkdir(join(publicationRoot, 'public'), { recursive: true })
await cp(new URL('../public/data/', import.meta.url), join(publicationRoot, 'public/data'), { recursive: true })
const publication = await createServer({ root: publicationRoot, configFile: false, plugins: [trailExportPlugin()], server: { host: '127.0.0.1', port: 0 } })
await publication.listen()
const publicationBase = `http://127.0.0.1:${publication.httpServer.address().port}`
const attachPublication = async context => {
  await context.route('**/data/trails/*.json', async route => {
    const response = await route.fetch({ url: `${publicationBase}${new URL(route.request().url()).pathname}` })
    await route.fulfill({ response })
  })
  await context.route('**/__trip_guide/trails/export', async route => {
    const headers = { ...route.request().headers(), origin: publicationBase }; delete headers.host
    const response = await route.fetch({ url: `${publicationBase}/__trip_guide/trails/export`, headers })
    await route.fulfill({ response })
  })
}
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
  const operator = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', acceptDownloads: true })
  await attachPublication(operator)
  const editor = await operator.newPage()
  editor.on('pageerror', error => errors.push(error.message))
  await editor.goto(`${base}/publish`)
  await editor.getByRole('link', { name: '新建探索路线', exact: true }).click()
  await editor.getByRole('heading', { name: '编排你的探索路线', exact: true }).waitFor()
  const trailId = new URL(editor.url()).pathname.split('/').at(-1)
  assert.notEqual(trailId, 'new')
  await editor.getByRole('textbox', { name: '路线标题', exact: true }).fill('客服配置的四重风景')
  await editor.getByRole('button', { name: '下移第 1 站', exact: true }).click()
  assert.match(await editor.getByRole('group', { name: '编辑站点 1', exact: true }).innerText(), /大假山/)
  await editor.getByRole('combobox', { name: '关联故事（可选）', exact: true }).selectOption('yuyuan-timewalker')
  await editor.getByRole('checkbox', { name: '启用一个推荐位', exact: true }).check()
  await editor.getByRole('textbox', { name: '推荐链接（可选，HTTPS 或本站详情）', exact: true }).fill('javascript:bad')
  assert.equal(await editor.getByRole('button', { name: '发布演示路线', exact: true }).isDisabled(), true)
  await editor.getByRole('textbox', { name: '推荐链接（可选，HTTPS 或本站详情）', exact: true }).fill('/experience/yuyuan-timewalker')
  await editor.getByRole('button', { name: '预览本机路线', exact: true }).click()
  await editor.getByText('本机草稿预览 · 尚未发布，不写入游客进度', { exact: true }).waitFor()
  await editor.getByRole('button', { name: /完成打卡/ }).click()
  assert.equal(await editor.evaluate(id => localStorage.getItem(`timewalker:trail:v1:${id}`), trailId), null)
  await editor.getByRole('button', { name: '收起草稿预览', exact: true }).click()
  await editor.reload()
  await editor.getByRole('textbox', { name: '路线标题', exact: true }).waitFor()
  assert.equal(await editor.getByRole('textbox', { name: '路线标题', exact: true }).inputValue(), '客服配置的四重风景')
  assert.equal(await editor.getByRole('link', { name: '打开已发布游客路线' }).count(), 0)
  await editor.getByRole('button', { name: '发布演示路线', exact: true }).click()
  await editor.getByRole('link', { name: '打开已发布游客路线', exact: true }).waitFor()
  const shareUrl = await editor.getByRole('textbox', { name: '可分享的游客链接', exact: true }).inputValue()
  assert.equal(new URL(shareUrl).pathname, `/trail/${trailId}`)
  await editor.screenshot({ path: `${output}/trail-operator-390.png`, fullPage: true })
  await editor.reload()
  await editor.getByLabel('路线保存与发布状态', { exact: true }).filter({ hasText: '已发布 · 本机与线上一致' }).waitFor()
  await editor.getByRole('link', { name: '打开已发布游客路线', exact: true }).waitFor()
  const saved = JSON.parse(await readFile(join(publicationRoot, `public/data/trails/${trailId}.json`), 'utf8'))
  assert.equal(saved.checkpoints[0].spotId, 'da-jia-shan')
  const visitor = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' })
  await attachPublication(visitor)
  const page = await visitor.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(shareUrl)
  await page.getByRole('heading', { name: '客服配置的四重风景', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('timewalker:trail-draft:'))), false, 'visitor does not share operator drafts')
  for (let index = 0; index < 4; index++) await page.getByRole('button', { name: /完成打卡/ }).click()
  const recommendation = page.getByRole('complementary', { name: '可选推荐' })
  await recommendation.getByRole('link', { name: '了解这项推荐' }).click()
  await page.waitForURL('**/experience/yuyuan-timewalker')
  const events = await page.evaluate(id => JSON.parse(localStorage.getItem(`timewalker:trail-events:v1:${id}`)), trailId)
  assert.equal(events.filter(event => event.type === 'promotion_click').length, 1)
  assert.equal(events.filter(event => event.type === 'checkpoint_confirm').length, 4)
  await page.goto(`${base}/experience/yuyuan-timewalker?director=1`)
  await page.locator('.tw-experience').waitFor()
  await page.getByRole('button', { name: '开启时空漫游', exact: true }).click()
  await page.getByRole('button', { name: '终幕：一园一念', exact: true }).click()
  await page.getByRole('button', { name: '读完家书，收下手账', exact: true }).click()
  assert.equal(await page.locator('a[href="/trail/yuyuan-four-sights"]').count(), 1)
  await page.goto(`${base}/experience/shanghai-planetarium`)
  await page.locator('.tw-experience').waitFor()
  assert.equal(await page.locator('a[href="/trail/yuyuan-four-sights"]').count(), 0)
  await editor.route('**/__trip_guide/trails/export', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>static fallback</html>' }))
  await editor.getByRole('textbox', { name: '路线标题', exact: true }).fill('静态部署本机更改')
  await editor.getByRole('button', { name: '发布演示路线', exact: true }).click()
  await editor.getByRole('alert').filter({ hasText: '没有开发态发布服务' }).waitFor()
  assert.equal(await editor.getByRole('link', { name: '打开已发布游客路线' }).count(), 0)
  const exported = editor.waitForEvent('download')
  await editor.getByRole('button', { name: '导出路线 JSON', exact: true }).click()
  const exportedJson = await readFile(await (await exported).path(), 'utf8')
  assert.equal(JSON.parse(exportedJson).title, '静态部署本机更改')
  await editor.goto(`${base}/publish`)
  const manager = editor.getByRole('region', { name: '运营路线管理', exact: true })
  const row = manager.getByRole('listitem', { name: `路线 ${trailId}`, exact: true })
  await row.getByText('本机有未发布修改', { exact: true }).waitFor()
  await manager.getByRole('searchbox', { name: '查找路线', exact: true }).fill(trailId)
  assert.equal(await manager.getByRole('listitem').count(), 1)
  await editor.evaluate(id => {
    localStorage.setItem(`timewalker:trail:v1:${id}`, 'preserve-visitor-session')
    localStorage.setItem(`timewalker:trail-events:v1:${id}`, 'preserve-visitor-events')
  }, trailId)
  await row.getByRole('button', { name: '移除本机草稿', exact: true }).click()
  await row.getByRole('button', { name: '保留草稿', exact: true }).click()
  await row.getByText('本机有未发布修改', { exact: true }).waitFor()
  await row.getByRole('button', { name: '移除本机草稿', exact: true }).click()
  await row.getByRole('button', { name: '确认移除本机草稿', exact: true }).click()
  await row.getByText('已发布', { exact: true }).waitFor()
  await row.getByText('客服配置的四重风景', { exact: true }).waitFor()
  assert.deepEqual(await editor.evaluate(id => [localStorage.getItem(`timewalker:trail:v1:${id}`), localStorage.getItem(`timewalker:trail-events:v1:${id}`)], trailId), ['preserve-visitor-session', 'preserve-visitor-events'])
  assert.deepEqual(JSON.parse(await readFile(join(publicationRoot, `public/data/trails/${trailId}.json`), 'utf8')), saved)
  await row.getByRole('button', { name: '复制已发布版本', exact: true }).click()
  await editor.getByRole('textbox', { name: '路线标题', exact: true }).waitFor()
  const copyId = new URL(editor.url()).pathname.split('/').at(-1)
  assert.notEqual(copyId, trailId)
  assert.equal(await editor.getByRole('textbox', { name: '路线标题', exact: true }).inputValue(), '客服配置的四重风景 · 副本')
  const copy = await editor.evaluate(id => JSON.parse(localStorage.getItem(`timewalker:trail-draft:v1:${id}`)), copyId)
  assert.equal(copy.publishedAt, undefined)
  assert.deepEqual(copy.checkpoints, saved.checkpoints)
  await editor.goto(`${base}/publish`)
  const importFile = async payload => {
    const chooser = editor.waitForEvent('filechooser')
    await manager.getByRole('button', { name: '导入路线 JSON', exact: true }).click()
    await (await chooser).setFiles({ name: 'trail.json', mimeType: 'application/json', buffer: Buffer.from(payload) })
  }
  const draftCount = await editor.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('timewalker:trail-draft:')).length)
  for (const [payload, message] of [
    ['{invalid', '不是有效的路线 JSON'],
    [JSON.stringify({ ...saved, checkpoints: saved.checkpoints.map((cp, index) => index ? cp : { ...cp, spotId: 'invented' }) }), '未知地点'],
    [JSON.stringify({ ...saved, baseAttractionId: 'missing-attraction' }), '请先迁移对应的景点包'],
    ['x'.repeat(64_001), '64 KB'],
  ]) {
    await importFile(payload)
    await manager.getByRole('alert').filter({ hasText: message }).waitFor()
    assert.equal(await editor.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('timewalker:trail-draft:')).length), draftCount)
  }
  await importFile(exportedJson)
  await editor.getByRole('textbox', { name: '路线标题', exact: true }).waitFor()
  const importedId = new URL(editor.url()).pathname.split('/').at(-1)
  assert.notEqual(importedId, trailId)
  assert.notEqual(importedId, copyId)
  assert.equal(await editor.getByRole('textbox', { name: '路线标题', exact: true }).inputValue(), '静态部署本机更改')
  await editor.getByLabel('路线保存与发布状态', { exact: true }).filter({ hasText: '本机未发布' }).waitFor()
  const imported = await editor.evaluate(id => JSON.parse(localStorage.getItem(`timewalker:trail-draft:v1:${id}`)), importedId)
  assert.equal(imported.publishedAt, undefined)
  assert.deepEqual(imported.checkpoints, saved.checkpoints)
  await editor.getByRole('button', { name: '预览本机路线', exact: true }).click()
  await editor.getByRole('button', { name: /完成打卡/ }).click()
  assert.equal(await editor.evaluate(id => localStorage.getItem(`timewalker:trail:v1:${id}`), importedId), null)
  await editor.getByRole('button', { name: '收起草稿预览', exact: true }).click()
  await editor.goto(`${base}/publish`)
  await manager.getByRole('searchbox', { name: '查找路线', exact: true }).fill(importedId)
  const importedRow = manager.getByRole('listitem', { name: `路线 ${importedId}`, exact: true })
  await importedRow.getByText('本机未发布', { exact: true }).waitFor()
  await importedRow.getByRole('button', { name: '移除本机草稿', exact: true }).click()
  await importedRow.getByRole('button', { name: '确认移除本机草稿', exact: true }).click()
  await manager.getByText('没有匹配的路线，试试其他标题或 ID。', { exact: true }).waitFor()
  await manager.getByRole('searchbox', { name: '查找路线', exact: true }).fill('')
  await manager.screenshot({ path: `${output}/trail-manager-390.png` })
  // Leaving the manager while import reads a package must not navigate back or create a ghost draft.
  let releasePackage
  const packageGate = new Promise(resolve => { releasePackage = resolve })
  await editor.route('**/data/attractions/yuyuan.json', async route => { await packageGate; await route.continue() })
  const delayedRequest = editor.waitForRequest('**/data/attractions/yuyuan.json')
  const beforeLeaving = await editor.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('timewalker:trail-draft:')).length)
  await importFile(exportedJson)
  await delayedRequest
  await editor.getByRole('link', { name: '前台', exact: true }).click()
  await editor.waitForURL(base + '/')
  const completedRequest = editor.waitForResponse('**/data/attractions/yuyuan.json')
  releasePackage()
  await (await completedRequest).finished()
  await editor.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
  assert.equal(new URL(editor.url()).pathname, '/')
  assert.equal(await editor.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('timewalker:trail-draft:')).length), beforeLeaving)
  await editor.unroute('**/data/attractions/yuyuan.json')
  await editor.goto(`${base}/publish`)
  assert.equal(await editor.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('timewalker:trail-draft:')).length), beforeLeaving)
  // Catalog failure must not turn a saved draft into a claim that it is unpublished.
  await editor.route('**/data/trails/catalog.json', route => route.fulfill({ status: 503, body: 'unavailable' }))
  await editor.reload()
  await manager.getByRole('listitem', { name: `路线 ${copyId}`, exact: true }).getByText('本机草稿 · 发布状态未核实', { exact: true }).waitFor()

  assert.ok(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  // Long-copy fixture is written by the real publisher into the same disposable directory.
  const longTrail = {
    ...saved, id: `long-${crypto.randomUUID()}`, title: `${'漫'.repeat(96)}🌏✨`,
    description: '园林中的每一处风景都值得慢慢发现。'.repeat(100).slice(0, 1000),
    coverImage: '/spots/missing-trail-cover.jpg',
    checkpoints: saved.checkpoints.map(cp => ({ ...cp, heading: 'W'.repeat(100), instruction: '探索'.repeat(300), stampLabel: '漫'.repeat(20) })),
    recommendations: saved.recommendations.map(rec => ({ ...rec, title: 'R'.repeat(100), description: 'D'.repeat(600) })),
  }
  const longResponse = await operator.request.post(`${publicationBase}/__trip_guide/trails/export`, { data: { trail: longTrail } })
  assert.equal(longResponse.ok(), true)
  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', acceptDownloads: true })
    await attachPublication(context)
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/trail/${longTrail.id}`)
    await page.getByRole('heading', { name: longTrail.title, exact: true }).waitFor()
    const toggle = page.getByRole('button', { name: '展开完整路线介绍', exact: true })
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    await toggle.click()
    assert.equal(await page.locator('.tr-description').innerText(), longTrail.description)
    assert.equal(await page.getByRole('button', { name: '收起路线介绍', exact: true }).getAttribute('aria-expanded'), 'true')
    assert.equal(await page.evaluate(() => {
      const hero = document.querySelector('.tr-hero').getBoundingClientRect()
      return [...document.querySelectorAll('.tr-hero h1,.tr-description')].every(element => {
        const rect = element.getBoundingClientRect()
        return rect.top >= hero.top && rect.bottom <= hero.bottom && rect.left >= hero.left && rect.right <= hero.right
      }) && document.documentElement.scrollWidth <= innerWidth
    }), true, 'entire expanded copy stays inside a flexible hero, without horizontal overflow')
    await page.getByRole('button', { name: '收起路线介绍', exact: true }).click()
    await page.screenshot({ path: `${output}/trail-long-copy-${width}.png`, fullPage: true })
    for (let index = 0; index < 4; index++) await page.getByRole('button', { name: /完成打卡/ }).click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(await page.locator('.tr-seal').evaluateAll(seals => seals.every(seal => seal.scrollHeight <= seal.clientHeight && seal.scrollWidth <= seal.clientWidth)), true, '20-character stamp labels remain inside seals')
    const cardPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '保存探索纪念卡', exact: true }).click()
    const card = await readFile(await (await cardPromise).path(), 'utf8')
    assert.equal(await page.evaluate(({ card, title }) => {
      const parsed = new DOMParser().parseFromString(card, 'image/svg+xml')
      if (parsed.querySelector('parsererror')) return false
      const svg = document.importNode(parsed.documentElement, true)
      svg.style.position = 'fixed'; svg.style.left = '-10000px'
      document.body.append(svg)
      const result = [...svg.querySelectorAll('tspan')].map(span => span.textContent).join('') === title
        && [...svg.querySelectorAll('text')].every(text => {
          const box = text.getBBox()
          return box.x >= 24 && box.x + box.width <= 696 && box.y >= 24 && box.y + box.height <= svg.viewBox.baseVal.height - 24
        })
      svg.remove()
      return result
    }, { card, title: longTrail.title }), true, 'download preserves the complete title and keeps SVG text inside the card')
    await context.close()
  }
  await visitor.close(); await operator.close()
  assert.deepEqual(errors, [])
  console.log('PASS Trail stamps/recovery/card, operator edit/preview/real static publication, clean second-browser access, recommendation click, Story links, static export fallback, publication status, JSON handoff, duplication, draft-only removal, long-copy layout/card and 320/390px')
} finally { await browser.close(); await publication.close(); await rm(publicationRoot, { recursive: true, force: true }) }
