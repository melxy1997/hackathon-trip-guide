import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { callModel, probeToolCalls } from '../../../.generated/agent/server/agent/model.js'

test('probe performs two actual HTTP turns and consumes the tool result; upstream failures stay redacted', async () => {
  const requests = []
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw); requests.push(body)
    res.setHeader('Content-Type', 'application/json')
    if (body.model === 'bad') { res.writeHead(500); res.end('secret-key private-prompt'); return }
    const tool = body.messages.find(m => m.role === 'tool')
    res.end(JSON.stringify({ choices: [{ message: tool ? { role: 'assistant', content: JSON.parse(tool.content).nonce } : { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'get_server_nonce', arguments: '{}' } }] } }] }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const config = { apiKey: 'private-key', baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'fixture-model' }
  try {
    const result = await probeToolCalls(config)
    assert.equal(result.ok, true); assert.equal(requests.length, 2)
    assert.equal(requests[1].messages.at(-1).tool_call_id, 'call-1')
    await assert.rejects(callModel({ ...config, model: 'bad' }, [{ role: 'user', content: 'private-prompt' }]), e => !/secret-key|private-prompt|private-key/.test(e.message) && e.kind === 'http-500')
    await assert.rejects(probeToolCalls(config, AbortSignal.abort()), /cancelled/)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
