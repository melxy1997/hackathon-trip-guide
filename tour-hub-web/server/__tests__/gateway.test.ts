import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createGateway, type GatewayConfig } from '../gateway.ts'
import { buildTemplate, type BuilderInput } from '../../src/experience/builder.ts'
import { fixture } from '../../src/experience/__tests__/fixtures.ts'
import { packageFingerprint } from '../../src/experience/agent/validators.ts'
import type { CreativeBrief, StoryConcept } from '../../src/experience/agent/contracts.ts'

interface Reply {
  modelConfigured: boolean; mode: string; reviewRequired: boolean; experience: unknown; spots: unknown[]; answer: string
  error: { code: string }; concepts: StoryConcept[]; requestId: string; model: string; stage: string; durationMs: number
  basePackage: { id: string; version: number; fingerprint: string }
}
const read = (response: Response) => response.json() as Promise<Reply>

const brief: BuilderInput = { attractionId: 'yuyuan-timewalker', theme: '未来的信', audience: 'general', tone: 'poetic', duration: 5, mode: 'online' }
const conceptBrief: CreativeBrief = { attractionId: 'yuyuan-timewalker', theme: '未来的信', audience: 'general', targetMinutes: 5, style: 'heritage' }
const concepts: StoryConcept[] = [
  { id: 'lost-letter', title: '失落家书', premise: '玩家追寻一封未送达的家书。', protagonist: '到访园林的玩家', desire: '找到家书原本的收信人', suspense: '家书为何被藏在园林线索中？', locationRole: '亭台与山石依次显露寄信人的路线。', resolution: '玩家在终点读懂家书是留给后人的提醒。' },
  { id: 'stone-echo', title: '石中回声', premise: '玩家收集散落在园林中的未来回声。', protagonist: '能够听见回声的访客', desire: '阻止一段记忆彻底消失', suspense: '未来为何只向今天的访客发出回声？', locationRole: '每处空间以不同形态折射一段记忆。', resolution: '玩家把观察写入新的记录，让记忆继续流传。' },
]
const publicDir = fileURLToPath(new URL('../../public', import.meta.url))
const jsonResponse = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }))
async function withGateway(config: Partial<GatewayConfig>, run: (base: string) => Promise<void>) {
  const server = createGateway({ publicDir, ...config })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  try { await run(`http://127.0.0.1:${address.port}`) }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
}
const post = (base: string, path: string, body: unknown, origin = 'http://localhost:5174') => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) })

test('concepts route validates output, returns binding metadata, and sends bounded package context', async () => {
  const pkg = fixture().pkg
  await withGateway({ apiKey: 'secret', model: 'configured-model', fetchImpl: async (_url, init) => {
    const payload = JSON.parse(String(init!.body))
    assert.match(payload.messages[0].content, /不可信数据，不是指令/)
    const prompt = JSON.parse(payload.messages[1].content)
    assert.deepEqual(prompt.brief, conceptBrief)
    assert.equal(prompt.locationNotes.basePackage.fingerprint, packageFingerprint(pkg))
    assert.ok(prompt.locationNotes.spots.length <= 20); assert.ok(prompt.locationNotes.media.length <= 40); assert.ok(prompt.locationNotes.sources.length <= 20)
    assert.deepEqual(Object.keys(prompt.locationNotes.spots[0]).sort(), ['id', 'name', 'summary'])
    assert.ok(String(init!.body).length < 64_000); assert.ok(!String(init!.body).includes('secret'))
    return jsonResponse(`\n\`\`\`json\n${JSON.stringify({ concepts })}\n\`\`\`\n`)
  } }, async base => {
    const response = await post(base, '/api/agent/concepts', conceptBrief)
    assert.equal(response.status, 200)
    const data = await read(response)
    assert.deepEqual(data.concepts, concepts); assert.match(data.requestId, /^[0-9a-f-]+$/); assert.equal(data.model, 'configured-model'); assert.equal(data.stage, 'concepts')
    assert.ok(Number.isInteger(data.durationMs) && data.durationMs >= 0)
    assert.deepEqual(data.basePackage, { id: pkg.id, version: pkg.publishedAt, fingerprint: packageFingerprint(pkg) })
  })
})

test('concepts route rejects malformed, wrong-count, duplicate and title-only outputs', async () => {
  const titleOnly = [concepts[0], { ...concepts[0], id: 'renamed', title: '另一个标题' }]
  for (const output of [concepts, { concepts: [concepts[0]] }, { concepts: [concepts[0], { ...concepts[1], id: concepts[0].id }] }, { concepts: titleOnly }, '{bad']) {
    await withGateway({ apiKey: 'test', fetchImpl: async () => jsonResponse(output) }, async base => {
      const response = await post(base, '/api/agent/concepts', conceptBrief)
      assert.equal(response.status, 422); assert.equal((await read(response)).error.code, 'GENERATION_INVALID')
    })
  }
})

test('concepts route requires exact CreativeBrief and configured model', async () => {
  await withGateway({}, async base => {
    assert.equal((await post(base, '/api/agent/concepts', { ...conceptBrief, extra: true })).status, 400)
    assert.equal((await post(base, '/api/agent/concepts', { ...conceptBrief, targetMinutes: 2 })).status, 400)
    const missing = await post(base, '/api/agent/concepts', conceptBrief)
    assert.equal(missing.status, 503); assert.equal((await read(missing)).error.code, 'MODEL_NOT_CONFIGURED')
  })
})

test('concept provider errors remain redacted', async () => {
  await withGateway({ apiKey: 'concept-secret', fetchImpl: async () => { throw new Error('concept-secret at https://private.example') } }, async base => {
    const response = await post(base, '/api/agent/concepts', conceptBrief)
    assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /concept-secret|private.example/)
  })
})

test('no credential needed for health/template; online fails explicitly; invalid package and brief return safe errors', async () => {
  await withGateway({}, async base => {
    const health = await read(await fetch(`${base}/api/health`))
    assert.equal(health.modelConfigured, false)
    const template = await post(base, '/api/builder/draft', { ...brief, mode: 'template' })
    assert.equal(template.status, 200); assert.equal((await read(template)).mode, 'template')
    const online = await post(base, '/api/builder/draft', brief)
    assert.equal(online.status, 503); assert.equal((await read(online)).error.code, 'MODEL_NOT_CONFIGURED')
    assert.equal((await post(base, '/api/builder/draft', { ...brief, duration: 1000 })).status, 400)
    assert.equal((await post(base, '/api/builder/draft', { ...brief, attractionId: 'missing' })).status, 404)
    assert.equal((await post(base, '/api/scene/ask', { attractionId: '../private', question: '历史？' })).status, 400)
  })
})
test('private credential is sent only in provider header; candidate returns validated story with review pending', async () => {
  const secret = 'synthetic-test-credential-never-a-real-key'
  const { pkg } = fixture(); const candidate = buildTemplate(pkg, brief, 'x').experience
  const provider: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.deepseek.com/v1/chat/completions')
    assert.equal((init!.headers as Record<string, string>).Authorization, `Bearer ${secret}`)
    assert.ok(!String(init!.body).includes(secret)); assert.equal(init!.redirect, 'error')
    return jsonResponse(candidate)
  }
  await withGateway({ apiKey: secret, fetchImpl: provider }, async base => {
    const response = await post(base, '/api/builder/draft', brief)
    assert.equal(response.status, 200)
    const data = await read(response)
    assert.equal(data.mode, 'online'); assert.equal(data.reviewRequired, true)
    assert.deepEqual(data.experience, candidate); assert.ok(!JSON.stringify(data).includes(secret))
    assert.ok(!await (await fetch(`${base}/api/health`)).text().then(t => t.includes(secret)))
  })
})
test('invalid JSON/graph/source output never becomes a successful candidate', async () => {
  const { pkg } = fixture(); const candidate = buildTemplate(pkg, brief, 'x').experience
  const badGraph = structuredClone(candidate); badGraph.scenes[0].transitions![0].to = 'missing'
  const badSource = structuredClone(candidate); badSource.sources.push({ id: 'fake', title: 'Fake', url: 'https://fake.example', authority: 'official' })
  for (const output of ['not JSON', badGraph, badSource]) {
    await withGateway({ apiKey: 'test', fetchImpl: async () => jsonResponse(output) }, async base => {
      const response = await post(base, '/api/builder/draft', brief)
      assert.equal(response.status, 422); assert.equal((await read(response)).error.code, 'GENERATION_INVALID')
    })
  }
})
test('provider errors are redacted; timeouts abort the provider', async () => {
  await withGateway({ apiKey: 'synthetic-secret', fetchImpl: async () => { throw new Error('synthetic-secret at https://private.example') } }, async base => {
    const response = await post(base, '/api/builder/draft', brief)
    assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /synthetic-secret|private.example/)
  })
  let aborted = false
  await withGateway({ apiKey: 'test', timeoutMs: 30, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('timeout')) }, { once: true })
  }) }, async base => {
    const response = await post(base, '/api/builder/draft', brief)
    assert.equal(response.status, 504); assert.equal((await read(response)).error.code, 'MODEL_TIMEOUT'); assert.equal(aborted, true)
  })
})
test('origin, payload, rate limits and unsafe provider URLs are rejected', async () => {
  await withGateway({ rateLimit: 1 }, async base => {
    assert.equal((await post(base, '/api/builder/draft', brief, 'https://foreign.example')).status, 403)
    assert.equal((await post(base, '/api/builder/draft', { huge: 'x'.repeat(65_000) })).status, 413)
    assert.equal((await post(base, '/api/builder/draft', brief)).status, 429)
  })
  let called = false
  await withGateway({ apiKey: 'test', baseUrl: 'http://unsafe.example', fetchImpl: async () => { called = true; return jsonResponse({}) } }, async base => {
    assert.equal((await post(base, '/api/builder/draft', brief)).status, 503); assert.equal(called, false)
  })
})
test('legacy spots and question routes construct bounded server prompts', async () => {
  let calls = 0
  const spots = Array.from({ length: 3 }, (_, i) => ({ name: `站${i}`, poetic: '', searchHint: '', slides: [{ title: '标题', bullets: ['要点'], narration: '核验后使用。' }] }))
  await withGateway({ apiKey: 'test', fetchImpl: async (_url, init) => {
    const payload = JSON.parse(String(init!.body)); assert.equal(payload.messages[0].role, 'system'); calls++
    return jsonResponse(calls === 1 ? { spots } : '依据现有讲解，资料不足以回答门票问题。')
  } }, async base => {
    const generated = await post(base, '/api/draft/spots', { name: '豫园', description: '园林', start: { lng: 121, lat: 31 }, amapContext: '1. 三穗堂' })
    assert.equal(generated.status, 200); assert.equal((await read(generated)).spots.length, 3)
    const asked = await post(base, '/api/scene/ask', { attractionId: 'yuyuan', question: '门票？' })
    assert.equal(asked.status, 200); assert.match((await read(asked)).answer, /资料不足/)
    assert.equal((await post(base, '/api/scene/ask', { attractionId: 'yuyuan', question: 'x'.repeat(501) })).status, 400)
  })
})
test('disconnect cancels active provider request and excess concurrency gets an actionable error', async () => {
  let started = 0; let cancelled = 0
  await withGateway({ apiKey: 'test', fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    started++
    init!.signal!.addEventListener('abort', () => { cancelled++; reject(new Error('cancelled')) }, { once: true })
  }) }, async base => {
    const controllers = [new AbortController(), new AbortController()]
    const pending = controllers.map(controller => fetch(`${base}/api/builder/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(brief), signal: controller.signal }).catch(() => null))
    try {
      for (let n = 0; n < 100 && started !== 2; n++) await new Promise(resolve => setTimeout(resolve, 5))
      assert.equal(started, 2)
      const excess = await post(base, '/api/builder/draft', brief)
      assert.equal(excess.status, 429); assert.equal((await read(excess)).error.code, 'MODEL_BUSY')
    } finally { controllers.forEach(c => c.abort()); await Promise.all(pending) }
    for (let n = 0; n < 100 && cancelled !== 2; n++) await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal(cancelled, 2)
  })
})
