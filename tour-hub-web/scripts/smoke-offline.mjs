import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname } from 'node:path'

// Test the built artifact with a real worker and browser offline mode, never Vite/HMR.
const { chromium } = await import(process.env.TIMEWALKER_PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('dist')
const output = process.env.TIMEWALKER_TEST_OUTPUT || '/tmp/timewalker-offline'
await mkdir(output, { recursive: true })
let faultyPhoto = false
let newVersion = false
let requests = 0
let apiRequests = 0
let originDown = false
const offlineAttempts = []
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  if (originDown) { offlineAttempts.push(path); req.socket.destroy(); return }
  requests++
  if (path.startsWith('/api/')) { apiRequests++; res.writeHead(503).end('not configured'); return }
  if (faultyPhoto && path === '/spots/yu-ling-long.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end('corrupt fixture'); return }
  const file = resolve(root, `.${path === '/' || path.startsWith('/experience/') ? '/index.html' : path}`)
  if (!file.startsWith(`${root}/`)) { res.writeHead(403).end(); return }
  try {
    let bytes = await readFile(file)
    if (newVersion && path === '/offline-worker.js') bytes = Buffer.from(bytes.toString().replace(/"version":"[a-f0-9]+"/, '"version":"updated-fixture"'))
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes)
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true, executablePath: process.env.TIMEWALKER_CHROMIUM, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, acceptDownloads: true, serviceWorkers: 'allow' })
const errors = []
await context.addInitScript(() => {
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [], speak: utterance => queueMicrotask(() => utterance.onerror?.(new Event('error'))), cancel: () => {} } })
})
const page = await context.newPage()
page.on('pageerror', error => errors.push(error.message))
const panel = page.getByRole('region', { name: '离线故事包' })
const cacheNames = () => page.evaluate(() => caches.keys())
const ready = () => panel.getByText('离线已准备', { exact: true }).waitFor()
async function play(branch, note, round) {
  await page.getByRole('button', { name: '开启时空漫游', exact: true }).click()
  await page.getByRole('button', { name: '前往下一站', exact: true }).click()
  await page.getByRole('button', { name: '模拟到达大假山', exact: true }).click()
  await page.getByRole('button', { name: '读完了，继续探索', exact: true }).click()
  await page.getByRole('button', { name: branch === 'nature' ? /山林野趣/ : /匠心造景/ }).click()
  await page.getByRole('button', { name: '模拟到达玉玲珑', exact: true }).click()
  await page.getByRole('button', { name: '读完了，继续探索', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.tw-photo-target')?.disabled === false)
  await page.getByRole('button', { name: '点选照片中的细节', exact: true }).focus()
  await page.getByRole('button', { name: '点选照片中的细节', exact: true }).press('Enter')
  await page.getByLabel('这一刻让我想到…', { exact: false }).fill(note)
  await page.getByRole('button', { name: '我已观察，收下这份发现', exact: true }).click()
  await page.reload()
  await ready()
  const connectionLabel = await page.evaluate(() => navigator.onLine ? '浏览器报告网络可用' : '浏览器报告已断网')
  await panel.getByText(connectionLabel, { exact: false }).waitFor()
  await page.getByRole('button', { name: '模拟到达点春堂', exact: true }).click()
  await page.getByRole('button', { name: '读完家书，收下手账', exact: true }).click()
  await page.getByRole('heading', { name: branch === 'nature' ? '山林寻趣者' : '匠心寻迹者', exact: true }).waitFor()
  await page.getByText(note, { exact: true }).waitFor()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存手账卡', exact: true }).click()
  const file = await download
  assert.equal(await file.failure(), null)
  await file.saveAs(`${output}/round-${round}.svg`)
  assert.match(await readFile(`${output}/round-${round}.svg`, 'utf8'), new RegExp(note))
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no phone horizontal overflow')
}
try {
  await page.goto(`${base}/experience/yuyuan-timewalker`)
  await page.waitForFunction(() => navigator.serviceWorker.controller)
  console.log('Checking unprepared offline navigation and corrupted downloads…')
  assert.equal((await cacheNames()).filter(name => name.startsWith('timewalker-offline-v1-')).length, 0, 'registration alone does not prepare')
  await context.setOffline(true)
  await assert.rejects(page.reload(), /net::ERR_(INTERNET_DISCONNECTED|FAILED)/)
  await context.setOffline(false)
  await page.goto(`${base}/experience/yuyuan-timewalker`)

  // A 200 response containing the wrong asset must fail checksum validation.
  faultyPhoto = true
  await panel.getByRole('button', { name: '准备离线故事', exact: true }).click()
  await panel.getByText('准备未完成。', { exact: false }).waitFor()
  await panel.getByText('尚未准备', { exact: true }).waitFor()
  assert.equal((await cacheNames()).filter(name => name.startsWith('timewalker-offline-v1-')).length, 0, 'failed staging cache removed')
  faultyPhoto = false
  await panel.getByRole('button', { name: '准备离线故事', exact: true }).click()
  await ready()
  await panel.getByText('准备完成。', { exact: false }).waitFor()
  console.log('Checking preparation rollback and worker update…')
  await panel.screenshot({ path: `${output}/offline-ready.png` })
  const complete = (await cacheNames()).filter(name => name.startsWith('timewalker-offline-v1-'))
  assert.equal(complete.length, 1)

  // Failed refresh preserves the previously committed bundle.
  faultyPhoto = true
  await panel.getByRole('button', { name: '重新检查并准备', exact: true }).click()
  await panel.getByText('准备未完成。', { exact: false }).waitFor()
  await ready()
  assert.deepEqual((await cacheNames()).filter(name => name.startsWith('timewalker-offline-v1-')), complete)
  faultyPhoto = false

  // A new worker version reports unprepared instead of silently using old content.
  newVersion = true
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update() })
  await panel.getByText('尚未准备', { exact: true }).waitFor()
  assert.deepEqual((await cacheNames()).filter(name => name.startsWith('timewalker-offline-v1-')), complete, 'old version preserved until replacement succeeds')
  await panel.getByRole('button', { name: '准备离线故事', exact: true }).click()
  await ready()
  assert.ok((await cacheNames()).some(name => name.includes('updated-fixture')))
  assert.ok(!(await cacheNames()).includes(complete[0]), 'successful replacement cleans previous version')

  await context.setOffline(true)
  originDown = true // Worker update traffic can bypass Playwright's page offline emulation.
  const before = requests
  await page.reload()
  await ready()
  console.log('Running five full offline rehearsals…')
  for (let i = 0; i < 5; i++) {
    if (i) await page.getByRole('button', { name: '换个视角，再走一次', exact: true }).click()
    await page.setViewportSize({ width: i % 2 ? 320 : 390, height: 844 })
    await play(i % 2 ? 'craft' : 'nature', `离线彩排第${i + 1}次的园林发现`, i + 1)
    console.log(`Offline rehearsal ${i + 1}/5 passed.`)
    await page.reload()
    await page.getByText(`离线彩排第${i + 1}次的园林发现`, { exact: true }).waitFor()
  }
  const second = await context.newPage()
  await second.goto(`${base}/experience/yuyuan-timewalker?director=1`)
  await second.getByRole('heading', { name: '我的时空手账', exact: true }).waitFor()
  await second.close()
  assert.equal(await page.evaluate(() => fetch('/api/health').then(() => false).catch(() => true)), true, 'API requests never replay from caches')
  assert.equal(requests, before, 'offline rounds receive zero responses from origin')
  assert.ok(offlineAttempts.every(path => path === '/offline-worker.js'), `unexpected uncached resource attempts: ${offlineAttempts.join(', ')}`)
  assert.equal(apiRequests, 0)

  // Detect browser eviction and preserve unrelated cache/session state on explicit clear.
  await page.goto(`${base}/`)
  await ready()
  await page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith('timewalker-offline-v1-'))
    await (await caches.open(name)).delete('/spots/yu-ling-long.jpg')
    await (await caches.open('unrelated-test-cache')).put('/unrelated', new Response('keep'))
  })
  await context.setOffline(false)
  originDown = false
  await page.reload()
  await panel.getByText('尚未准备', { exact: true }).waitFor()
  await panel.getByRole('button', { name: '清除离线素材', exact: true }).click()
  await panel.getByText('离线素材已清除', { exact: false }).waitFor()
  assert.deepEqual(await cacheNames(), ['unrelated-test-cache'])
  await page.goto(`${base}/experience/yuyuan-timewalker`)
  await page.getByText('离线彩排第5次的园林发现', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: real worker preparation, checksum failure/rollback, version replacement, five offline branch rehearsals with origin unavailable, refresh/new tab, downloads, eviction detection, scoped clear; zero page errors/model requests.')
} finally {
  await browser.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
