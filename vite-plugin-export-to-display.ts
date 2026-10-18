import { createRequire } from 'node:module'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)
const { createSpotApi } = require('./libs/spots-store.cjs') as {
  createSpotApi: (projectRoot: string) => {
    handle: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<boolean>
  }
}

/** 开发态：图片落成文件、包体写入本应用 public/spots */
export function exportToDisplayPlugin(): Plugin {
  let api = createSpotApi(process.cwd())

  return {
    name: 'trip-guide-export',
    configResolved(config) {
      api = createSpotApi(config.root)
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (await api.handle(req, res)) return
        next()
      })
    },
  }
}
