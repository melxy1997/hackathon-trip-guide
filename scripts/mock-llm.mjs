// 离线 mock 的 OpenAI 兼容 chat/completions SSE 服务,仅用于本地验证
// “dsh → 模型 → 调用自定义 tool → 返回” 的整条链路,不需要真实 API key。
//
// 行为:
//   - 请求里已有 role=tool 的消息(即第一轮 tool 已执行完)→ 返回最终文本;
//   - 请求带 tools 数组(第一轮)→ 流式返回一次 flight_hello 的 tool_call;
//   - 其他情况 → 返回一句普通文本。
//
// 用法:  node scripts/mock-llm.mjs [port]   (默认 8099)
import { createServer } from 'node:http'

const PORT = Number(process.argv[2] || 8099)
// 通过环境变量指定第一轮让模型调用的工具名与参数(默认 flight_hello)
const TOOL_NAME = process.env.MOCK_TOOL_NAME || 'flight_hello'
const TOOL_ARGS = process.env.MOCK_TOOL_ARGS || '{"word":"world"}'

function sse(res, obj) {
    res.write(`data: ${JSON.stringify(obj)}\n\n`)
}

function sendTextTurn(res, text, finishReason = 'stop') {
    sse(res, { choices: [{ index: 0, delta: { role: 'assistant', content: null } }] })
    sse(res, { choices: [{ index: 0, delta: { content: text } }] })
    sse(res, {
        choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
    })
    res.end('data: [DONE]\n\n')
}

function sendToolCallTurn(res) {
    sse(res, { choices: [{ index: 0, delta: { role: 'assistant', content: null } }] })
    sse(res, {
        choices: [
            {
                index: 0,
                delta: {
                    tool_calls: [
                        {
                            index: 0,
                            id: 'call_mock_1',
                            type: 'function',
                            function: { name: TOOL_NAME, arguments: '' },
                        },
                    ],
                },
            },
        ],
    })
    sse(res, {
        choices: [
            {
                index: 0,
                delta: {
                    tool_calls: [{ index: 0, function: { arguments: TOOL_ARGS } }],
                },
            },
        ],
    })
    sse(res, {
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
    })
    res.end('data: [DONE]\n\n')
}

const server = createServer((req, res) => {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'only POST' }))
        return
    }
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (c) => {
        body += c
        if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
        let parsed
        try {
            parsed = JSON.parse(body)
        } catch {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'bad json' }))
            return
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        const messages = Array.isArray(parsed.messages) ? parsed.messages : []
        const hasToolResult = messages.some((m) => m && m.role === 'tool')
        const hasTools = Array.isArray(parsed.tools) && parsed.tools.length > 0
        if (hasToolResult) {
            // 第二轮:tool 已执行,给最终答复
            sendTextTurn(res, 'flight_hello 已执行,返回结果见 tool 消息;一切正常。')
        } else if (hasTools) {
            // 第一轮:让模型“决定”调用 flight_hello
            sendToolCallTurn(res)
        } else {
            sendTextTurn(res, '你好,我是离线 mock 模型(未调用任何工具)。')
        }
    })
})

server.listen(PORT, '127.0.0.1', () => {
    console.log(`mock-llm listening on http://127.0.0.1:${PORT}`)
})
