import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const packageConfig = require('../package.json')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
const port = Number(process.env.PORT || packageConfig.config?.port || 18085)

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

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
  res.writeHead(status, {
    'Content-Type': type || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  })
  res.end(buf)
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
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname === '/slbhealthcheck.html' || url.pathname === '/vi/health') {
    send(res, 200, 'ok', 'text/plain; charset=utf-8')
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'method not allowed', 'text/plain; charset=utf-8')
    return
  }

  const file = resolveFile(url.pathname)
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
