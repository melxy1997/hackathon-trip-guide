import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from '../../src/experience/__tests__/fixtures.ts'
import type { CreativeBrief } from '../../src/experience/agent/contracts.ts'
import { researchAttraction, researchRegistry, researchUrl } from '../agent/research.ts'

const pkg = fixture().pkg
const brief: CreativeBrief = { attractionId: pkg.id, theme: '园林的回信', audience: 'general', targetMinutes: 5, style: 'heritage' }
const signal = () => new AbortController().signal
const searchReply = { results: [
  { url: 'https://example.com/garden#part', title: '园林', content: '山石与水面' },
  { url: 'https://example.org/history', title: '历史', content: '亭台的记忆' },
  { url: 'https://example.com/garden', title: '重复', content: '重复内容' },
  { url: 'https://127.0.0.1/private', title: '无效', content: '不可用地址' },
] }

test('research searches and extracts only returned HTTPS pages with bounded excerpts and private header', async () => {
  const calls: string[] = []
  const result = await researchAttraction(pkg, brief, signal(), { apiKey: 'private-key', fetchImpl: async (url, init) => {
    calls.push(String(url))
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer private-key')
    assert.ok(!String(init?.body).includes('private-key'))
    if (String(url).endsWith('/search')) return Response.json(searchReply)
    assert.deepEqual(JSON.parse(String(init?.body)).urls, ['https://example.com/garden', 'https://example.org/history'])
    return Response.json({ results: [
      { url: 'https://example.com/garden', raw_content: '正文'.repeat(5000) },
      { url: 'https://unsearched.com/page', raw_content: '未检索页面不可进入研究产物' },
    ] })
  } })
  assert.equal(calls.length, 2)
  assert.equal(result.pages.length, 2)
  assert.equal(result.pages[0].excerpt.length, 5000)
  assert.equal(result.pages[0].extracted, true)
  assert.equal(result.pages[1].extracted, false)
  assert.equal(result.warnings.length, 1)
  assert.ok(!JSON.stringify(result).includes('private-key'))
})

test('research rejects missing key, empty/invalid output and redacts provider errors', async () => {
  await assert.rejects(researchAttraction(pkg, brief, signal(), {}), /Tavily/)
  for (const value of [{}, { results: [] }]) await assert.rejects(researchAttraction(pkg, brief, signal(), { apiKey: 'key', fetchImpl: async () => Response.json(value) }))
  await assert.rejects(researchAttraction(pkg, brief, signal(), { apiKey: 'key', fetchImpl: async () => { throw new Error('secret raw provider detail') } }), error => {
    assert.doesNotMatch(String(error), /secret|raw provider/)
    return true
  })
})

test('extract failure preserves actual search summaries; cancellation does not become success', async () => {
  const options = { apiKey: 'key', fetchImpl: (async (url: Parameters<typeof fetch>[0]) => String(url).endsWith('/search') ? Response.json(searchReply) : new Response('provider detail', { status: 503 })) as typeof fetch }
  const result = await researchAttraction(pkg, brief, signal(), options)
  assert.equal(result.warnings.length, 1)
  assert.equal(result.pages[0].excerpt, '山石与水面')
  const controller = new AbortController()
  await assert.rejects(researchAttraction(pkg, brief, controller.signal, { apiKey: 'key', fetchImpl: async () => { controller.abort(); throw new Error('abort') } }), /取消或超时/)
})

test('research URL filtering excludes credentials, IPs, local names and non-HTTPS', () => {
  for (const url of ['http://example.com', 'https://name:secret@example.com', 'https://localhost/a', 'https://127.1/a', 'https://[::1]/a', 'https://foo.local/a', 'https://server.internal/a', 'https://example.com:8443/a']) assert.equal(researchUrl(url), undefined)
})

test('research registry binds brief and package, isolates data and bounds lifetime/capacity', async () => {
  const dossier = await researchAttraction(pkg, brief, signal(), { apiKey: 'key', fetchImpl: async url => String(url).endsWith('/search') ? Response.json(searchReply) : Response.json({ results: [] }) })
  const cache = researchRegistry(30_000, 1)
  cache.put(dossier)
  assert.throws(() => cache.get(dossier.id, { ...brief, theme: '其他主题' }, pkg), /不一致/)
  assert.throws(() => cache.get(dossier.id, brief, { ...pkg, publishedAt: pkg.publishedAt + 1 }), /不一致/)
  cache.get(dossier.id, brief, pkg)!.pages[0].excerpt = 'mutated'
  assert.notEqual(cache.get(dossier.id, brief, pkg)!.pages[0].excerpt, 'mutated')
  cache.put({ ...dossier, id: 'another' })
  assert.throws(() => cache.get(dossier.id, brief, pkg), /过期/)
  const expired = researchRegistry(-1)
  expired.put(dossier)
  assert.throws(() => expired.get(dossier.id, brief, pkg), /过期/)
})
