import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, Connect } from 'vite'
import { assertPublishedAttraction } from './src/lib/tourPackage.ts'

const DATA_DIR = './public/data'

function resolveDataDir(root: string) {
  return path.resolve(root, DATA_DIR)
}

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

type Catalog = {
  schemaVersion: number
  updatedAt: number
  items: Array<{
    id: string
    name: string
    description: string
    coverImage: string
    publishedAt: number
    experience?: { title: string; estimatedMinutes: number }
  }>
}

type PublishedPkg = {
  schemaVersion: number
  id: string
  name: string
  description: string
  coverImage: string
  publishedAt: number
  assets?: Record<string, string>
  experience?: { title: string; estimatedMinutes: number }
  [key: string]: unknown
}

function resolveCover(pkg: PublishedPkg): string {
  const ref = pkg.coverImage
  if (!ref) return ''
  if (ref.startsWith('data:') || /^https?:\/\//i.test(ref)) return ref
  if (pkg.assets?.[ref]) return pkg.assets[ref]
  return ref
}

function mergeCatalog(existing: Catalog | null, pkg: PublishedPkg): Catalog {
  const item = {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    coverImage: resolveCover(pkg),
    publishedAt: pkg.publishedAt,
    ...(pkg.experience ? { experience: { title: pkg.experience.title, estimatedMinutes: pkg.experience.estimatedMinutes } } : {}),
    ...(pkg.presentation ? { presentation: pkg.presentation } : {}),
  }
  const prev = Array.isArray(existing?.items) ? existing!.items : []
  return {
    schemaVersion: 1,
    updatedAt: Date.now(),
    items: [item, ...prev.filter((i) => i.id !== pkg.id)],
  }
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** 开发态：发布写入本应用 public/data */
export function exportToDisplayPlugin(): Plugin {
  let root = process.cwd()

  return {
    name: 'trip-guide-export',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (url !== '/__trip_guide/export' || req.method !== 'POST') {
          next()
          return
        }

        try {
          const absoluteDataDir = resolveDataDir(root)
          const body = await readBody(req)
          const parsed = JSON.parse(body) as { package?: PublishedPkg }
          const pkg = parsed.package
          if (!pkg?.id) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: '缺少 package.id' }))
            return
          }
          if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(pkg.id)) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: '发布 ID 无效' }))
            return
          }
          assertPublishedAttraction(pkg)

          fs.mkdirSync(path.join(absoluteDataDir, 'attractions'), { recursive: true })
          writeJson(path.join(absoluteDataDir, 'attractions', `${pkg.id}.json`), pkg)

          const catalogFile = path.join(absoluteDataDir, 'catalog.json')
          const catalog = mergeCatalog(readJson<Catalog>(catalogFile), pkg)
          writeJson(catalogFile, catalog)

          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              ok: true,
              absolutePath: absoluteDataDir,
              attractionPath: path.join('attractions', `${pkg.id}.json`),
              catalogPath: 'catalog.json',
            }),
          )
        } catch (e) {
          res.statusCode = 500
          res.end(
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : '发布写入失败',
            }),
          )
        }
      })
    },
  }
}
