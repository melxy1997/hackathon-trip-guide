const fs = require('node:fs')
const path = require('node:path')

const MEDIA_EXT = /\.(jpe?g|png|webp|gif)$/i
const SPOT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MAX_MEDIA_BYTES = 20 * 1024 * 1024
const MAX_JSON_BYTES = 2 * 1024 * 1024

function createSpotApi(projectRoot) {
  const storageRoot = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(projectRoot)
  const dataDir = process.env.DATA_DIR ? path.join(storageRoot, 'published') : path.join(projectRoot, 'public/spots')
  const trashDir = process.env.DATA_DIR ? path.join(storageRoot, 'trash') : path.join(projectRoot, '.trash/spots')
  const draftsDir = process.env.DATA_DIR ? path.join(storageRoot, 'drafts') : path.join(projectRoot, '.timewalker-drafts')

  function resolveSpotId(id) {
    if (!id || !SPOT_ID.test(id) || id === 'catalog') return null
    return id
  }

  function resolveInside(baseDir, rel) {
    if (!rel || rel.startsWith('/') || rel.startsWith('\\') || rel.includes('\0')) return null
    const parts = rel.split(/[\\/]+/)
    if (parts.some((part) => part === '' || part === '.' || part === '..')) return null
    const abs = path.resolve(baseDir, ...parts)
    if (abs !== baseDir && !abs.startsWith(baseDir + path.sep)) return null
    return abs
  }

  function resolveMediaFile(rel) {
    if (!rel || !MEDIA_EXT.test(rel)) return null
    return resolveInside(dataDir, rel)
  }

  function readJson(file) {
    try {
      if (!fs.existsSync(file)) return null
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }

  function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    fs.renameSync(temp, file)
  }

  function resolveCover(pkg) {
    const ref = pkg.coverImage
    if (!ref) return ''
    if (ref.startsWith('data:') || /^https?:\/\//i.test(ref)) return ref
    if (pkg.assets?.[ref]) return pkg.assets[ref]
    return ref
  }

  function toCatalogEntry(pkg) {
    const storyTitle = typeof pkg.story?.title === 'string' ? pkg.story.title.trim() : ''
    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      coverImage: resolveCover(pkg),
      publishedAt: pkg.publishedAt,
      mode: pkg.mode === 'story' ? 'story' : 'checkin',
      ...(storyTitle ? { storyTitle } : {}),
    }
  }

  function mergeCatalog(existing, pkg) {
    const item = toCatalogEntry(pkg)
    const prev = Array.isArray(existing?.items) ? existing.items : []
    return {
      schemaVersion: 1,
      updatedAt: Date.now(),
      items: [item, ...prev.filter((entry) => entry.id !== pkg.id)],
    }
  }

  function upsertCatalog(pkg) {
    const catalogFile = path.join(dataDir, 'catalog.json')
    const catalog = readJson(catalogFile)
    if (!catalog) return
    catalog.items = [...(Array.isArray(catalog.items) ? catalog.items : []).filter((entry) => entry.id !== pkg.id), toCatalogEntry(pkg)].sort(
      (a, b) => (b.publishedAt || 0) - (a.publishedAt || 0),
    )
    catalog.updatedAt = Date.now()
    writeJson(catalogFile, catalog)
  }

  function resolveTrashFolder(folder) {
    if (!folder || !SPOT_ID.test(folder)) return null
    const abs = path.join(trashDir, folder)
    if (!abs.startsWith(trashDir + path.sep)) return null
    return fs.existsSync(abs) ? abs : null
  }

  function listTrashedSpots() {
    if (!fs.existsSync(trashDir)) return []
    return fs
      .readdirSync(trashDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const folderPath = path.join(trashDir, entry.name)
        const jsonName = fs.readdirSync(folderPath).find((file) => file.endsWith('.json'))
        const pkg = jsonName ? readJson(path.join(folderPath, jsonName)) : null
        return {
          folder: entry.name,
          id: (jsonName ? jsonName.replace(/\.json$/, '') : entry.name) || entry.name,
          name: pkg?.name || entry.name,
          mode: pkg?.mode === 'story' ? 'story' : 'checkin',
          publishedAt: pkg?.publishedAt || 0,
          trashedAt: fs.statSync(folderPath).mtimeMs,
        }
      })
      .sort((a, b) => b.trashedAt - a.trashedAt)
  }

  function restoreSpot(folder) {
    const src = resolveTrashFolder(folder)
    if (!src) throw new Error(`没有这条回收记录: ${folder}`)
    const jsonName = fs.readdirSync(src).find((file) => file.endsWith('.json'))
    if (!jsonName) throw new Error('回收目录里没有包 JSON，无法判断是哪个景点')
    const id = resolveSpotId(jsonName.replace(/\.json$/, ''))
    if (!id) throw new Error(`包 JSON 文件名不合法: ${jsonName}`)

    const pkgFile = path.join(dataDir, `${id}.json`)
    const mediaDir = path.join(dataDir, id)
    if (fs.existsSync(pkgFile) || fs.existsSync(mediaDir)) {
      throw new Error(`public/spots 里已经有 ${id} 了，先把它删掉或改名再恢复`)
    }

    const restored = []
    fs.renameSync(path.join(src, jsonName), pkgFile)
    restored.push(`${id}.json`)
    const mediaSrc = path.join(src, id)
    if (fs.existsSync(mediaSrc) && fs.statSync(mediaSrc).isDirectory()) {
      fs.renameSync(mediaSrc, mediaDir)
      restored.push(`${id}/`)
    }
    fs.rmSync(src, { recursive: true, force: true })
    const pkg = readJson(pkgFile)
    if (pkg) upsertCatalog(pkg)
    return { id, restored }
  }

  function trashSpot(id) {
    const pkgFile = path.join(dataDir, `${id}.json`)
    const mediaDir = path.join(dataDir, id)
    const hasPkg = fs.existsSync(pkgFile)
    const hasMedia = fs.existsSync(mediaDir) && fs.statSync(mediaDir).isDirectory()
    if (!hasPkg && !hasMedia) throw new Error(`没有这个景点: ${id}`)

    let dest = path.join(trashDir, id)
    if (fs.existsSync(dest)) dest = path.join(trashDir, `${id}-${Date.now().toString(36)}`)
    fs.mkdirSync(dest, { recursive: true })

    const trashed = []
    if (hasPkg) {
      fs.renameSync(pkgFile, path.join(dest, `${id}.json`))
      trashed.push(`${id}.json`)
    }
    if (hasMedia) {
      fs.renameSync(mediaDir, path.join(dest, id))
      trashed.push(`${id}/`)
    }

    const catalogFile = path.join(dataDir, 'catalog.json')
    const catalog = readJson(catalogFile)
    if (catalog) {
      catalog.items = (Array.isArray(catalog.items) ? catalog.items : []).filter((entry) => entry.id !== id)
      catalog.updatedAt = Date.now()
      writeJson(catalogFile, catalog)
    }
    return { trashDir: dest, trashed }
  }

  function draftFile(id) {
    return path.join(draftsDir, `${id}.json`)
  }

  function readDraft(id) {
    const draft = readJson(draftFile(id))
    return draft && typeof draft === 'object' && draft.id === id ? draft : null
  }

  function saveDraft(draft, existing) {
    const now = Date.now()
    const saved = {
      ...draft,
      id: draft.id,
      createdAt: Number.isFinite(existing?.createdAt) ? existing.createdAt : now,
      updatedAt: now,
    }
    writeJson(draftFile(draft.id), saved)
    return saved
  }

  function listDrafts() {
    if (!fs.existsSync(draftsDir)) return []
    return fs
      .readdirSync(draftsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => {
        const id = resolveSpotId(entry.name.slice(0, -'.json'.length))
        return id ? readDraft(id) : null
      })
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }

  function readBuffer(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (chunk) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buf.length
        if (size > limit) {
          reject(new Error('请求体过大'))
          req.destroy()
          return
        }
        chunks.push(buf)
      })
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })
  }

  function sendJson(res, status, body) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://localhost')
    if (!url.pathname.startsWith('/__trip_guide/')) return false

    if (url.pathname === '/__trip_guide/drafts' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, items: listDrafts() })
      return true
    }

    if (url.pathname === '/__trip_guide/drafts' && req.method === 'POST') {
      try {
        const draft = JSON.parse((await readBuffer(req, MAX_JSON_BYTES)).toString('utf8'))
        const id = resolveSpotId(draft?.id)
        if (!id || !draft || typeof draft !== 'object') {
          sendJson(res, 400, { ok: false, error: '非法草稿 id' })
          return true
        }
        const existing = readDraft(id)
        if (existing) {
          sendJson(res, 409, { ok: false, error: '草稿已存在，请使用 PUT 更新' })
          return true
        }
        sendJson(res, 201, { ok: true, item: saveDraft(draft) })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : '草稿写入失败' })
      }
      return true
    }

    const draftMatch = /^\/__trip_guide\/drafts\/([^/]+)$/.exec(url.pathname)
    if (draftMatch) {
      const id = resolveSpotId(decodeURIComponent(draftMatch[1]))
      if (!id) {
        sendJson(res, 400, { ok: false, error: '非法草稿 id' })
        return true
      }
      if (req.method === 'GET') {
        const item = readDraft(id)
        if (!item) {
          sendJson(res, 404, { ok: false, error: '草稿不存在' })
        } else {
          sendJson(res, 200, { ok: true, item })
        }
        return true
      }
      if (req.method === 'PUT') {
        try {
          const draft = JSON.parse((await readBuffer(req, MAX_JSON_BYTES)).toString('utf8'))
          if (!draft || typeof draft !== 'object' || draft.id !== id) {
            sendJson(res, 400, { ok: false, error: '草稿 id 不匹配' })
            return true
          }
          const existing = readDraft(id)
          if (!existing) {
            sendJson(res, 404, { ok: false, error: '草稿不存在' })
            return true
          }
          sendJson(res, 200, { ok: true, item: saveDraft(draft, existing) })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : '草稿更新失败' })
        }
        return true
      }
      if (req.method === 'DELETE') {
        const file = draftFile(id)
        if (!fs.existsSync(file)) {
          sendJson(res, 404, { ok: false, error: '草稿不存在' })
        } else {
          fs.rmSync(file)
          sendJson(res, 200, { ok: true })
        }
        return true
      }
    }

    if (url.pathname === '/__trip_guide/media' && req.method === 'POST') {
      try {
        const rel = url.searchParams.get('path') || ''
        const file = resolveMediaFile(rel)
        if (!file) {
          sendJson(res, 400, { ok: false, error: `非法图片路径: ${rel}` })
          return true
        }
        const buf = await readBuffer(req, MAX_MEDIA_BYTES)
        if (!buf.length) {
          sendJson(res, 400, { ok: false, error: '图片内容为空' })
          return true
        }
        fs.mkdirSync(path.dirname(file), { recursive: true })
        const temp = `${file}.${process.pid}.${Date.now()}.tmp`
        fs.writeFileSync(temp, buf)
        fs.renameSync(temp, file)
        sendJson(res, 200, { ok: true, mediaPath: rel, bytes: buf.length })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : '图片写入失败' })
      }
      return true
    }

    if (url.pathname === '/__trip_guide/trash' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, items: listTrashedSpots() })
      return true
    }

    if (url.pathname === '/__trip_guide/trash/restore' && req.method === 'POST') {
      try {
        const folder = url.searchParams.get('folder') || ''
        sendJson(res, 200, { ok: true, ...restoreSpot(folder) })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : '恢复失败' })
      }
      return true
    }

    if (url.pathname === '/__trip_guide/spot' && req.method === 'DELETE') {
      try {
        const raw = url.searchParams.get('id') || ''
        const id = resolveSpotId(raw)
        if (!id) {
          sendJson(res, 400, { ok: false, error: `非法景点 id: ${raw}` })
          return true
        }
        sendJson(res, 200, { ok: true, ...trashSpot(id) })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : '删除失败' })
      }
      return true
    }

    if (url.pathname === '/__trip_guide/export' && req.method === 'POST') {
      try {
        const parsed = JSON.parse((await readBuffer(req, MAX_JSON_BYTES)).toString('utf8'))
        const pkg = parsed?.package
        if (!pkg?.id || !resolveSpotId(pkg.id)) {
          sendJson(res, 400, { ok: false, error: '缺少 package.id' })
          return true
        }
        writeJson(path.join(dataDir, `${pkg.id}.json`), pkg)
        const catalogFile = path.join(dataDir, 'catalog.json')
        writeJson(catalogFile, mergeCatalog(readJson(catalogFile), pkg))
        sendJson(res, 200, {
          ok: true,
          publicPath: `/spots/${pkg.id}.json`,
          attractionPath: `${pkg.id}.json`,
          catalogPath: 'catalog.json',
        })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : '发布写入失败' })
      }
      return true
    }

    return false
  }

  function resolvePublicFile(urlPath) {
    if (!urlPath.startsWith('/spots/')) return null
    const file = resolveInside(dataDir, urlPath.slice('/spots/'.length))
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null
    return file
  }

  return { handle, resolvePublicFile, storageRoot, readDraft,
    createDraft(draft) {
      if (!resolveSpotId(draft?.id) || readDraft(draft.id)) throw new Error('新草稿 ID 已存在或无效')
      return saveDraft(draft)
    },
  }
}

module.exports = { createSpotApi }
