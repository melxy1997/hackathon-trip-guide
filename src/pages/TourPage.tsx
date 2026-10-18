import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  MapPin,
  MessageCircle,
  Send,
  Volume2,
  X,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import routeThread from '../assets/brand/route-thread.svg'
import waypoint from '../assets/brand/waypoint.svg'
import { AmapLiveMap, type MapApi, type WalkingSearch } from '../components/AmapLiveMap'
import { TourAutoGate } from '../components/TourAutoGate'
import { TourProgressBar } from '../components/TourProgressBar'
import { useTourAutoMode } from '../hooks/useTourAutoMode'
import { estimateSpeechMs, type TourPhase } from '../lib/autoTour'
import { loadPublishedAttraction } from '../lib/catalog'
import { requestAiChat } from '../lib/aiClient'
import { resolveMediaUrl, type LngLat, type PublishedAttraction, type PublishedSpot } from '../lib/tourPackage'

type TourNode = PublishedSpot

const TRIGGER_METERS = 38
const SPEECH_TRAIL_MS = 200
/** 移动速度：3 倍速（基准 1.6 米/秒 × 3），单跳时长上下限同步压到 1/3 */
const WALK_METERS_PER_SEC = 4.8
const WALK_MIN_MS = 200
const WALK_MAX_MS = 2667
/** 景点加载前的占位；真实起点以发布包 start 为准 */
const PLACEHOLDER_POS: LngLat = { lng: 0, lat: 0 }

function buildSystemPrompt(name: string) {
  return `你是${name}的AI导游。只能回答与该景点历史、建筑、文化相关的问题。回答要简洁、口语化，控制在150字以内。如果问题无关，请礼貌拒绝。`
}

function findChineseVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((v) => v.lang.startsWith('zh') && v.localService) ||
    voices.find((v) => v.lang.startsWith('zh')) ||
    voices[0]
  )
}

function haversineMeters(a: LngLat, b: LngLat) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 上层（TourRoute）已经把包读好时直接传进来，省掉一次重复 fetch */
interface TourPageProps {
  initialPackage?: PublishedAttraction
}

export function TourPage({ initialPackage }: TourPageProps = {}) {
  const { id = "" } = useParams()
  const [attraction, setAttraction] = useState<PublishedAttraction | null>(null)
  const { mode, setMode, toggleMode, autoStarted, setAutoStarted } = useTourAutoMode()
  const isAuto = mode === 'auto'

  const [nodes, setNodes] = useState<TourNode[]>([])
  const [spotsError, setSpotsError] = useState('')
  const [mapError, setMapError] = useState('')
  const [moving, setMoving] = useState(false)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [panelOpen, setPanelOpen] = useState(true)
  const [qaOpen, setQaOpen] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [asking, setAsking] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [tourStart, setTourStart] = useState<LngLat>(PLACEHOLDER_POS)
  /** 作者在发布端框的视野中心；缺省 = 以游客起点开场 */
  const [tourView, setTourView] = useState<LngLat | null>(null)
  const [tourZoom, setTourZoom] = useState(18.5)
  const [routePath, setRoutePath] = useState<LngLat[] | null>(null)
  const [tourPhase, setTourPhase] = useState<TourPhase>('idle')
  const [autoChapter, setAutoChapter] = useState(0)

  const animRef = useRef<number | null>(null)
  const activeNodeIdRef = useRef<string | null>(null)
  const charRef = useRef<LngLat>(PLACEHOLDER_POS)
  const nodesRef = useRef<TourNode[]>([])
  const routeSeqRef = useRef(0)
  // 手动模式下显式点击选中的节点：行进途中路过其它节点不得抢占讲解
  const explicitTargetRef = useRef<string | null>(null)
  const onArriveRef = useRef<(() => void) | null>(null)
  const synthRef = useRef(window.speechSynthesis)
  const speechFallbackRef = useRef<number | null>(null)
  const advanceLockRef = useRef(false)
  const modeRef = useRef(mode)
  const tourPhaseRef = useRef(tourPhase)
  const autoChapterRef = useRef(autoChapter)
  const slideIndexRef = useRef(slideIndex)
  const mapApiRef = useRef<MapApi | null>(null)
  const walkingSearchRef = useRef<WalkingSearch | null>(null)

  const activeNode = useMemo(
    () => nodes.find((n) => n.id === activeNodeId) || null,
    [nodes, activeNodeId],
  )
  const activeSlide = activeNode ? activeNode.slides[slideIndex] : null

  const progressChapters = useMemo(
    () => nodes.map((n) => ({ id: n.id, title: n.name, stepCount: n.slides.length })),
    [nodes],
  )

  /** 开场取景：作者框过就用他框的，否则退回游客起点（旧包就是这条） */
  const mapCenter = tourView || tourStart

  useEffect(() => {
    activeNodeIdRef.current = activeNodeId
  }, [activeNodeId])
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    tourPhaseRef.current = tourPhase
  }, [tourPhase])
  useEffect(() => {
    autoChapterRef.current = autoChapter
  }, [autoChapter])
  useEffect(() => {
    slideIndexRef.current = slideIndex
  }, [slideIndex])

  useEffect(() => {
    const synth = synthRef.current
    const load = () => setVoices(synth.getVoices())
    load()
    synth.addEventListener('voiceschanged', load)
    return () => synth.removeEventListener('voiceschanged', load)
  }, [])

  const applyPackage = useCallback((item: PublishedAttraction) => {
    setAttraction(item)
    setNodes(item.spots)
    setTourStart(item.start)
    setTourView(item.view ?? null)
    setTourZoom(item.zoom || 18.5)
    charRef.current = item.start
  }, [])

  useEffect(() => {
    const cleanup = () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (speechFallbackRef.current) window.clearTimeout(speechFallbackRef.current)
    }
    if (initialPackage) {
      applyPackage(initialPackage)
      return cleanup
    }
    let cancelled = false
    void (async () => {
      try {
        const item = await loadPublishedAttraction(id)
        if (cancelled) return
        applyPackage(item)
      } catch (e) {
        if (cancelled) return
        setSpotsError(e instanceof Error ? e.message : '景点加载失败')
      }
    })()
    return () => {
      cancelled = true
      cleanup()
    }
  }, [id, initialPackage, applyPackage])

  const clearSpeechTimers = () => {
    if (speechFallbackRef.current) {
      window.clearTimeout(speechFallbackRef.current)
      speechFallbackRef.current = null
    }
    synthRef.current.cancel()
  }

  const stopMovement = () => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }
    onArriveRef.current = null
    explicitTargetRef.current = null
    setMoving(false)
    setRoutePath(null)
  }

  const exitAutoToManual = useCallback(() => {
    clearSpeechTimers()
    stopMovement()
    advanceLockRef.current = false
    setTourPhase('idle')
    setMode('manual')
  }, [setMode])

  const checkProximity = (pos: LngLat) => {
    if (modeRef.current === 'auto') return
    const target = explicitTargetRef.current
    const nearest = nodesRef.current.reduce<{ node: TourNode; dist: number } | null>((best, node) => {
      if (target && node.id !== target) return best
      const dist = haversineMeters(pos, { lng: node.lng, lat: node.lat })
      if (dist > TRIGGER_METERS) return best
      if (!best || dist < best.dist) return { node, dist }
      return best
    }, null)

    const current = activeNodeIdRef.current
    if (nearest && nearest.node.id !== current) {
      setActiveNodeId(nearest.node.id)
      setSlideIndex(0)
      setPanelOpen(true)
      speakNodeIntro(nearest.node)
    } else if (!nearest && current && !target) {
      setActiveNodeId(null)
      setSlideIndex(0)
      synthRef.current.cancel()
    }
  }

  const animateAlongPath = (points: LngLat[], onArrive?: () => void) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    onArriveRef.current = onArrive ?? null

    const finish = (pos: LngLat) => {
      charRef.current = pos
      mapApiRef.current?.moveVisitor(pos)
      setMoving(false)
      animRef.current = null
      checkProximity(pos)
      explicitTargetRef.current = null
      const cb = onArriveRef.current
      onArriveRef.current = null
      cb?.()
      window.setTimeout(() => setRoutePath(null), 600)
    }

    if (points.length < 2) {
      finish(points[0] || charRef.current)
      return
    }

    setRoutePath(points)

    type Seg = { from: LngLat; to: LngLat; dist: number; start: number }
    const segs: Seg[] = []
    let total = 0
    for (let i = 1; i < points.length; i++) {
      const dist = haversineMeters(points[i - 1], points[i])
      if (dist < 0.2) continue
      segs.push({ from: points[i - 1], to: points[i], dist, start: total })
      total += dist
    }
    if (!segs.length || total < 0.5) {
      finish(points[points.length - 1])
      return
    }

    const duration = Math.min(
      WALK_MAX_MS,
      Math.max(WALK_MIN_MS, (total / WALK_METERS_PER_SEC) * 1000),
    )
    const startAt = performance.now()
    setMoving(true)
    let lastProximity = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - startAt) / duration)
      const traveled = total * t
      let seg = segs[segs.length - 1]
      for (const s of segs) {
        if (traveled <= s.start + s.dist) {
          seg = s
          break
        }
      }
      const local = seg.dist < 1e-6 ? 1 : (traveled - seg.start) / seg.dist
      const next = {
        lng: seg.from.lng + (seg.to.lng - seg.from.lng) * local,
        lat: seg.from.lat + (seg.to.lat - seg.from.lat) * local,
      }
      charRef.current = next
      mapApiRef.current?.moveVisitor(next)
      if (now - lastProximity > 200) {
        lastProximity = now
        checkProximity(next)
      }
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        finish(next)
      }
    }
    animRef.current = requestAnimationFrame(tick)
  }

  const routeTo = (to: LngLat, onArrive?: () => void) => {
    const from = { ...charRef.current }
    routeSeqRef.current += 1
    const seq = routeSeqRef.current

    const run = (path: LngLat[]) => {
      if (seq !== routeSeqRef.current) return
      animateAlongPath(path, onArrive)
    }

    if (haversineMeters(from, to) < 12) {
      run([from, to])
      return
    }

    const search = walkingSearchRef.current
    if (!search) {
      run([from, to])
      return
    }

    setMoving(true)
    void search(from, to).then((raw) => {
      if (seq !== routeSeqRef.current) return
      if (raw && raw.length >= 2) {
        const path = [...raw]
        const first = path[0]
        if (haversineMeters(from, first) > 3) path.unshift(from)
        const last = path[path.length - 1]
        if (haversineMeters(last, to) > 3) path.push(to)
        run(path)
        return
      }
      run([from, to])
    })
  }

  const beginPresenting = useCallback((chapterIndex: number) => {
    const node = nodesRef.current[chapterIndex]
    if (!node) return
    advanceLockRef.current = false
    setAutoChapter(chapterIndex)
    setActiveNodeId(node.id)
    setSlideIndex(0)
    setPanelOpen(true)
    setTourPhase('presenting')
  }, [])

  const walkToChapter = useCallback(
    (chapterIndex: number) => {
      const node = nodesRef.current[chapterIndex]
      if (!node) {
        setTourPhase('done')
        return
      }
      clearSpeechTimers()
      advanceLockRef.current = false
      setAutoChapter(chapterIndex)
      setActiveNodeId(node.id)
      setSlideIndex(0)
      setPanelOpen(true)
      setTourPhase('walking')
      routeTo({ lng: node.lng, lat: node.lat }, () => {
        if (modeRef.current !== 'auto') return
        beginPresenting(chapterIndex)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beginPresenting],
  )

  const advanceAfterNarration = useCallback(() => {
    if (modeRef.current !== 'auto' || tourPhaseRef.current !== 'presenting') return
    if (advanceLockRef.current) return
    advanceLockRef.current = true

    window.setTimeout(() => {
      if (modeRef.current !== 'auto') return
      const chapter = autoChapterRef.current
      const node = nodesRef.current[chapter]
      if (!node) {
        setTourPhase('done')
        return
      }
      const nextSlide = slideIndexRef.current + 1
      if (nextSlide < node.slides.length) {
        advanceLockRef.current = false
        setSlideIndex(nextSlide)
        return
      }
      const nextChapter = chapter + 1
      if (nextChapter < nodesRef.current.length) {
        walkToChapter(nextChapter)
        return
      }
      setTourPhase('done')
      advanceLockRef.current = false
    }, SPEECH_TRAIL_MS)
  }, [walkToChapter])

  const speak = useCallback(
    (text: string, opts?: { onEnd?: () => void }) => {
      clearSpeechTimers()
      if (!text) {
        opts?.onEnd?.()
        return
      }
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'zh-CN'
      const voice = findChineseVoice(voices)
      if (voice) u.voice = voice
      u.rate = 1
      u.pitch = 1
      let ended = false
      const finish = () => {
        if (ended) return
        ended = true
        if (speechFallbackRef.current) {
          window.clearTimeout(speechFallbackRef.current)
          speechFallbackRef.current = null
        }
        opts?.onEnd?.()
      }
      u.onend = finish
      u.onerror = finish
      speechFallbackRef.current = window.setTimeout(finish, estimateSpeechMs(text) + 800)
      synthRef.current.speak(u)
    },
    [voices],
  )

  /** 手动模式下节点成为当前讲解点：自动读一遍该节点的口播（对齐自动漫游的"抵达即讲"） */
  const speakNodeIntro = (node: TourNode) => {
    if (!synthRef.current) return
    const text = node.slides[0]?.narration || ''
    if (text) speak(text)
  }

  // 自动漫游：Gate 解除后从第一章开始
  useEffect(() => {
    if (mode === 'auto' && autoStarted && tourPhase === 'idle') {
      walkToChapter(0)
    }
  }, [mode, autoStarted, tourPhase, walkToChapter])

  // 切回手动：停动画 / 停口播
  useEffect(() => {
    if (mode === 'manual') {
      clearSpeechTimers()
      if (tourPhaseRef.current !== 'idle') {
        stopMovement()
        setTourPhase('idle')
        advanceLockRef.current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // presenting：口播结束推进（对齐 presentation audio.ended → next）
  useEffect(() => {
    if (mode !== 'auto' || tourPhase !== 'presenting' || !activeSlide) return
    if (!voices.length && typeof window !== 'undefined' && !window.speechSynthesis) {
      const t = window.setTimeout(advanceAfterNarration, estimateSpeechMs(activeSlide.narration))
      return () => window.clearTimeout(t)
    }
    advanceLockRef.current = false
    speak(activeSlide.narration, { onEnd: advanceAfterNarration })
    return () => {
      clearSpeechTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tourPhase, activeNodeId, slideIndex, voices.length])

  const goToNodeManual = (node: TourNode) => {
    if (isAuto) {
      const idx = nodesRef.current.findIndex((n) => n.id === node.id)
      if (idx >= 0) walkToChapter(idx)
      return
    }
    explicitTargetRef.current = node.id
    setActiveNodeId(node.id)
    setSlideIndex(0)
    setPanelOpen(true)
    routeTo({ lng: node.lng, lat: node.lat }, () => {
      if (modeRef.current !== 'manual') return
      speakNodeIntro(node)
    })
  }

  const onMapClick = (pos: LngLat) => {
    explicitTargetRef.current = null
    if (isAuto) {
      exitAutoToManual()
      routeTo(pos)
      return
    }
    routeTo(pos)
  }

  const goSlide = (i: number) => {
    if (!activeNode || isAuto) return
    const next = Math.max(0, Math.min(activeNode.slides.length - 1, i))
    setSlideIndex(next)
  }

  const askQuestion = async () => {
    if (!question.trim()) return
    setAsking(true)
    setAnswer('')
    try {
      const text = await requestAiChat({
        messages: [
          { role: 'system', content: buildSystemPrompt(attraction?.name || '景点') },
          { role: 'user', content: question.trim() },
        ],
        maxTokens: 512,
      })
      setAnswer(text)
    } catch {
      setAnswer('AI 服务暂不可用，请稍后重试。')
    } finally {
      setAsking(false)
    }
  }

  const phaseHint =
    !isAuto
      ? mapReady
        ? '手动漫游 · 点击地图沿高德路网徐行'
        : '正在载入…'
      : !autoStarted
        ? '自动漫游待启 · 按 Space 开始'
        : tourPhase === 'walking'
          ? `前往 · ${nodes[autoChapter]?.name ?? ''}`
          : tourPhase === 'presenting'
            ? `讲解中 · ${nodes[autoChapter]?.name ?? ''}`
            : tourPhase === 'done'
              ? '自动漫游已结束'
              : '自动漫游'

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] w-screen flex-col overflow-hidden bg-[#eee7d7] text-[#1f2c27] [--tour-gold:#ad7c2c] [--tour-ink:#24332d] [--tour-paper:#f6f0e3] [--tour-pine:#315846]">
      <header className="relative z-30 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-[#315846]/20 bg-[#f6f0e3]/95 px-4 pb-2 pt-[calc(.5rem+env(safe-area-inset-top))] shadow-[0_1px_0_rgba(255,255,255,.7)] sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm text-[var(--tw-color-ink-secondary)] hover:text-[var(--tw-color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79552f]"
            title="返回景点列表"
          >
            返回
          </Link>
          <span className="text-[var(--tw-color-border)]">/</span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="text-[15px] font-medium truncate">{attraction?.name || '漫游'}</h1>
              <span className="shrink-0 rounded-md bg-[var(--tw-color-action)] px-1.5 py-0.5 text-[10px] text-[var(--tw-color-on-action)]">
                打卡
              </span>
            </div>
            <p className="text-xs text-[var(--tw-color-ink-secondary)] truncate">
              {activeNode && (tourPhase === 'presenting' || !isAuto)
                ? `${activeNode.name}${activeNode.poetic ? ` · ${activeNode.poetic}` : ''}`
                : phaseHint}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex overflow-hidden rounded border border-[#50635d]/30 bg-[#eee8dc] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`min-h-11 cursor-pointer px-2.5 py-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#79552f] ${
                !isAuto ? 'rounded-sm bg-[#181f27] text-[#fffefb] shadow-sm' : 'text-[#50635d] hover:text-[#181f27]'
              }`}
              title="手动漫游（M）"
            >
              手动
            </button>
            <button
              type="button"
              onClick={() => {
                setTourPhase('idle')
                setMode('auto')
              }}
              className={`min-h-11 cursor-pointer px-2.5 py-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#79552f] ${
                isAuto ? 'rounded-sm bg-[#181f27] text-[#fffefb] shadow-sm' : 'text-[#50635d] hover:text-[#181f27]'
              }`}
              title="自动漫游（M）"
            >
              自动
            </button>
          </div>
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className="hidden min-h-11 cursor-pointer items-center gap-1.5 rounded border border-[var(--tw-color-border)] bg-[var(--tw-color-surface)] px-3 py-1.5 text-sm hover:bg-[var(--tw-color-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79552f] sm:inline-flex"
          >
            {panelOpen ? <X size={15} /> : <MapPin size={15} />}
            {panelOpen ? '收起' : '讲解'}
          </button>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden bg-[#ded6c5]">
        <div className="absolute inset-0">
          {nodes.length > 0 && tourStart.lng !== 0 && (
            <AmapLiveMap
              key={`${id}-${tourZoom}-${mapCenter.lng.toFixed(5)}-${mapCenter.lat.toFixed(5)}`}
              start={tourStart}
              center={mapCenter}
              zoom={tourZoom}
              spots={nodes}
              routePath={routePath}
              activeSpotId={activeNodeId}
              onReady={(api) => {
                mapApiRef.current = api
                walkingSearchRef.current = api.searchWalking
                api.moveVisitor(charRef.current)
                setMapReady(true)
              }}
              onMapClick={onMapClick}
              onSpotClick={(spot) => {
                const node = nodes.find((n) => n.id === spot.id)
                if (node) goToNodeManual(node)
              }}
              onError={setMapError}
              visitorImage={
                attraction ? resolveMediaUrl(attraction, attraction.visitorAvatar) || undefined : undefined
              }
            />
          )}
        </div>

        {/* Cartographic wash and graticule: decorative only, so the map retains every gesture. */}
        <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(rgba(246,240,227,.07),rgba(236,225,202,.15))]" />
        <div className="pointer-events-none absolute inset-0 z-[1] opacity-20 [background-image:linear-gradient(rgba(49,88,70,.22)_1px,transparent_1px),linear-gradient(90deg,rgba(49,88,70,.22)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />

        {(!mapReady || !nodes.length) && !spotsError && !mapError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--tw-color-overlay)] text-sm text-[var(--tw-color-ink-secondary)]">
            正在载入地图…
          </div>
        )}
        {(spotsError || mapError) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--tw-color-overlay)] text-sm text-[var(--tw-danger-700)] px-6 text-center">
            {spotsError || mapError}
          </div>
        )}

        <TourAutoGate
          visible={isAuto && !autoStarted}
          onStart={() => setAutoStarted(true)}
        />

        {tourPhase === 'done' && isAuto && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--tw-scene-overlay)] pointer-events-auto">
            <div className="relative mx-4 max-w-sm overflow-hidden rounded-lg border border-white/10 bg-[var(--tw-scene-bg)] px-7 py-6 text-center text-[var(--tw-scene-ink)] shadow-[var(--tw-shadow-dialog)]">
              <img
                src={routeThread}
                alt=""
                aria-hidden="true"
                className="pointer-events-none mx-auto mb-3 h-auto w-full opacity-70"
              />
              <p className="text-lg font-medium">漫游结束</p>
              <p className="mt-2 text-sm text-[var(--tw-color-ink-secondary)]">路线已走完，可切回手动继续游园。</p>
              <button
                type="button"
                onClick={exitAutoToManual}
                className="mt-4 min-h-11 cursor-pointer rounded bg-[#181f27] px-4 py-2 text-sm text-[#fffefb] hover:bg-[#2d3944] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79552f]"
              >
                回到手动漫游
              </button>
            </div>
          </div>
        )}

        <div
          className={`absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-30 hidden w-[min(92vw,280px)] pointer-events-auto sm:block ${
            isAuto && autoStarted ? 'mb-14' : ''
          }`}
        >
          <div className="rounded-md border border-[#50635d]/25 bg-[#f8f6f0]/95 p-3 shadow-[0_12px_38px_rgba(24,31,39,.16)] backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between border-b border-[#315846]/15 px-1 pb-2">
              <p className="font-[var(--tw-font-editorial)] text-sm font-semibold tracking-wide text-[#24332d]">游览路线</p>
              <span className="text-[10px] uppercase tracking-[.18em] text-[#ad7c2c]">{nodes.length} stops</span>
            </div>
            <div className="space-y-0.5 max-h-[42vh] overflow-y-auto">
              {nodes.map((node, i) => {
                const active = node.id === activeNodeId
                return (
                  <button
                    key={node.id}
                    onClick={() => goToNodeManual(node)}
                    aria-current={active ? 'step' : undefined}
                    className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#79552f] ${
                      active
                        ? 'border border-[#9d7343] bg-[#f2ecdf] text-[#181f27]'
                        : 'border border-transparent text-[#354b46] hover:bg-[#eee8dc]'
                    }`}
                  >
                    <span
                      className={`relative flex h-7 w-6 shrink-0 items-center justify-center text-[10px] ${
                        active ? 'text-[#181f27]' : 'text-[#50635d]'
                      }`}
                    >
                      {active ? (
                        <img
                          src={waypoint}
                          alt=""
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 h-full w-full"
                        />
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#50635d]/40">
                          {i + 1}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm truncate">{node.name}</span>
                      {node.poetic ? (
                        <span className={`block text-[11px] truncate ${active ? 'text-[var(--tw-color-accent-text)]' : 'text-[var(--tw-color-ink-secondary)]'}`}>
                          {node.poetic}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {!activeNodeId && !moving && mapReady && !isAuto && (
          <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-md border border-black/10 bg-white/95 px-3.5 py-1.5 text-xs text-[#50635d] shadow-sm sm:left-[calc(50%+40px)]">
            点击地图移动 · 靠近节点展开讲解
          </div>
        )}

        <TourProgressBar
          chapters={progressChapters}
          cursor={{ chapter: autoChapter, step: slideIndex }}
          visible={isAuto && autoStarted && tourPhase !== 'done'}
          onJumpChapter={(i) => walkToChapter(i)}
        />

        {panelOpen && (
          <div className="pointer-events-none absolute inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-20 flex max-h-[46dvh] flex-col gap-2 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:max-h-[calc(100%-2rem)] sm:w-[min(48vw,560px)] lg:w-[min(42vw,610px)]">
            <div className="pointer-events-auto overflow-y-auto rounded-md border border-[#50635d]/25 bg-[#f8f6f0]/95 shadow-[0_14px_44px_rgba(24,31,39,.18)] backdrop-blur-md">
              <div className="p-3 sm:p-4">
                <div className="relative grid overflow-hidden rounded-sm border border-[#50635d]/15 bg-[#eee8dc]">
                  {/* 撑高用：占位格给 16:9 的下限，文案更多时由同格那张卡把盒子顶高，不再被 overflow 剪掉 */}
                  <div className="aspect-presentation col-start-1 row-start-1" aria-hidden />
                  {activeSlide && activeNode ? (
                    <div
                      className="col-start-1 row-start-1 flex flex-col justify-end slide-enter"
                      key={`${activeNode.id}-${slideIndex}`}
                    >
                      <img
                        src={resolveMediaUrl(attraction, activeNode.image)}
                        alt={activeNode.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                      <div className="relative p-5 sm:p-6 flex flex-col justify-end">
                        {activeNode.poetic ? (
                          <p className="text-xs text-white/70 mb-1.5">{activeNode.poetic}</p>
                        ) : null}
                        <h2 className="text-xl sm:text-2xl font-medium text-white leading-snug">
                          {activeSlide.title}
                        </h2>
                        <ul className="mt-3 space-y-1.5 text-sm sm:text-[15px] text-white/90">
                          {activeSlide.bullets.map((b, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tw-scene-accent)]" />
                              <span className="leading-relaxed">{b}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-3 pt-2.5 border-t border-white/15 text-xs sm:text-[13px] text-white/70 leading-relaxed line-clamp-3">
                          {activeSlide.narration}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative col-start-1 row-start-1 flex flex-col justify-end overflow-hidden bg-gradient-to-t from-[#111827] via-[#374151] to-[#9ca3af] p-6">
                      <img
                        src={waypoint}
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none absolute right-6 top-6 h-20 w-16 opacity-35"
                      />
                      <p className="relative text-xs text-white/60 mb-1">漫游</p>
                      <p className="text-2xl font-medium text-white">尚未入景</p>
                      <p className="mt-2 text-sm text-white/80 max-w-[320px] leading-relaxed">
                        {isAuto
                          ? '开启自动漫游后，将按路线走动并展开讲解'
                          : '点击地图或左侧路线，走近节点后展开讲解'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between px-3 py-2.5 border-t border-black/5">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={toggleMode}
                    className={`min-h-11 cursor-pointer rounded px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79552f] ${
                      isAuto
                        ? 'border border-[#9d7343] bg-[#f2ecdf] text-[#79552f]'
                        : 'border border-[#50635d]/20 bg-white/40 text-[#354b46]'
                    }`}
                    title="快捷键 M"
                  >
                    {isAuto ? '自动中' : '切自动'}
                  </button>
                  <button
                    onClick={() => activeSlide && speak(activeSlide.narration)}
                    disabled={!activeSlide || (isAuto && tourPhase === 'presenting')}
                    className="flex min-h-11 cursor-pointer items-center gap-1 rounded border border-[#50635d]/20 bg-white px-2.5 py-1.5 text-xs font-medium text-[#181f27] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79552f]"
                  >
                    <Volume2 size={12} />
                    重播
                  </button>
                </div>
                <div className="flex items-center gap-0.5">
                  <span className="mr-1 text-[11px] text-[#9ca3af] tabular-nums">
                    {activeNode ? `${slideIndex + 1}/${activeNode.slides.length}` : '—'}
                  </span>
                  <button
                    onClick={() => goSlide(slideIndex - 1)}
                    disabled={isAuto || !activeNode || slideIndex === 0}
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded hover:bg-[#eee8dc] disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#79552f]"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => goSlide(slideIndex + 1)}
                    disabled={
                      isAuto || !activeNode || slideIndex === (activeNode?.slides.length || 1) - 1
                    }
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded hover:bg-[#eee8dc] disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#79552f]"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => setQaOpen((v) => !v)}
              className="pointer-events-auto flex min-h-11 cursor-pointer items-center gap-2 self-end rounded border border-[#50635d]/25 bg-white px-3.5 py-2 text-sm text-[#181f27] shadow-sm hover:bg-[#f8f6f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79552f]"
            >
              <MessageCircle size={15} className="text-[var(--tw-color-accent-text)]" />
              {qaOpen ? '收起问答' : '问 AI'}
            </button>

            {qaOpen && (
              <div className="pointer-events-auto max-h-[min(42dvh,360px)] overflow-y-auto rounded-lg border border-black/10 bg-white/95 p-4 shadow-lg backdrop-blur-md">
                <div className="flex items-center gap-2 mb-3 text-[#111827]">
                  <HelpCircle size={15} className="text-[#6b7280]" />
                  <span className="text-sm font-medium">向导游提问</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && askQuestion()}
                    placeholder="例如：这里有什么看点？"
                    className="min-h-11 min-w-0 flex-1 rounded border border-black/10 bg-[#f8f6f0] px-3 py-2 text-sm outline-none focus:border-[#79552f] focus:bg-white focus-visible:ring-2 focus-visible:ring-[#79552f]/25"
                  />
                  <button
                    onClick={askQuestion}
                    disabled={asking || !question.trim()}
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded bg-[#181f27] px-3 py-2 text-[#fffefb] hover:bg-[#2d3944] disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79552f]"
                  >
                    {asking ? (
                      <span className="w-4 h-4 block border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
                {answer && (
                  <div className="mt-3 rounded-md border border-black/10 bg-[#f8f6f0] p-3 text-sm leading-relaxed text-[#354b46]">
                    {answer}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
