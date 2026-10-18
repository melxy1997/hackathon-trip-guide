import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createBuilderApi } from '../.generated/agent/server/agent/api.js'

const require = createRequire(import.meta.url)
const packageConfig = require('../package.json')
const { proxyAiChat, runtimeConfigScript, getAiConfig, readServerEnv } = require('./runtime-config.cjs')
const { createSpotApi } = require('./spots-store.cjs')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.join(repoRoot, 'dist')
const spotApi = createSpotApi(repoRoot)
console.warn(`[timewalker] DATA_DIR=${spotApi.storageRoot}; management endpoints are public and allow content changes.`)
const builderApi = createBuilderApi({ storageRoot: spotApi.storageRoot, privateRoot: process.env.DATA_DIR ? undefined : path.join(repoRoot, '.agent-jobs'), drafts: spotApi, getConfig: getAiConfig, readEnv: readServerEnv })
const port = Number(process.env.PORT || packageConfig.config?.port || 18085)
const MAX_REQUEST_BODY_BYTES = 128 * 1024

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
}

function send(res, status, body, type, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
  res.writeHead(status, {
    'Content-Type': type || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(buf)
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8')
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_REQUEST_BODY_BYTES) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('请求体必须是 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function resolveFile(urlPath) {
  let rel = urlPath.split('?')[0] || '/'
  try {
    rel = decodeURIComponent(rel)
  } catch {
    return null
  }
  rel = rel.replace(/^\/+/, '')
  if (!rel) return path.join(root, 'index.html')
  const file = path.resolve(root, rel)
  if (file !== root && !file.startsWith(root + path.sep)) return null
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file
  return null
}

function indexHtml() {
  return fs
    .readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(
      'SERVERLESS_INJECT_PUBLIC_PATH',
      "SERVERLESS_INJECT_PUBLIC_PATH = '/'",
    )
    .replace(/\.\/assets\//g, '/assets/')
    .replace('./runtime-config.js', '/runtime-config.js')
}

async function handleAiChat(req, res) {
  if (req.method !== 'POST') {
    send(res, 405, 'method not allowed', 'text/plain; charset=utf-8', { Allow: 'POST' })
    return
  }
  try {
    const result = await proxyAiChat(await readJsonBody(req))
    if (result.text !== undefined) {
      send(res, result.status, result.text, 'application/json; charset=utf-8')
    } else {
      sendJson(res, result.status, result.body)
    }
  } catch (error) {
    sendJson(res, 400, { error: error.message || '请求无效' })
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname === '/slbhealthcheck.html' || url.pathname === '/vi/health') {
    send(res, 200, 'ok', 'text/plain; charset=utf-8')
    return
  }
  if (url.pathname === '/runtime-config.js') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'method not allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD' })
      return
    }
    send(res, 200, req.method === 'HEAD' ? '' : runtimeConfigScript(), 'text/javascript; charset=utf-8')
    return
  }
  if (url.pathname === '/api/ai/chat') {
    await handleAiChat(req, res)
    return
  }
  if (await builderApi.handle(req, res)) return
  if (url.pathname.startsWith('/__trip_guide/')) {
    if (await spotApi.handle(req, res)) return
    send(res, 404, 'not found', 'text/plain; charset=utf-8')
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'method not allowed', 'text/plain; charset=utf-8')
    return
  }

  const file = spotApi.resolvePublicFile(url.pathname) || resolveFile(url.pathname)
  if (file?.endsWith(`${path.sep}index.html`) || url.pathname === '/' || url.pathname === '/index.html') {
    send(res, 200, indexHtml(), contentTypes['.html'])
    return
  }
  if (file) {
    const body = fs.readFileSync(file)
    if (req.method === 'HEAD') {
      send(res, 200, Buffer.alloc(0), contentTypes[path.extname(file)])
      return
    }
    send(res, 200, body, contentTypes[path.extname(file)])
    return
  }
  if (!path.extname(url.pathname)) {
    send(res, 200, indexHtml(), contentTypes['.html'])
    return
  }
  send(res, 404, 'not found', 'text/plain; charset=utf-8')
})

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('[timewalker] 没有找到 dist/index.html，请先执行 npm run build')
  process.exit(1)
}

server.listen(port, () => {
  console.log(`[timewalker] 已启动: http://localhost:${port}/`)
})
