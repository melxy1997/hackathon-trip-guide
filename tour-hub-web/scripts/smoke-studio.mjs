import assert from 'node:assert/strict'

const { chromium } = await import(process.env.TIMEWALKER_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TIMEWALKER_BASE_URL || 'http://127.0.0.1:5174'
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
  let conceptCalls = 0
  let compileCalls = 0
  await page.route('**/api/agent/concepts', async route => {
    conceptCalls++
    if (conceptCalls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '在线模型尚未配置' }, requestId: 'req-missing' }) })
    if (conceptCalls === 3) await new Promise(resolve => setTimeout(resolve, 250))
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ concepts: conceptCalls === 3 ? concepts.map(item => ({ ...item, title: `延迟 ${item.title}` })) : concepts, requestId: `req-concepts-${conceptCalls}`, basePackage: fixture.identity }) }) } catch { /* aborted request */ }
  })
  await page.route('**/api/agent/compile', async route => {
    compileCalls++
    if (compileCalls === 2) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '测试编译失败' }, requestId: 'req-failed' }) })
    const request = route.request().postDataJSON()
    assert.equal(request.selectedConcept.id, concepts[1].id)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidate: fixture.candidate, requestId: 'req-compile', artifact: { id: 'artifact-studio', version: 1, hash: 'hash-studio' } }) })
  })
  const studio = page.getByRole('region', { name: 'Creative Studio' })
  await studio.getByRole('button', { name: '生成两个故事构想' }).click()
  await studio.getByRole('alert').filter({ hasText: '在线模型尚未配置' }).waitFor()
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
  await studio.getByRole('button', { name: '采用并进入故事编辑器' }).click()
  await page.getByRole('heading', { name: '故事编排', exact: true }).waitFor()
  await page.getByText('待人工审核', { exact: false }).first().waitFor()
  await page.getByText('构建智能体起稿', { exact: false }).waitFor()
  assert.match(page.url(), /publish\/attr-.*tab=story/)
  assert.deepEqual(errors, [])
  console.log('PASS Creative Studio concepts, compile, retention, stale cancellation, mobile, and agent adoption')
} finally { await browser.close() }
