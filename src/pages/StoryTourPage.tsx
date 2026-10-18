import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Compass, Footprints, RotateCcw, Square, Volume2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import brassArrow from '../assets/brand/brass-arrow.svg'
import routeThread from '../assets/brand/route-thread.svg'
import sceneCorner from '../assets/brand/scene-corner.svg'
import sealExploration from '../assets/brand/seal-exploration.svg'
import { AmapLiveMap, type MapApi, type WalkingSearch } from '../components/AmapLiveMap'
import { AskAiPanel } from '../components/AskAiPanel'
import {
  resolveMediaUrl,
  type LngLat,
  type PublishedAttraction,
  type PublishedSpot,
} from '../lib/tourPackage'
import { haversineMeters, speakOnce, walkAlongPath } from '../lib/tourLive'
import {
  storyChoiceLabel,
  storyEndingLabel,
  storyEntryId,
  storyNextChoices,
} from '../lib/storyTour'

/**
 * 故事模式前台。与打卡页是兄弟页面，骨架自成一派：
 * 地图打底 + 右上角当前情节 + 左下角去向选项；没有自动模式，推进全靠人点按钮。
 */
export function StoryTourPage({ pkg }: { pkg: PublishedAttraction }) {
  const entry = useMemo(() => storyEntryId(pkg), [pkg])
  const [currentId, setCurrentId] = useState<string | null>(entry)
  const [visited, setVisited] = useState<string[]>(() => (entry ? [entry] : []))
  /** 开始遮罩：进来先不播报，点「开始」才算这一程的第一下（也顺手解开浏览器的自动播放限制） */
  const [started, setStarted] = useState(false)
  /** 结算画面：走到结局、且该节点口播讲完才压上来 */
  const [settled, setSettled] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [moving, setMoving] = useState(false)
  const [routePath, setRoutePath] = useState<LngLat[] | null>(null)
  const [freeRoam, setFreeRoam] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  /** 「重播」等于给同一个节点换个口令，逼播报 effect 重跑 */
  const [speakToken, setSpeakToken] = useState(0)
  /** 当前情节卡收起后只留底栏，把地图让出来；走动换节点不改变这个选择 */
  const [cardOpen, setCardOpen] = useState(true)

  const animRef = useRef<(() => void) | null>(null)
  /** 这一趟已经弹过结算了：关掉之后不再自动弹（重播同一段口播也不弹） */
  const settleShownRef = useRef(false)
  const charRef = useRef<LngLat>(pkg.start)
  const mapApiRef = useRef<MapApi | null>(null)
  const walkingSearchRef = useRef<WalkingSearch | null>(null)
  const routeSeqRef = useRef(0)
  const synthRef = useRef(window.speechSynthesis)
  const narrateCancelRef = useRef<(() => void) | null>(null)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    voicesRef.current = voices
  }, [voices])

  useEffect(() => {
    const synth = synthRef.current
    const load = () => setVoices(synth.getVoices())
    load()
    synth.addEventListener('voiceschanged', load)
    return () => synth.removeEventListener('voiceschanged', load)
  }, [])

  const current = useMemo(
    () => pkg.spots.find((s) => s.id === currentId) || null,
    [pkg.spots, currentId],
  )

  const slide = current?.slides[0] || null

  /** 故事名：与景点名并列的副标题，撑开场用；没起名就不显示那一行 */
  const storyTitle = pkg.story?.title?.trim() || ''

  /** 不回头：只列没去过的去向（§3.3 第 5 条） */
  const available = useMemo(() => {
    if (!currentId) return []
    return storyNextChoices(pkg, currentId).filter((c) => !visited.includes(c.to))
  }, [pkg, currentId, visited])

  /** 去向被过滤光也算结局（§3.3 边界） */
  const isEnding = !!current && available.length === 0

  /** 迷雾：只露"站在哪"和"下一步能去哪" */
  const visibleIds = useMemo(() => {
    const ids = new Set<string>()
    if (currentId) ids.add(currentId)
    for (const c of available) ids.add(c.to)
    return ids
  }, [currentId, available])

  const walkedTrace = useMemo(
    () =>
      visited
        .map((id) => pkg.spots.find((s) => s.id === id)?.name)
        .filter((n): n is string => !!n),
    [visited, pkg.spots],
  )

  const stopWalk = useCallback(() => {
    routeSeqRef.current += 1
    animRef.current?.()
    animRef.current = null
    setMoving(false)
    setRoutePath(null)
  }, [])

  /** 沿高德路网走到 to；到达后回调（复用共用底座的折线匀速动画） */
  const walkTo = useCallback((to: LngLat, onArrive: () => void) => {
    const from = { ...charRef.current }
    routeSeqRef.current += 1
    const seq = routeSeqRef.current
    setMoving(true)

    const run = (path: LngLat[]) => {
      if (seq !== routeSeqRef.current) return
      setRoutePath(path)
      animRef.current = walkAlongPath(path, {
        onFrame: (pos) => {
          charRef.current = pos
          mapApiRef.current?.moveVisitor(pos)
        },
        onArrive: (pos) => {
          if (seq !== routeSeqRef.current) return
          charRef.current = pos
          mapApiRef.current?.moveVisitor(pos)
          animRef.current = null
          setMoving(false)
          onArrive()
          window.setTimeout(() => {
            if (seq === routeSeqRef.current) setRoutePath(null)
          }, 600)
        },
      })
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
    void search(from, to).then((raw) => {
      if (seq !== routeSeqRef.current) return
      if (raw && raw.length >= 2) {
        const path = [...raw]
        if (haversineMeters(from, path[0]) > 3) path.unshift(from)
        if (haversineMeters(path[path.length - 1], to) > 3) path.push(to)
        run(path)
        return
      }
      run([from, to])
    })
  }, [])

  /** 点左下角选项：走过去，到了才算"来过" */
  const goTo = (targetId: string) => {
    if (moving) return
    const node = pkg.spots.find((s) => s.id === targetId)
    if (!node) return
    walkTo({ lng: node.lng, lat: node.lat }, () => {
      setVisited((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]))
      setCurrentId(targetId)
      setFreeRoam(false)
      settleShownRef.current = false
      setSettled(false)
    })
  }

  const restart = () => {
    stopWalk()
    if (!entry) return
    const node = pkg.spots.find((s) => s.id === entry)
    setFreeRoam(false)
    setVisited([entry])
    setCurrentId(entry)
    setSettled(false)
    settleShownRef.current = false
    setSpeakToken((t) => t + 1)
    if (node) {
      const pos = { lng: node.lng, lat: node.lat }
      charRef.current = pos
      mapApiRef.current?.moveVisitor(pos)
    }
  }

  /** 点「开始」后进入一个节点就播报该节点情节；走动过程中不打断。结局节点讲完就弹结算 */
  useEffect(() => {
    if (!started) return
    const node = pkg.spots.find((s) => s.id === currentId)
    narrateCancelRef.current?.()
    narrateCancelRef.current = speakOnce({
      synth: synthRef.current,
      voices: voicesRef.current,
      text: node?.slides[0]?.narration || '',
      onEnd: () => {
        if (!isEnding || settleShownRef.current) return
        settleShownRef.current = true
        setSettled(true)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, currentId, speakToken, pkg])

  useEffect(
    () => () => {
      narrateCancelRef.current?.()
      routeSeqRef.current += 1
      animRef.current?.()
    },
    [],
  )

  const onMapClick = (pos: LngLat) => {
    if (!freeRoam || moving) return
    walkTo(pos, () => {})
  }

  const onSpotClick = (spot: PublishedSpot) => {
    if (spot.id === currentId) return
    if (available.some((c) => c.to === spot.id)) goTo(spot.id)
  }

  if (!current) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--tw-scene-bg)] text-sm text-[var(--tw-scene-muted)]">
        这个故事还没有可走的节点
      </div>
    )
  }

  return (
    <div data-experience-skin="noir" className="relative h-[100dvh] min-h-[100dvh] w-screen overflow-hidden bg-[#050811] text-[var(--tw-scene-ink)] [--story-gold:#d4af67]">
      <div className="absolute inset-0">
        <AmapLiveMap
          key={pkg.id}
          start={pkg.start}
          center={pkg.view || pkg.start}
          zoom={pkg.zoom || 18.5}
          spots={pkg.spots}
          routePath={routePath}
          activeSpotId={currentId}
          markerLabel={(spot) => (visibleIds.has(spot.id) ? '' : null)}
          onReady={(api) => {
            mapApiRef.current = api
            walkingSearchRef.current = api.searchWalking
            api.moveVisitor(charRef.current)
            setMapReady(true)
          }}
          onMapClick={onMapClick}
          onSpotClick={onSpotClick}
          onError={setMapError}
          visitorImage={resolveMediaUrl(pkg, pkg.visitorAvatar) || undefined}
        />
      </div>

      {/* Deep-space editorial atmosphere. These layers are visual only and never capture map gestures. */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_45%_40%,transparent_0,rgba(3,6,14,.08)_40%,rgba(3,6,14,.72)_100%)]" />
      <div className="pointer-events-none absolute -left-36 top-[16%] z-[1] h-[34rem] w-[34rem] rounded-full border border-[#d4af67]/20 opacity-60" />
      <div className="pointer-events-none absolute -left-24 top-[22%] z-[1] h-[25rem] w-[25rem] rounded-full border border-[#d4af67]/10 opacity-60" />
      <div className="pointer-events-none absolute left-[19%] top-[13%] z-[1] hidden h-2 w-2 rounded-full border border-[#d4af67]/60 shadow-[0_0_18px_rgba(212,175,103,.45)] md:block" />

      {!mapReady && !mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--tw-scene-overlay)] text-sm text-[var(--tw-scene-muted)]">
          正在载入地图…
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--tw-scene-overlay)] px-6 text-center text-sm text-red-300">
          {mapError}
        </div>
      )}

      {/* 开始遮罩：点「开始」（或任意处）才进入入口节点，返回与问线索仍可用 */}
      {!started && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(3,6,14,.82)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl"
          role="dialog"
          aria-label="开始故事漫游"
          onClick={() => setStarted(true)}
        >
          <div
            className="relative mx-auto w-full max-w-md overflow-hidden rounded-lg border border-[#d4af67]/25 bg-[linear-gradient(145deg,rgba(15,20,34,.98),rgba(5,8,17,.98))] px-7 py-9 text-center text-[var(--tw-scene-ink)] shadow-[0_30px_100px_rgba(0,0,0,.65)] before:pointer-events-none before:absolute before:inset-3 before:rounded-md before:border before:border-white/[.04] sm:px-10 sm:py-11"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={sceneCorner}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 h-24 w-24 opacity-70"
            />
            {/* 开场封面里主标题是故事名，入口节点名退成副标题；没起名就退回节点名当标题 */}
            <p className="relative font-[var(--tw-font-editorial)] text-[22px] font-semibold leading-tight text-[var(--tw-scene-ink)]">
              {storyTitle || current.name}
            </p>
            <p className="mt-2 text-xs text-[var(--tw-scene-muted)]">
              {storyTitle ? `入口 · ${current.name}` : '入口'}
            </p>
            {pkg.description ? (
              <>
                <div className="my-5 h-px bg-white/10" />
                <p className="text-left text-sm leading-relaxed text-[var(--tw-scene-muted)]">
                  {pkg.description}
                </p>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="mt-6 min-h-11 w-full cursor-pointer rounded bg-[#f8f6f0] py-3 text-sm font-medium text-[#181f27] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af67]"
            >
              开始
            </button>
          </div>
        </div>
      )}

      {/* 结算画面：走到结局、口播讲完才压上来；点空白关掉，回到结局卡上的重新开始 / 自由漫游 */}
      {started && settled && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(3,6,14,.82)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl"
          role="dialog"
          aria-label="结局结算"
          onClick={() => setSettled(false)}
        >
          <div
            className="relative mx-auto w-full max-w-md overflow-hidden rounded-lg border border-[#d4af67]/25 bg-[linear-gradient(145deg,rgba(15,20,34,.98),rgba(5,8,17,.98))] px-7 py-9 text-center text-[var(--tw-scene-ink)] shadow-[0_30px_100px_rgba(0,0,0,.65)] before:pointer-events-none before:absolute before:inset-3 before:rounded-md before:border before:border-white/[.04] sm:px-10 sm:py-11"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={sceneCorner}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute right-0 top-0 h-24 w-24 -scale-x-100 opacity-70"
            />
            <img
              src={sealExploration}
              alt=""
              aria-hidden="true"
              className="pointer-events-none mx-auto mb-3 h-16 w-16 opacity-90"
            />
            <p className="text-xs text-[var(--tw-scene-muted)]">结局</p>
            <p className="mt-2 font-[var(--tw-font-editorial)] text-[22px] font-semibold leading-tight text-[var(--tw-scene-ink)]">
              {storyEndingLabel(pkg, current.id)}
            </p>
            {walkedTrace.length > 0 && (
              <>
                <div className="my-5 h-px bg-white/10" />
                <img
                  src={routeThread}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none mb-2 h-auto w-full opacity-65"
                />
                <p className="flex items-start justify-center gap-1.5 text-[11px] leading-relaxed text-[#6b7280]">
                  <Footprints size={12} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 text-left">已走：{walkedTrace.join(' → ')}</span>
                </p>
              </>
            )}
            <div className="mt-6 flex items-center gap-2">
              <button
                type="button"
                onClick={restart}
                className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded border border-transparent bg-[#f8f6f0] py-3 text-sm font-medium text-[#181f27] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af67]"
              >
                <RotateCcw size={14} />
                重新开始
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettled(false)
                  setFreeRoam(true)
                }}
                className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded border border-white/20 bg-white/5 py-3 text-sm text-[var(--tw-scene-ink)] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af67]"
              >
                <Compass size={14} />
                自由漫游
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-50 flex min-h-16 items-center justify-between gap-3 px-3 pt-[env(safe-area-inset-top)] sm:px-5">
        <div className="pointer-events-auto flex min-w-0 items-center gap-3 border-b border-[#d4af67]/25 bg-[rgba(5,8,17,.78)] px-1 pb-2 pt-2 backdrop-blur-xl">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center text-sm text-[var(--tw-scene-muted)] hover:text-[var(--tw-scene-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af67]"
            title="返回景点列表"
          >
            返回
          </Link>
          <span className="text-white/25">/</span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-medium">{pkg.name}</span>
            {storyTitle ? (
              <span className="block truncate text-[11px] text-[#9ca3af]">{storyTitle}</span>
            ) : null}
          </span>
          <span className="shrink-0 rounded-md bg-[var(--tw-scene-accent)] px-1.5 py-0.5 text-[10px] text-[#101820]">
            故事
          </span>
        </div>
        <div className="pointer-events-auto shrink-0">
          <AskAiPanel
            name={pkg.name}
            clue={{
              here: current?.name || '入口',
              detail: (slide?.bullets || []).filter(Boolean).join('；'),
              choices: available.map((c) => {
                const target = pkg.spots.find((s) => s.id === c.to)
                const label = storyChoiceLabel(pkg, c)
                return target
                  ? `${label}（约 ${Math.round(haversineMeters(current ?? pkg.start, target))} 米）`
                  : label
              }),
              visited: visited.length,
              total: pkg.spots.length,
            }}
          />
        </div>
      </header>

      {/* Desktop: right editorial column. Mobile: anchored bottom sheet above the choices. */}
      <section className="absolute inset-x-3 bottom-[calc(28dvh+env(safe-area-inset-bottom))] z-20 flex max-h-[32dvh] flex-col overflow-hidden rounded-md border border-[#d4af67]/20 bg-[rgba(7,11,22,.9)] shadow-[0_18px_56px_rgba(0,0,0,.45)] backdrop-blur-xl sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-[calc(4.75rem+env(safe-area-inset-top))] sm:max-h-[calc(100dvh-6rem-env(safe-area-inset-top))] sm:w-[min(42vw,460px)]">
        {cardOpen && (
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="relative grid overflow-hidden rounded-sm border border-white/[.06] bg-white/5">
              <img
                src={resolveMediaUrl(pkg, current.image)}
                alt={current.name}
                className="absolute inset-0 h-full w-full object-cover saturate-[.75]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              {/* 撑高用：占位格给 16:9 的下限，文案更多时由下面那格把卡片顶高，不再被 overflow 剪掉 */}
              <div className="aspect-presentation col-start-1 row-start-1" aria-hidden />
              <div className="relative col-start-1 row-start-1 self-end p-5">
                {current.poetic ? <p className="mb-1.5 text-xs text-white/70">{current.poetic}</p> : null}
                <h2 className="text-xl font-medium leading-snug text-white">
                  {slide?.title || current.name}
                </h2>
                {slide && slide.bullets.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-sm text-white/90">
                    {slide.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tw-scene-accent)]" />
                        <span className="leading-relaxed">{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {slide?.narration ? (
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--tw-scene-muted)]">{slide.narration}</p>
            ) : (
              <p className="mt-3 text-[13px] text-[var(--tw-scene-muted)]">这个节点还没有口播文案。</p>
            )}
          </div>
        )}

        <div
          className={`flex shrink-0 items-center justify-between px-3 py-2.5 ${
            cardOpen ? 'border-t border-black/5' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => setCardOpen((o) => !o)}
            title={cardOpen ? '收起当前情节' : '展开当前情节'}
            aria-expanded={cardOpen}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded px-2 text-xs text-[var(--tw-scene-muted)] hover:bg-white/5 hover:text-[var(--tw-scene-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af67]"
          >
            {cardOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <span>{moving ? '正在走过去…' : freeRoam ? '自由漫游中' : '当前情节'}</span>
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSpeakToken((t) => t + 1)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded bg-white/5 px-2.5 text-xs font-medium text-[var(--tw-scene-ink)] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af67]"
            >
              <Volume2 size={12} />
              重播
            </button>
            <button
              type="button"
              onClick={() => narrateCancelRef.current?.()}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded bg-white/5 px-2.5 text-xs font-medium text-[var(--tw-scene-muted)] hover:bg-white/10 hover:text-[var(--tw-scene-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af67]"
            >
              <Square size={12} />
              停止
            </button>
          </div>
        </div>
      </section>

      {/* 左下角 · 去向选项：故事页唯一的前进入口 */}
      <section className="absolute inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-30 space-y-2 sm:inset-x-auto sm:left-5 sm:w-[min(38vw,360px)]">
        {isEnding ? (
          <div className="rounded-md border border-white/10 bg-[var(--tw-scene-overlay)] p-3.5 shadow-lg backdrop-blur-md">
            <p className="text-[11px] text-[#9ca3af]">结局</p>
            <p className="mt-0.5 text-base font-medium">{storyEndingLabel(pkg, current.id)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={restart}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded bg-[#f8f6f0] px-3 text-sm font-medium text-[#181f27] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af67]"
              >
                <RotateCcw size={14} />
                重新开始
              </button>
              {!freeRoam && (
                <button
                  type="button"
                  onClick={() => setFreeRoam(true)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded border border-white/20 bg-white/5 px-3 text-sm text-[var(--tw-scene-ink)] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af67]"
                >
                  <Compass size={14} />
                  自由漫游
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="border border-[#d4af67]/20 bg-[rgba(7,11,22,.92)] p-4 shadow-[0_20px_55px_rgba(0,0,0,.45)] backdrop-blur-xl [clip-path:polygon(0_0,calc(100%-12px)_0,100%_12px,100%_100%,0_100%)]">
            <p className="mb-2 px-0.5 text-[10px] font-medium uppercase tracking-[.28em] text-[#d4af67]">Choose a direction</p>
            <div className="divide-y divide-[#d4af67]/15">
              {available.map((choice) => (
                <button
                  key={choice.to}
                  type="button"
                  onClick={() => goTo(choice.to)}
                  disabled={moving}
                  className="group flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 rounded px-1 py-3 text-left transition-colors hover:bg-white/5 hover:text-[#d4af67] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#d4af67] disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-[var(--tw-font-editorial)] text-sm tracking-wide">{storyChoiceLabel(pkg, choice)}</span>
                    {choice.note ? (
                      <span className="mt-0.5 block truncate text-[11px] text-[var(--tw-scene-muted)]">
                        {choice.note}
                      </span>
                    ) : null}
                  </span>
                  <img
                    src={brassArrow}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none h-6 w-10 shrink-0 transition-transform motion-safe:group-hover:translate-x-1"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {walkedTrace.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-md bg-[var(--tw-scene-overlay)] px-3 py-1.5 text-[11px] leading-relaxed text-[var(--tw-scene-muted)] shadow-sm backdrop-blur-md">
            <Footprints size={12} className="mt-0.5 shrink-0" />
            <span className="min-w-0">已走：{walkedTrace.join(' → ')}</span>
          </p>
        )}

        {freeRoam && (
          <p className="rounded-md bg-[var(--tw-scene-overlay)] px-3 py-1.5 text-[11px] text-[var(--tw-scene-muted)] shadow-sm backdrop-blur-md">
            点击地图移动 · 自由漫游不受路线限制
          </p>
        )}
      </section>
    </div>
  )
}
