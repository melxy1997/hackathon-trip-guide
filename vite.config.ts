import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { exportToDisplayPlugin } from './vite-plugin-export-to-display.ts'

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
    },
  }
}

export default defineConfig({
  // 相对路径产物：静态托管把站点挂在 /site/<id>/ 这类前缀下时，绝对 /assets 会跑出站点
  base: './',
  plugins: [react(), tailwindcss(), exportToDisplayPlugin(), runtimeConfigPlugin()],
  server: { port: 5173 },
})
