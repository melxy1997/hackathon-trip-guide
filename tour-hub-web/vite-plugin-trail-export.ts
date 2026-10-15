import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Plugin } from 'vite'
import { assertPublishedAttraction } from './src/lib/tourPackage.ts'
import { assertTrail, trailCatalogItem } from './src/trail/trailSchema.ts'

/** Development-only static publication. Preview/production falls back to explicit JSON export. */
export function trailExportPlugin(): Plugin {
  let root = process.cwd()
  let queue = Promise.resolve()
  const atomic = async (file: string, content: string) => {
    const temporary = `${file}.${randomUUID()}.tmp`
    try { await writeFile(temporary, content); await rename(temporary, file) } finally { await unlink(temporary).catch(() => {}) }
  }
  return {
    name: 'timewalker-trail-export',
    configResolved(config) { root = config.root },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/__trip_guide/trails/export') { next(); return }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ ok: false, error: '请使用 POST。' })); return }
        let operation: (() => Promise<unknown>)
        try {
          if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new Error('仅允许当前开发站点发布。')
          if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('发布内容必须是 JSON。')
          const chunks: Buffer[] = []; let bytes = 0
          for await (const chunk of req) { bytes += chunk.length; if (bytes > 64_000) throw new Error('路线内容超过 64 KB。'); chunks.push(Buffer.from(chunk)) }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (!body || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'trail')) throw new Error('缺少路线内容。')
          const parsed = assertTrail(body.trail)
          operation = async () => {
            const dataDir = join(root, 'public', 'data')
            const pkg = assertPublishedAttraction(JSON.parse(await readFile(join(dataDir, 'attractions', `${parsed.baseAttractionId}.json`), 'utf8')))
            const trail = assertTrail({ ...parsed, publishedAt: Date.now() }, pkg)
            if (trail.relatedExperienceId) {
              const story = assertPublishedAttraction(JSON.parse(await readFile(join(dataDir, 'attractions', `${trail.relatedExperienceId}.json`), 'utf8')))
              if (!story.experience) throw new Error('关联故事尚未发布。')
            }
            const directory = join(dataDir, 'trails'); await mkdir(directory, { recursive: true })
            const catalogPath = join(directory, 'catalog.json'); const trailPath = join(directory, `${trail.id}.json`)
            let catalog = { schemaVersion: 1, updatedAt: 0, items: [] as ReturnType<typeof trailCatalogItem>[] }
            try { catalog = JSON.parse(await readFile(catalogPath, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('路线目录损坏，未覆盖现有数据。') }
            if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.items)) throw new Error('路线目录无效，未覆盖现有数据。')
            let previous: string | undefined
            try { previous = await readFile(trailPath, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
            await atomic(trailPath, `${JSON.stringify(trail, null, 2)}\n`)
            try { await atomic(catalogPath, `${JSON.stringify({ schemaVersion: 1, updatedAt: trail.publishedAt, items: [trailCatalogItem(trail), ...catalog.items.filter(item => item.id !== trail.id)] }, null, 2)}\n`) }
            catch (error) { if (previous !== undefined) await atomic(trailPath, previous); else await unlink(trailPath).catch(() => {}); throw error }
            return { ok: true, trail, path: `/trail/${trail.id}` }
          }
        } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : '路线输入无效。' })); return }
        const task = queue.then(operation)
        queue = task.then(() => {}, () => {})
        try { res.end(JSON.stringify(await task)) }
        catch { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: '发布失败：请确认基础景点和关联故事已发布、目录可写。可先导出 JSON。' })) }
      })
    },
  }
}
