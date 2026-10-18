const fs = require('fs')
const path = require('path')
const { proxyAiChat, runtimeConfigScript } = require('../libs/runtime-config.cjs')

const html = fs.readFileSync(
  path.resolve(__dirname, '../dist/index.html'),
  'utf-8',
)

function json(ctx, status, body) {
  ctx.type = 'application/json'
  ctx.status = status
  return JSON.stringify(body)
}

function requestBody(ctx) {
  const body = ctx.request?.body ?? ctx.body ?? ctx.req?.body
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }
  return body
}

module.exports = async function app(ctx) {
  if (ctx.path === '/runtime-config.js') {
    ctx.type = 'application/javascript'
    ctx.status = 200
    ctx.set?.('Cache-Control', 'no-store')
    return runtimeConfigScript()
  }

  if (ctx.path.startsWith('/api/builder/')) return json(ctx, 503, { error: 'Builder 需要 Node 常驻服务与持久目录；此 Serverless 站点暂不支持。' })

  if (ctx.path === '/api/ai/chat') {
    if (ctx.method !== 'POST') {
      ctx.status = 405
      ctx.set?.('Allow', 'POST')
      return 'method not allowed'
    }
    const result = await proxyAiChat(requestBody(ctx))
    if (result.text !== undefined) {
      ctx.type = 'application/json'
      ctx.status = result.status
      return result.text
    }
    return json(ctx, result.status, result.body)
  }

  if (ctx.path === '/' || ctx.path === '/index.html') {
    const { assetsPath } = ctx.assets
    ctx.type = 'html'
    ctx.status = 200

    return html
      .replace(
        'SERVERLESS_INJECT_PUBLIC_PATH',
        `SERVERLESS_INJECT_PUBLIC_PATH = '${assetsPath}'`,
      )
      .replace(/\.\/assets\//g, `${assetsPath}assets/`)
      .replace('./runtime-config.js', `${assetsPath}runtime-config.js`)
  }
}
