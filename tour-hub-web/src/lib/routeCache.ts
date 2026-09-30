export interface LngLat {
  lng: number
  lat: number
}

export interface RouteCacheFile {
  version: number
  updatedAt: string
  routes: Record<string, LngLat[]>
}

const CACHE_VERSION = 1
const STORAGE_KEY = 'trip-guide:walk-routes:v1'
const COORD_PRECISION = 5

const memory = new Map<string, LngLat[]>()
let hydrated = false

export function quantizeCoord(n: number) {
  return Number(n.toFixed(COORD_PRECISION))
}

export function routeKey(from: LngLat, to: LngLat) {
  return `${quantizeCoord(from.lng)},${quantizeCoord(from.lat)}>${quantizeCoord(to.lng)},${quantizeCoord(to.lat)}`
}

function clonePath(path: LngLat[]) {
  return path.map((p) => ({ lng: p.lng, lat: p.lat }))
}

export function getCachedRoute(from: LngLat, to: LngLat): LngLat[] | null {
  const hit = memory.get(routeKey(from, to))
  return hit ? clonePath(hit) : null
}

export function setCachedRoute(from: LngLat, to: LngLat, path: LngLat[]) {
  if (path.length < 2) return
  memory.set(routeKey(from, to), clonePath(path))
  schedulePersist()
}

export function ingestRoutes(routes: Record<string, LngLat[]>) {
  Object.entries(routes).forEach(([key, path]) => {
    if (!Array.isArray(path) || path.length < 2) return
    if (!memory.has(key)) memory.set(key, clonePath(path))
  })
}

let persistTimer: number | null = null
function schedulePersist() {
  if (typeof window === 'undefined') return
  if (persistTimer) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    try {
      const payload: RouteCacheFile = {
        version: CACHE_VERSION,
        updatedAt: new Date().toISOString(),
        routes: Object.fromEntries(memory.entries()),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // quota / private mode
    }
  }, 400)
}

export async function hydrateRouteCache() {
  if (hydrated) return
  hydrated = true

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as RouteCacheFile
      if (parsed?.version === CACHE_VERSION && parsed.routes) ingestRoutes(parsed.routes)
    }
  } catch {
    // ignore
  }
}

export function exportRouteCache(): RouteCacheFile {
  return {
    version: CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    routes: Object.fromEntries([...memory.entries()].map(([k, v]) => [k, clonePath(v)])),
  }
}

export function cachedRouteCount() {
  return memory.size
}

/** 顺序预取，避免打爆步行规划配额 */
export async function prefetchRoutePairs(
  search: (from: LngLat, to: LngLat) => Promise<LngLat[] | null>,
  points: LngLat[],
  onProgress?: (done: number, total: number) => void,
) {
  const pairs: Array<[LngLat, LngLat]> = []
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue
      pairs.push([points[i], points[j]])
    }
  }

  let done = 0
  for (const [from, to] of pairs) {
    if (!getCachedRoute(from, to)) {
      try {
        const path = await search(from, to)
        if (path && path.length >= 2) setCachedRoute(from, to, path)
      } catch {
        // keep going
      }
      // 轻微节流
      await new Promise((r) => setTimeout(r, 100))
    }
    done += 1
    onProgress?.(done, pairs.length)
  }
}
