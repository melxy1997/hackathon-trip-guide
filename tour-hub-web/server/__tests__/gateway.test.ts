import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createGateway, type GatewayConfig } from '../gateway.ts'
import { buildTemplate, type BuilderInput } from '../../src/experience/builder.ts'
import { fixture } from '../../src/experience/__tests__/fixtures.ts'

type Reply = { modelConfigured: boolean; mode: string; reviewRequired: boolean; experience: unknown; spots: unknown[]; answer: string; error: { code: string } }
const read = (response: Response) => response.json() as Promise<Reply>

const brief: BuilderInput = { attractionId: 'yuyuan-timewalker', theme: '未来的信', audience: 'general', tone: 'poetic', duration: 5, mode: 'online' }
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
