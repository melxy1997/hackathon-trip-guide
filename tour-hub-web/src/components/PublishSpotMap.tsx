import { useEffect, useRef } from 'react'
import AMapLoader from '@amap/amap-jsapi-loader'
import type { Spot } from '../types/attraction'
import type { LngLat } from '../lib/tourPackage'

export type PublishMapApi = {
  getCenter: () => LngLat | null
  setCenter: (pos: LngLat) => void
  setZoom: (zoom: number) => void
}

interface PublishSpotMapProps {
  center: LngLat
  zoom: number
  spots: Spot[]
  selectedId: string | null
  /** 游客初始位置；可拖动 */
  start: LngLat
  onSelect: (id: string) => void
  onMove: (id: string, pos: LngLat) => void
  onStartMove: (pos: LngLat) => void
  onZoomChange: (zoom: number) => void
  onReady?: (api: PublishMapApi) => void
  onError?: (message: string) => void
}

type AnyMarker = {
  on: (ev: string, fn: (e?: { lnglat?: { getLng: () => number; getLat: () => number } }) => void) => void
  setPosition: (c: number[]) => void
  setContent: (html: string) => void
  getPosition?: () => { getLng: () => number; getLat: () => number }
}

type AnyMap = {
  setCenter: (c: number[]) => void
  setZoom: (z: number) => void
  getZoom: () => number
  getCenter: () => { getLng: () => number; getLat: () => number }
  setMapStyle: (s: string) => void
  setFeatures: (f: string[]) => void
  add: (overlay: unknown) => void
  remove: (overlay: unknown | unknown[]) => void
  on: (ev: string, fn: (e?: { lnglat?: { getLng: () => number; getLat: () => number } }) => void) => void
  destroy: () => void
  resize?: () => void
}

type AMapNS = {
  Map: new (el: HTMLElement, opts: object) => AnyMap
  Marker: new (opts: object) => AnyMarker
  Pixel: new (x: number, y: number) => unknown
}

function markerHtml(index: number, name: string, active: boolean) {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);cursor:grab;">
      <div style="
        width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;
        font:600 13px/1 system-ui,sans-serif;color:#fff;
        background:${active ? '#3b82f6' : '#111827'};
        box-shadow:0 4px 12px rgba(0,0,0,.2);border:2px solid #fff;
      ">${index + 1}</div>
      <div style="
        margin-top:4px;padding:2px 8px;border-radius:6px;font:500 12px/1.2 system-ui,sans-serif;
        background:rgba(255,255,255,.96);color:#111827;border:1px solid rgba(0,0,0,.06);
        white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.08);
      ">${name}</div>
    </div>
  `
}

function startMarkerHtml() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);cursor:grab;">
      <div style="
        width:30px;height:30px;border-radius:999px;display:flex;align-items:center;justify-content:center;
        font:700 12px/1 system-ui,sans-serif;color:#fff;background:#10b981;
        box-shadow:0 4px 12px rgba(16,185,129,.35);border:2px solid #fff;
      ">起</div>
      <div style="
        margin-top:4px;padding:2px 8px;border-radius:6px;font:500 12px/1.2 system-ui,sans-serif;
        background:rgba(255,255,255,.96);color:#059669;border:1px solid rgba(16,185,129,.25);
        white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.08);
      ">游客起点</div>
    </div>
  `
}

export function PublishSpotMap({
  center,
  zoom,
  spots,
  selectedId,
  start,
  onSelect,
  onMove,
  onStartMove,
  onZoomChange,
  onReady,
  onError,
}: PublishSpotMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const AMapRef = useRef<AMapNS | null>(null)
  const mapRef = useRef<AnyMap | null>(null)
  const markersRef = useRef<Record<string, AnyMarker>>({})
  const startMarkerRef = useRef<AnyMarker | null>(null)
  const onSelectRef = useRef(onSelect)
  const onMoveRef = useRef(onMove)
  const onStartMoveRef = useRef(onStartMove)
  const onZoomChangeRef = useRef(onZoomChange)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  const spotsRef = useRef(spots)
  const selectedRef = useRef(selectedId)
  const startRef = useRef(start)
  const zoomRef = useRef(zoom)

  onSelectRef.current = onSelect
  onMoveRef.current = onMove
  onStartMoveRef.current = onStartMove
  onZoomChangeRef.current = onZoomChange
  onReadyRef.current = onReady
  onErrorRef.current = onError
  spotsRef.current = spots
  selectedRef.current = selectedId
  startRef.current = start
  zoomRef.current = zoom

  const syncStartMarker = () => {
    const map = mapRef.current
    const AMapLib = AMapRef.current
    if (!map || !AMapLib) return
    const pos = startRef.current
    if (startMarkerRef.current) {
      startMarkerRef.current.setPosition([pos.lng, pos.lat])
      startMarkerRef.current.setContent(startMarkerHtml())
      return
    }
    const marker = new AMapLib.Marker({
      position: [pos.lng, pos.lat],
      content: startMarkerHtml(),
      offset: new AMapLib.Pixel(0, 0),
      draggable: true,
      cursor: 'grab',
      zIndex: 140,
    })
    marker.on('dragend', () => {
      const p = marker.getPosition?.()
      if (!p) return
      onStartMoveRef.current({ lng: p.getLng(), lat: p.getLat() })
    })
    map.add(marker)
    startMarkerRef.current = marker
  }

  const syncMarkers = () => {
    const map = mapRef.current
    const AMapLib = AMapRef.current
    if (!map || !AMapLib) return

    const nextIds = new Set(spotsRef.current.map((s) => s.id))
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      if (!nextIds.has(id)) {
        map.remove(marker)
        delete markersRef.current[id]
      }
    })

    spotsRef.current.forEach((spot, index) => {
      const active = spot.id === selectedRef.current
      const existing = markersRef.current[spot.id]
      if (existing) {
        existing.setPosition([spot.lng, spot.lat])
        existing.setContent(markerHtml(index, spot.name, active))
        return
      }
      const marker = new AMapLib.Marker({
        position: [spot.lng, spot.lat],
        content: markerHtml(index, spot.name, active),
        offset: new AMapLib.Pixel(0, 0),
        draggable: true,
        cursor: 'grab',
        zIndex: active ? 130 : 110,
      })
      marker.on('click', () => onSelectRef.current(spot.id))
      marker.on('dragend', () => {
        const pos = marker.getPosition?.()
        if (!pos) return
        onMoveRef.current(spot.id, { lng: pos.getLng(), lat: pos.getLat() })
      })
      map.add(marker)
      markersRef.current[spot.id] = marker
    })

    syncStartMarker()
  }

  useEffect(() => {
    const key = import.meta.env.VITE_AMAP_KEY
    if (!key) {
      onErrorRef.current?.('缺少 VITE_AMAP_KEY')
      return
    }

    let cancelled = false
    let onResize: (() => void) | null = null

    AMapLoader.load({ key, version: '2.0', plugins: [] })
      .then((AMapLib: AMapNS) => {
        if (cancelled || !containerRef.current) return
        AMapRef.current = AMapLib
        const map = new AMapLib.Map(containerRef.current, {
          viewMode: '2D',
          zoom: zoomRef.current,
          center: [center.lng, center.lat],
          mapStyle: 'amap://styles/whitesmoke',
          features: ['bg', 'road', 'building', 'point'],
          showLabel: true,
        })
        mapRef.current = map

        const resize = () => map.resize?.()
        requestAnimationFrame(resize)
        window.setTimeout(resize, 120)
        onResize = () => resize()
        window.addEventListener('resize', onResize)

        map.on('zoomend', () => {
          onZoomChangeRef.current(map.getZoom())
        })

        syncMarkers()
        onReadyRef.current?.({
          getCenter: () => {
            const c = mapRef.current?.getCenter()
            if (!c) return null
            return { lng: c.getLng(), lat: c.getLat() }
          },
          setCenter: (pos) => {
            mapRef.current?.setCenter([pos.lng, pos.lat])
          },
          setZoom: (z) => {
            mapRef.current?.setZoom(z)
          },
        })
      })
      .catch((err: unknown) => {
        console.error(err)
        onErrorRef.current?.('高德地图加载失败')
      })

    return () => {
      cancelled = true
      if (onResize) window.removeEventListener('resize', onResize)
      markersRef.current = {}
      startMarkerRef.current = null
      mapRef.current?.destroy()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    spotsRef.current = spots
    selectedRef.current = selectedId
    syncMarkers()
  }, [spots, selectedId])

  useEffect(() => {
    startRef.current = start
    syncStartMarker()
  }, [start.lng, start.lat])

  useEffect(() => {
    mapRef.current?.setCenter([center.lng, center.lat])
  }, [center.lng, center.lat])

  return <div ref={containerRef} className="h-full w-full bg-[#f5f5f5]" />
}
