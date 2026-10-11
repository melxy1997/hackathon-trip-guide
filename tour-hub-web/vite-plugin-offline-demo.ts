import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { assertPublishedAttraction, resolveMediaUrl } from './src/lib/tourPackage.ts'

/** Build a bounded, fingerprinted sample bundle; never cache API responses or drafts. */
export function offlineDemoPlugin(): Plugin {
  let root = ''
  let output = ''
  return {
    name: 'timewalker-offline-demo',
    apply: 'build',
    configResolved(config) { root = config.root; output = resolve(root, config.build.outDir) },
    async closeBundle() {
      const pkg = assertPublishedAttraction(JSON.parse(await readFile(resolve(output, 'data/attractions/yuyuan-timewalker.json'), 'utf8')))
      const urls = new Set(['/index.html', '/favicon.svg', '/data/catalog.json', '/data/attractions/yuyuan-timewalker.json'])
      for (const entry of await readdir(resolve(output, 'assets'))) {
        if (/\.(js|css)$/.test(entry)) urls.add(`/assets/${entry}`)
      }
      const refs = [pkg.coverImage, ...pkg.spots.map(s => s.image), ...pkg.experience!.scenes.flatMap(s => s.blocks.flatMap(b => b.assetRef ? [b.assetRef] : []))]
      for (const ref of refs) {
        const url = resolveMediaUrl(pkg, ref)
        if (url.startsWith('data:')) continue // Embedded assets already belong to the package checksum.
        if (!url.startsWith('/') || url.startsWith('//') || /[?#\\]|(?:^|\/)\.\.?\//.test(url)) throw new Error(`离线演示素材必须为本站静态文件：${url}`)
        urls.add(url)
      }
      const files = await Promise.all([...urls].sort().map(async url => {
        const bytes = await readFile(resolve(output, `.${url}`))
        return { url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
      }))
      const bytes = files.reduce((sum, file) => sum + file.bytes, 0)
      if (bytes > 20 * 1024 * 1024) throw new Error('离线演示包超过 20 MB，请压缩样例素材。')
      const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 20)
      const manifest = { version, bytes, storyId: pkg.id, title: pkg.experience!.title, files }
      const worker = await readFile(resolve(root, 'offline/worker.js'), 'utf8')
      await writeFile(resolve(output, 'offline-worker.js'), worker.replace('/* OFFLINE_MANIFEST */ null', JSON.stringify(manifest)))
    },
  }
}
