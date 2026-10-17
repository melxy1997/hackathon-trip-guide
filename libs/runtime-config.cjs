const fs = require('node:fs')
const path = require('node:path')

let fileEnv

function readDotEnv() {
  if (fileEnv) return fileEnv
  fileEnv = {}
  const envPath = path.resolve(__dirname, '../.env')
  if (!fs.existsSync(envPath)) return fileEnv

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    fileEnv[match[1]] = value
  }
  return fileEnv
}

function env(name, legacyName) {
  return process.env[name] || process.env[legacyName] || readDotEnv()[name] || readDotEnv()[legacyName] || ''
}

function getRuntimeConfig() {
  return {
    amapKey: env('AMAP_KEY', 'VITE_AMAP_KEY'),
    amapSecurityCode: env('AMAP_SECURITY_CODE', 'VITE_AMAP_SECURITY_CODE'),
  }
}

function runtimeConfigScript() {
  const config = JSON.stringify(getRuntimeConfig()).replace(/</g, '\\u003c')
  return `window.__RUNTIME_CONFIG__ = ${config};`
}

function getAiConfig() {
  return {
    apiKey: env('DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_API_KEY'),
    baseUrl: env('DEEPSEEK_BASE_URL', 'VITE_DEEPSEEK_BASE_URL').replace(/\/$/, ''),
    model: env('DEEPSEEK_MODEL', 'VITE_DEEPSEEK_MODEL') || 'deepseek-v4.1-flash',
  }
}

function validateChatRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求体必须是 JSON 对象')
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 20) {
    throw new Error('messages 必须是 1 到 20 条消息')
  }

  const messages = body.messages.map((message) => {
    if (!message || typeof message !== 'object') throw new Error('消息格式无效')
    if (!['system', 'user'].includes(message.role) || typeof message.content !== 'string') {
      throw new Error('消息格式无效')
    }
    if (message.content.length > 16000) throw new Error('单条消息不能超过 16000 字符')
    return { role: message.role, content: message.content }
  })

  const payload = { model: getAiConfig().model, messages, stream: false }
  if (Number.isFinite(body.max_tokens)) payload.max_tokens = Math.max(1, Math.min(Math.floor(body.max_tokens), 8192))
  if (Number.isFinite(body.temperature)) payload.temperature = Math.max(0, Math.min(body.temperature, 2))
  return payload
}

async function proxyAiChat(body) {
  const config = getAiConfig()
  if (!config.baseUrl || !config.apiKey) {
    return { status: 503, body: { error: 'AI 服务尚未配置' } }
  }

  let payload
  try {
    payload = validateChatRequest(body)
  } catch (error) {
    return { status: 400, body: { error: error.message } }
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    })
    const text = await response.text()
    return { status: response.status, text }
  } catch (error) {
    console.error('[timewalker] AI upstream request failed:', error)
    return { status: 502, body: { error: 'AI 上游服务不可用' } }
  }
}

module.exports = { getRuntimeConfig, runtimeConfigScript, proxyAiChat }
