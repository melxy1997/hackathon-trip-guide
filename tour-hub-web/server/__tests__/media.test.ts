import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { assetStore, digest, imageExtension } from '../agent/assetStore.ts'
import { generateImage, imageDownloadUrl } from '../agent/imageProvider.ts'

export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
test('managed images persist with content hashes, request cache and corruption detection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'timewalker-assets-'))
  try {
    const store = assetStore(directory)
    const input = { requestKey: digest('prompt-model'), model: 'test-image', prompt: 'fictional artwork' }
    const image = await store.put(png, 'image/png', input)
    assert.equal(image.url, `/api/agent/assets/${digest(png)}.png`)
    assert.deepEqual((await assetStore(directory).read(image.file)).data, png)
    assert.equal((await assetStore(directory).cached(input.requestKey))?.prompt, input.prompt)
    // Identical output for another prompt must not invalidate the original request cache.
    await store.put(png, 'image/png', { ...input, requestKey: digest('other'), prompt: 'other prompt' })
    assert.equal((await store.cached(input.requestKey))?.prompt, input.prompt)
    await assert.rejects(store.read('../private.json'), /不存在/)
    await writeFile(join(directory, image.file), 'corrupt')
    assert.equal(await store.cached(input.requestKey), undefined)
    await assert.rejects(store.read(image.file), /损坏/)
    assert.ok((await readdir(directory)).every(name => !name.endsWith('.tmp')))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('Seedream adapter sends one image request and never sends provider auth to CDN or stores its temporary URL', async () => {
  const calls: string[] = []
  const result = await generateImage('illustration', new AbortController().signal, {
    apiKey: 'private-image-key', model: 'test-image-model', fetchImpl: async (url, init) => {
      calls.push(String(url))
      if (calls.length === 1) {
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer private-image-key')
        assert.equal(JSON.parse(String(init?.body)).sequential_image_generation, 'disabled')
        return Response.json({ data: [{ url: 'https://images.tos-cn-beijing.volces.com/test.png?signed=temporary' }] })
      }
      assert.equal(new Headers(init?.headers).get('Authorization'), null)
      assert.equal(init?.redirect, 'error')
      return new Response(png, { headers: { 'Content-Type': 'image/png' } })
    },
  })
  assert.equal(calls.length, 2)
  assert.deepEqual(result.data, png)
  assert.equal(result.mime, 'image/png')
  assert.equal(imageExtension(result.data, result.mime), 'png')
})

test('image failures reject missing config, unsafe download, wrong bytes, oversized output and redact provider errors', async () => {
  const signal = new AbortController().signal
  await assert.rejects(generateImage('x', signal, {}), /ARK_API_KEY/)
  for (const url of ['http://images.volces.com/image', 'https://127.0.0.1/a', 'https://user:secret@cdn.volces.com/a', 'https://volces.com.evil.com/a', 'https://other.example/a']) assert.throws(() => imageDownloadUrl(url), /下载地址/)
  assert.throws(() => imageExtension(Buffer.from('<svg>'), 'image/png'), /内容/)
  await assert.rejects(generateImage('x', signal, { apiKey: 'key', model: 'model', fetchImpl: async () => { throw new Error('secret-provider-response') } }), error => { assert.doesNotMatch(String(error), /secret-provider-response/); return true })
  await assert.rejects(generateImage('x', signal, { apiKey: 'key', model: 'model', maxBytes: 20, fetchImpl: async url => String(url).endsWith('/generations')
    ? Response.json({ data: [{ url: 'https://images.volces.com/a' }] }) : new Response(png, { headers: { 'Content-Type': 'image/png' } }) }), /大小限制/)
  const controller = new AbortController()
  await assert.rejects(generateImage('x', controller.signal, { apiKey: 'key', model: 'model', fetchImpl: async () => { controller.abort(); throw new Error('abort') } }), /取消或超时/)
})
