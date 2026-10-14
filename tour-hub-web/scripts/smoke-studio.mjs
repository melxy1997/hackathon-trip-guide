import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'

const { chromium } = await import(process.env.TIMEWALKER_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TIMEWALKER_BASE_URL || 'http://127.0.0.1:5174'
const output = process.env.TIMEWALKER_TEST_OUTPUT || '/tmp/timewalker-studio'
await mkdir(output, { recursive: true })
const concepts = [
  { id: 'garden-reply', title: '园林的回信', premise: '访客循着园林里的回信寻找寄信人。', protagonist: '收到回信的访客', desire: '找出回信为何抵达此刻', suspense: '是谁借园林寄出了这封信？', locationRole: '亭台与奇石依次显露信中的线索。', resolution: '访客的现场观察补完了回信。' },
  { id: 'stone-memory', title: '石头记得的名字', premise: '一块奇石请访客找回被遗忘的名字。', protagonist: '替石头寻名的访客', desire: '理解名字与园林的联系', suspense: '名字为何从故事中消失？', locationRole: '不同景点从各自视角保存名字的片段。', resolution: '两条观察路径汇合成名字的新解释。' },
]
const browser = await chromium.launch({ headless: true, executablePath: process.env.TIMEWALKER_CHROMIUM, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${base}/publish`)
  // Build the intercepted candidate from production modules and the real package in the browser's Vite module graph.
  const fixture = await page.evaluate(async selectedConcept => {
    const [{ buildTemplate }, { resolvePresentation }, { packageFingerprint }] = await Promise.all([
      import('/src/experience/builder.ts'), import('/src/experience/presentation.ts'), import('/src/experience/agent/validators.ts'),
    ])
    const pkg = await fetch('/data/attractions/yuyuan-timewalker.json').then(response => response.json())
    const identity = { id: pkg.id, version: pkg.publishedAt, fingerprint: packageFingerprint(pkg) }
    const brief = { attractionId: pkg.id, theme: '寻找一封被园林保存至今的回信', audience: 'general', targetMinutes: 5, style: 'heritage' }
    const input = { attractionId: pkg.id, theme: brief.theme, audience: brief.audience, duration: brief.targetMinutes, tone: 'poetic', mode: 'online' }
    const experience = buildTemplate(pkg, input, `studio-${selectedConcept.id}`).experience
    const choice = experience.scenes.find(scene => scene.interaction?.type === 'single_choice')
    const branches = experience.scenes.filter(scene => scene.mode === 'observation')
    const ending = experience.scenes.find(scene => scene.mode === 'ending')
    const beats = [
      { id: 'opening-beat', type: 'opening', title: '收到线索', summary: '访客在第一站收到故事邀请。', spotId: experience.scenes[0].spotId, sceneIds: [experience.scenes[0].id] },
      { id: 'choice-beat', type: 'choice', title: '选择观察视角', summary: '选择一条理解园林的路径。', spotId: choice.spotId, sceneIds: [choice.id], branches: branches.map((scene, index) => ({ id: `branch-${index + 1}`, label: index ? '创造的痕迹' : '自然的形状', summary: '沿所选视角观察现场。', spotId: scene.spotId, sceneIds: [scene.id], rejoinsAtBeatId: 'ending-beat' })) },
      { id: 'observation-beat', type: 'observation', title: '完成现场观察', summary: '记录一处与线索呼应的细节。', spotId: branches[0].spotId, sceneIds: branches.map(scene => scene.id), observationTask: '找到一处形状或变化并留下观察。' },
      { id: 'ending-beat', type: 'ending', title: '路径汇合', summary: '两条路径在终点汇合并回应悬念。', spotId: ending.spotId, sceneIds: [ending.id] },
    ]
    const refs = [...new Set([pkg.coverImage, ...pkg.spots.map(spot => spot.image)])]
    return { identity, candidate: { schemaVersion: 1, basePackage: identity, brief,
      locationNotes: { basePackage: identity, spots: pkg.spots.map(spot => ({ id: spot.id, name: spot.name, summary: spot.slides[0]?.narration || spot.poetic })), media: refs.map((assetRef, index) => ({ id: `media-${index + 1}`, kind: 'image', assetRef, sourceIds: [] })), sources: structuredClone(pkg.experience?.sources ?? []) },
      selectedConcept, beatSheet: { conceptId: selectedConcept.id, beats }, experience, presentation: resolvePresentation(pkg.presentation),
      resourceManifest: { resources: [], sources: [] }, diagnostics: [{ level: 'warning', message: '内容仍需人工审核。' }] } }
  }, concepts[1])
  let researchCalls = 0
  const researchId = 'research-11111111-1111-4111-8111-111111111111'
  await page.route('**/api/agent/research', async route => {
    researchCalls++
    if (researchCalls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '联网研究尚未配置 Tavily' } }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dossier: {
      id: researchId, basePackage: fixture.identity, brief: fixture.candidate.brief, query: '园林故事', createdAt: Date.now(), provider: 'tavily',
      pages: [{ source: { id: 'web-one', title: '园林灵感资料', url: 'https://example.com/garden', authority: 'secondary' }, excerpt: '亭台和水面带来不同的故事视角。', extracted: true }], warnings: [],
    } }) })
  })
  let conceptCalls = 0
  let compileCalls = 0
  await page.route('**/api/agent/concepts', async route => {
    conceptCalls++
    if (conceptCalls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '在线模型尚未配置' }, requestId: 'req-missing' }) })
    if (conceptCalls > 1) assert.equal(route.request().postDataJSON().researchId, researchId)
    if (conceptCalls === 3) await new Promise(resolve => setTimeout(resolve, 250))
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ concepts: conceptCalls === 3 ? concepts.map(item => ({ ...item, title: `延迟 ${item.title}` })) : concepts, requestId: `req-concepts-${conceptCalls}`, basePackage: fixture.identity }) }) } catch { /* aborted request */ }
  })
  await page.route('**/api/agent/compile', async route => {
    compileCalls++
    if (compileCalls === 2) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试编译失败' }, requestId: 'req-failed' }) })
    const request = route.request().postDataJSON()
    assert.equal(request.selectedConcept.id, concepts[1].id)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidate: fixture.candidate, requestId: 'req-compile', artifact: { id: 'artifact-studio', version: 1, hash: 'hash-studio' }, model: 'mock-browser-fixture', durationMs: 1234, attempts: 1 }) })
  })
  const studio = page.getByRole('region', { name: 'Creative Studio' })
  await studio.getByRole('button', { name: '生成两个故事构想' }).click()
  await studio.getByRole('alert').filter({ hasText: '在线模型尚未配置' }).waitFor()
  await studio.getByRole('button', { name: '联网补充故事灵感' }).click()
  await studio.getByRole('alert').filter({ hasText: '尚未配置 Tavily' }).waitFor()
  await studio.getByRole('button', { name: '联网补充故事灵感' }).click()
  await studio.getByRole('link', { name: '园林灵感资料' }).waitFor()
  await studio.getByText('已读取正文', { exact: true }).waitFor()
  await studio.getByRole('button', { name: '生成两个故事构想' }).click()
  const cards = studio.locator('input[type="radio"][name="studio-concept"]')
  await cards.nth(1).waitFor()
  assert.equal(await cards.count(), 2)
  for (const text of ['一块奇石请访客', '名字为何从故事中消失', '不同景点从各自视角', '两条观察路径汇合']) await studio.getByText(text, { exact: false }).waitFor()
  await studio.getByText('石头记得的名字', { exact: true }).click()
  await studio.getByRole('button', { name: '编译所选构想' }).click()
  await studio.getByRole('heading', { name: fixture.candidate.experience.title }).waitFor()
  const timelineText = await studio.getByRole('list', { name: '故事节拍时间线' }).innerText()
  for (const text of ['地点：', '选择「', '观察任务：', '汇合到：路径汇合']) assert.match(timelineText, new RegExp(text))
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Studio fits mobile')
  await studio.getByRole('button', { name: '编译所选构想' }).click()
  await studio.getByRole('alert').filter({ hasText: '测试编译失败' }).waitFor()
  assert.equal(await cards.nth(1).isChecked(), true)
  assert.equal(await studio.getByRole('heading', { name: fixture.candidate.experience.title }).count(), 1)
  await studio.getByRole('button', { name: '生成两个故事构想' }).click()
  await studio.getByRole('button', { name: '取消当前请求' }).click()
  await studio.getByRole('alert').filter({ hasText: '已取消当前请求' }).waitFor()
  await page.waitForTimeout(300)
  assert.equal(await studio.getByText('延迟 石头记得的名字', { exact: true }).count(), 0)
  assert.equal(await cards.nth(1).isChecked(), true)
  await studio.getByRole('textbox', { name: '故事主题' }).fill('修改后的另一个主题')
  assert.equal(await studio.getByRole('button', { name: '编译所选构想' }).isDisabled(), true)
  await studio.getByText('简报已改变，请重新生成构想。上一份候选仍可采用或导出。', { exact: true }).waitFor()
  await studio.getByRole('textbox', { name: '故事主题' }).fill(fixture.candidate.brief.theme)
  assert.equal(await studio.getByRole('button', { name: '编译所选构想' }).isEnabled(), true)
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('timewalker:studio:v1') || '{}').compiled?.candidate?.selectedConcept?.id === 'stone-memory')
  const downloadPromise = page.waitForEvent('download')
  await studio.getByRole('button', { name: '导出创作成果' }).click()
  const download = await downloadPromise
  const exported = await readFile(await download.path(), 'utf8')
  const saved = JSON.parse(exported)
  assert.equal(saved.compiled.evidence.model, 'mock-browser-fixture')
  assert.equal(saved.compiled.provenance.artifactHash, 'hash-studio')
  await page.screenshot({ path: `${output}/studio-research-390.png`, fullPage: true })
  await page.reload()
  await studio.getByText('已恢复本机创作成果；没有重新调用模型。联网研究可按需重新获取。', { exact: true }).waitFor()
  await studio.getByRole('heading', { name: fixture.candidate.experience.title }).waitFor()
  assert.equal(await cards.nth(1).isChecked(), true)
  const modelCallsBeforeImport = conceptCalls + compileCalls
  await studio.getByLabel('创作成果文件').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') })
  await studio.getByRole('alert').waitFor()
  assert.equal(await studio.getByRole('heading', { name: fixture.candidate.experience.title }).count(), 1, 'invalid import retains previous candidate')
  await page.evaluate(() => localStorage.removeItem('timewalker:studio:v1'))
  await page.reload()
  await studio.getByRole('button', { name: '导入创作成果' }).waitFor()
  await studio.getByLabel('创作成果文件').setInputFiles({ name: 'studio.json', mimeType: 'application/json', buffer: Buffer.from(exported) })
  await studio.getByText('已导入已完成的创作成果；没有重新调用模型，采用后仍进入独立待审草稿。', { exact: true }).waitFor()
  await studio.getByRole('heading', { name: fixture.candidate.experience.title }).waitFor()
  assert.equal(conceptCalls + compileCalls, modelCallsBeforeImport, 'restore/import does not silently call providers')
  await page.setViewportSize({ width: 320, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'restored Studio fits 320px')
  await page.screenshot({ path: `${output}/studio-restored-320.png`, fullPage: true })
  await studio.getByRole('button', { name: '采用并进入故事编辑器' }).click()
  await page.getByRole('heading', { name: '故事编排', exact: true }).waitFor()
  await page.getByText('待人工审核', { exact: false }).first().waitFor()
  await page.getByText('构建智能体起稿', { exact: false }).waitFor()
  assert.match(page.url(), /publish\/attr-.*tab=story/)
  assert.deepEqual(errors, [])
  console.log('PASS Studio research/fallback, bound concepts/compile, stale brief prevention, cancel/retention, refresh, export/import, 320/390px and agent adoption (mock providers)')
} finally { await browser.close() }
