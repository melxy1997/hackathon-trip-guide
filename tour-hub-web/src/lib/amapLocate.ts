import AMapLoader from '@amap/amap-jsapi-loader'
import type { LngLat } from './tourPackage'
import type { DraftAttraction, Spot } from '../types/attraction'

export type AmapPoi = {
  name: string
  location: LngLat
  address?: string
  type?: string
  tel?: string
  pname?: string
  cityname?: string
  adname?: string
}

type PlaceSearchResult = {
  poiList?: {
    pois?: Array<{
      name?: string
      type?: string
      address?: string
      tel?: string
      pname?: string
      cityname?: string
      adname?: string
      location?: { lng: number; lat: number } | string
    }>
  }
}

type PlaceSearch = {
  search: (
    keyword: string,
    cb: (status: string, result: PlaceSearchResult | string) => void,
  ) => void
  setCity?: (city: string) => void
}

type AMapNS = {
  PlaceSearch: new (opts: object) => PlaceSearch
}

function parseLocation(loc: { lng: number; lat: number } | string | undefined): LngLat | null {
  if (!loc) return null
  if (typeof loc === 'string') {
    const [lng, lat] = loc.split(',').map(Number)
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat }
    return null
  }
  if (typeof loc.lng === 'number' && typeof loc.lat === 'number') {
    return { lng: loc.lng, lat: loc.lat }
  }
  return null
}

function toPoi(
  raw: NonNullable<NonNullable<PlaceSearchResult['poiList']>['pois']>[number],
): AmapPoi | null {
  const location = parseLocation(raw.location)
  if (!location || !raw.name) return null
  return {
    name: raw.name,
    location,
    address: raw.address || undefined,
    type: raw.type || undefined,
    tel: raw.tel || undefined,
    pname: raw.pname || undefined,
    cityname: raw.cityname || undefined,
    adname: raw.adname || undefined,
  }
}

let placeSearchPromise: Promise<PlaceSearch> | null = null

function getPlaceSearch(): Promise<PlaceSearch> {
  if (placeSearchPromise) return placeSearchPromise
  const key = import.meta.env.VITE_AMAP_KEY
  if (!key) return Promise.reject(new Error('缺少 VITE_AMAP_KEY'))

  placeSearchPromise = AMapLoader.load({
    key,
    version: '2.0',
    plugins: ['AMap.PlaceSearch'],
  }).then((AMapLib: AMapNS) => {
    return new AMapLib.PlaceSearch({
      pageSize: 8,
      pageIndex: 1,
      citylimit: false,
      extensions: 'all',
    })
  })
  return placeSearchPromise
}

function searchList(ps: PlaceSearch, keyword: string, city?: string): Promise<AmapPoi[]> {
  return new Promise((resolve) => {
    if (city && ps.setCity) ps.setCity(city)
    ps.search(keyword, (status, result) => {
      if (status !== 'complete' || typeof result === 'string') {
        resolve([])
        return
      }
      const pois = (result.poiList?.pois || [])
        .map(toPoi)
        .filter((p): p is AmapPoi => !!p)
      resolve(pois)
    })
  })
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function formatPoiLine(p: AmapPoi, i: number): string {
  const parts = [
    `${i + 1}. ${p.name}`,
    p.type ? `类型:${p.type}` : '',
    p.address ? `地址:${p.address}` : '',
    `${p.location.lng.toFixed(5)},${p.location.lat.toFixed(5)}`,
  ].filter(Boolean)
  return parts.join(' · ')
}

/** 把高德 POI 整理成可喂给 AI 的文本 */
export function buildAmapContextText(area: AmapPoi, nearby: AmapPoi[]): string {
  const region = [area.pname, area.cityname, area.adname].filter(Boolean).join('')
  const lines = [
    `主景区：${area.name}`,
    region ? `行政区：${region}` : '',
    area.type ? `类型：${area.type}` : '',
    area.address ? `地址：${area.address}` : '',
    `坐标：${area.location.lng.toFixed(5)}, ${area.location.lat.toFixed(5)}`,
  ]
  if (nearby.length > 0) {
    lines.push('周边/相关地点（来自高德检索，可作导览节点参考）：')
    nearby.forEach((p, i) => lines.push(formatPoiLine(p, i)))
  }
  return lines.filter(Boolean).join('\n')
}

export type ScopeResolveResult = {
  start: LngLat
  zoom: number
  city: string
  areaPoi: AmapPoi
  nearbyPois: AmapPoi[]
  amapContext: string
}

/**
 * 阶段一：按景点名 + 城市检索高德，确定旅游范围与周边地点
 */
export async function resolveAttractionScope(
  draft: Pick<DraftAttraction, 'name' | 'city' | 'start'>,
): Promise<ScopeResolveResult> {
  const ps = await getPlaceSearch()
  const city = (draft.city || '').trim()
  const name = draft.name.trim()
  if (!name) throw new Error('请先填写景点名称')

  let areaList = await searchList(ps, name, city || undefined)
  if (areaList.length === 0) {
    await sleep(120)
    areaList = await searchList(ps, `${name} 景区`, city || undefined)
  }
  if (areaList.length === 0) {
    throw new Error(`高德未找到「${name}」，请调整名称或城市后再试`)
  }

  const areaPoi = areaList[0]
  const resolvedCity = city || areaPoi.cityname || areaPoi.pname || ''

  await sleep(150)
  // 用景区名再搜一轮，取其它相关 POI 作为导览候选
  const related = await searchList(ps, name, resolvedCity || undefined)
  const nearbyPois = related
    .filter((p) => p.name !== areaPoi.name)
    .slice(0, 10)

  // 若相关很少，再按「景点名 + 景点」补一轮
  if (nearbyPois.length < 3) {
    await sleep(120)
    const extra = await searchList(ps, `${name} 景点`, resolvedCity || undefined)
    for (const p of extra) {
      if (p.name === areaPoi.name) continue
      if (nearbyPois.some((x) => x.name === p.name)) continue
      nearbyPois.push(p)
      if (nearbyPois.length >= 10) break
    }
  }

  return {
    start: areaPoi.location,
    zoom: 17,
    city: resolvedCity,
    areaPoi,
    nearbyPois,
    amapContext: buildAmapContextText(areaPoi, nearbyPois),
  }
}

export type LocateResult = {
  start: LngLat
  zoom: number
  spots: Spot[]
  locatedCount: number
}

/**
 * 按节点 searchHint/名称，用高德定位各导览点
 */
export async function locateAttractionOnMap(draft: DraftAttraction): Promise<LocateResult> {
  const ps = await getPlaceSearch()
  const city = (draft.city || '').trim() || undefined
  const areaKeyword = draft.name.trim() || '景点'

  let areaPos: LngLat | null = null
  const areaHits = await searchList(ps, areaKeyword, city)
  if (areaHits[0]) areaPos = areaHits[0].location
  if (!areaPos) {
    await sleep(100)
    const again = await searchList(ps, `${areaKeyword} 景区`, city)
    areaPos = again[0]?.location || draft.start
  }

  await sleep(120)

  const spots: Spot[] = []
  let locatedCount = 0
  for (let i = 0; i < draft.spots.length; i++) {
    const spot = draft.spots[i]
    const hint = (spot.searchHint || `${draft.name} ${spot.name}`).trim()
    let hits = await searchList(ps, hint, city)
    let pos = hits[0]?.location || null
    if (!pos && spot.name) {
      await sleep(80)
      hits = await searchList(ps, `${draft.name} ${spot.name}`, city)
      pos = hits[0]?.location || null
    }
    if (pos) locatedCount += 1
    else {
      const angle = (i / Math.max(1, draft.spots.length)) * Math.PI * 2
      pos = {
        lng: areaPos.lng + Math.cos(angle) * 0.00035,
        lat: areaPos.lat + Math.sin(angle) * 0.00035,
      }
    }
    spots.push({ ...spot, lng: pos.lng, lat: pos.lat })
    await sleep(100)
  }

  const first = spots[0]
  const start = first ? { lng: first.lng, lat: first.lat } : areaPos

  return {
    start,
    zoom: 17.5,
    spots,
    locatedCount,
  }
}
