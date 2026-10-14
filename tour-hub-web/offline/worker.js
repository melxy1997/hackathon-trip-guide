/* This template is emitted only by the production build, with immutable file checksums. */
const manifest = /* OFFLINE_MANIFEST */ null
const prefix = 'timewalker-offline-v1-'
const currentPrefix = `${prefix}${manifest.version}-`
const marker = '/__timewalker_offline_complete__'
const resources = new Set(manifest.files.map(file => file.url))
let activeName = null
let preparation = null
const subscribers = new Set()

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

async function completeCache(name) {
  try {
    const cache = await caches.open(name)
    const ready = await cache.match(marker)
    if (!ready || (await ready.json()).version !== manifest.version) return false
    return (await Promise.all(manifest.files.map(file => cache.match(file.url)))).every(Boolean)
  } catch { return false }
}
async function findActive() {
  if (activeName && await completeCache(activeName)) return activeName
  activeName = null
  for (const name of (await caches.keys()).reverse()) {
    if (name.startsWith(currentPrefix) && await completeCache(name)) { activeName = name; break }
  }
  return activeName
}
async function status() {
  return { ready: Boolean(await findActive()), version: manifest.version, bytes: manifest.bytes, title: manifest.title, files: manifest.files.length }
}
async function prepare() {
  const name = `${currentPrefix}${crypto.randomUUID()}`
  const cache = await caches.open(name)
  let done = 0
  try {
    // Sequential bounded downloads keep memory use low on phones.
    for (const file of manifest.files) {
      const response = await fetch(file.url, { cache: 'reload', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error('素材下载失败')
      const bytes = await response.clone().arrayBuffer()
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('')
      if (bytes.byteLength !== file.bytes || digest !== file.sha256) throw new Error('素材与当前构建不一致')
      await cache.put(file.url, response)
      done++
      for (const port of subscribers) port.postMessage({ type: 'progress', done, total: manifest.files.length })
    }
    // The completion marker is written last: partial downloads never count as ready.
    await cache.put(marker, new Response(JSON.stringify({ version: manifest.version }), { headers: { 'Content-Type': 'application/json' } }))
    activeName = name
    // Cleanup must not turn a successfully committed new bundle into a failed preparation.
    for (const old of await caches.keys()) if (old.startsWith(prefix) && old !== name) await caches.delete(old).catch(() => false)
  } catch (error) {
    await caches.delete(name)
    throw error
  }
}
self.addEventListener('message', event => {
  const port = event.ports[0]
  if (!port) return
  event.waitUntil((async () => {
    try {
      if (event.data?.type === 'PREPARE') {
        subscribers.add(port)
        if (!preparation) preparation = prepare().finally(() => { preparation = null })
        try { await preparation } finally { subscribers.delete(port) }
      } else if (event.data?.type === 'CLEAR') {
        if (preparation) await preparation.catch(() => {})
        activeName = null
        for (const name of await caches.keys()) if (name.startsWith(prefix)) await caches.delete(name)
      } else if (event.data?.type !== 'STATUS') return
      port.postMessage({ type: 'result', ...(await status()) })
    } catch {
      port.postMessage({ type: 'error', message: '准备未完成。请检查网络、浏览器存储空间，或刷新后重试；已有完整离线包仍保留。', ...(await status()) })
    } finally { port.close() }
  })())
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  const navigation = event.request.mode === 'navigate' && (url.pathname === '/' || manifest.storyIds.some(id => url.pathname === `/experience/${id}`))
  if (!navigation && (!resources.has(url.pathname) || url.search)) return
  event.respondWith((async () => {
    const name = await findActive()
    if (name) {
      const cached = await (await caches.open(name)).match(navigation ? '/index.html' : url.pathname)
      if (cached) return cached
    }
    return fetch(event.request)
  })())
})
