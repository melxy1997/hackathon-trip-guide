import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { exportToDisplayPlugin } from './vite-plugin-export-to-display.ts'

const require = createRequire(import.meta.url)
const { proxyAiChat } = require('./libs/runtime-config.cjs') as {
  proxyAiChat: (body: unknown) => Promise<{ status: number; text?: string; body?: unknown }>
}

function runtimeConfigPlugin(): Plugin {
  return {
    name: 'runtime-config',
    configureServer(server) {
      const fileEnv = loadEnv(server.config.mode, process.cwd(), '')
      const read = (name: string, legacyName: string) => process.env[name] || process.env[legacyName] || fileEnv[name] || fileEnv[legacyName] || ''
      server.middlewares.use('/runtime-config.js', (_req, res) => {
        const config = JSON.stringify({
          amapKey: read('AMAP_KEY', 'VITE_AMAP_KEY'),
          amapSecurityCode: read('AMAP_SECURITY_CODE', 'VITE_AMAP_SECURITY_CODE'),
        }).replace(/</g, '\\u003c')
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(`window.__RUNTIME_CONFIG__ = ${config};`)
      })
      server.middlewares.use('/api/ai/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Allow', 'POST')
          res.end('method not allowed')
          return
        }
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(Buffer.from(chunk))
          const result = await proxyAiChat(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          res.statusCode = result.status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(result.text ?? JSON.stringify(result.body))
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: '请求体必须是 JSON' }))
        }
      })
    },
  }
}

export default defineConfig({
  // 相对路径产物：静态托管把站点挂在 /site/<id>/ 这类前缀下时，绝对 /assets 会跑出站点
  base: './',
  plugins: [react(), tailwindcss(), exportToDisplayPlugin(), runtimeConfigPlugin()],
  server: { port: 5173 },
})
