import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ImagePlus,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { PublishSpotMap, type PublishMapApi } from '../components/PublishSpotMap'
import { CityRegionSelect } from '../components/CityRegionSelect'
import { generateDraftSpots } from '../lib/aiDraft'
import { locateAttractionOnMap, resolveAttractionScope } from '../lib/amapLocate'
import { newSpotAt, publishDraft, saveDraft, ensureEditableDraft } from '../lib/draftStore'
import type { DraftAttraction, Spot } from '../types/attraction'
import type { LngLat } from '../lib/tourPackage'
import { createTemplateStory } from '../experience/builderDraft'

const StoryEditor = lazy(() => import('../experience/components/StoryEditor').then(module => ({ default: module.StoryEditor })))

type EditorStage = 1 | 2 | 'story'

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

export function PublishEditorPage() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<DraftAttraction | null>(null)
  const [stage, setStage] = useState<EditorStage>(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mapError, setMapError] = useState('')
  const [toast, setToast] = useState('')
  const [mapCenter, setMapCenter] = useState<LngLat | null>(null)
  const [resolving, setResolving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const mapApiRef = useRef<PublishMapApi | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const item = await ensureEditableDraft(id)
      if (cancelled) return
      if (!item) {
        navigate('/publish', { replace: true })
        return
      }
      setDraft(item)
      setSelectedId(item.spots[0]?.id ?? null)
      setMapCenter(item.start)
      setStage(searchParams.get('tab') === 'story' && item.experience ? 'story' : item.spots.length > 0 || item.status === 'published' ? 2 : 1)
    })()
    return () => {
      cancelled = true
    }
  }, [id, navigate, searchParams])

  const selected = useMemo(
    () => draft?.spots.find((s) => s.id === selectedId) || null,
    [draft, selectedId],
  )

  const persist = (next: DraftAttraction) => {
    const saved = saveDraft(next)
    setDraft(saved)
    return saved
  }

  const updateDraft = (patch: Partial<DraftAttraction>) => {
    if (!draft) return
    persist({ ...draft, ...patch })
  }

  const updateSpot = (spotId: string, patch: Partial<Spot>) => {
    if (!draft) return
    persist({
      ...draft,
      spots: draft.spots.map((s) => (s.id === spotId ? { ...s, ...patch } : s)),
    })
  }

  const updateSelectedSlide = (field: 'title' | 'bullets' | 'narration', value: string) => {
    if (!draft || !selected) return
    const slides = [...selected.slides]
    const slide = { ...slides[0] }
    if (field === 'bullets') {
      slide.bullets = value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    } else {
      slide[field] = value
    }
    slides[0] = slide
    updateSpot(selected.id, { slides, name: field === 'title' ? value || selected.name : selected.name })
  }

  const moveSpot = (index: number, dir: -1 | 1) => {
    if (!draft) return
    const nextIndex = index + dir
    if (nextIndex < 0 || nextIndex >= draft.spots.length) return
    const spots = [...draft.spots]
    const tmp = spots[index]
    spots[index] = spots[nextIndex]
    spots[nextIndex] = tmp
    persist({ ...draft, spots })
  }

  /** 阶段一：高德确定旅游范围 */
  const onResolveScope = async () => {
    if (!draft || resolving) return
    if (!draft.name.trim()) {
      setToast('请先填写景点名称')
      return
    }
    setResolving(true)
    setToast('正在用高德检索景区范围…')
    try {
      const scope = await resolveAttractionScope(draft)
      const saved = persist({
        ...draft,
        start: scope.start,
        zoom: scope.zoom,
        city: scope.city || draft.city,
        amapContext: scope.amapContext,
      })
      setMapCenter(scope.start)
      setToast(
        `已定位「${scope.areaPoi.name}」${
          scope.nearbyPois.length > 0 ? `，并发现 ${scope.nearbyPois.length} 个相关地点` : ''
        }`,
      )
      return saved
    } catch (e) {
      setToast(e instanceof Error ? e.message : '范围检索失败')
      return null
    } finally {
      setResolving(false)
    }
  }

  const goStage2 = async () => {
    if (!draft || resolving) return
    if (!draft.name.trim()) {
      setToast('请先填写景点名称')
      return
    }
    // 尚未检索范围时自动检索一次
    if (!draft.amapContext?.trim() && draft.spots.length === 0) {
      const saved = await onResolveScope()
      if (!saved) return
    }
    setStage(2)
    window.setTimeout(() => {
      const d = getDraftSnapshot()
      if (d) {
        mapApiRef.current?.setCenter(d.start)
        mapApiRef.current?.setZoom(d.zoom)
      }
    }, 200)
  }

  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  const getDraftSnapshot = () => draftRef.current

  /** 阶段二：高德地点 + AI 内容一次完成，再回写地图坐标 */
  const onGenerateAndLocate = async () => {
    if (!draft || generating || resolving) return
    if (!draft.name.trim()) {
      setToast('请先填写景点名称')
      return
    }

    setGenerating(true)
    try {
      let working = draft
      if (!working.amapContext?.trim()) {
        setToast('先检索高德地点，再生成导览…')
        setResolving(true)
        try {
          const scope = await resolveAttractionScope(working)
          working = persist({
            ...working,
            start: scope.start,
            zoom: scope.zoom,
            city: scope.city || working.city,
            amapContext: scope.amapContext,
          })
          setMapCenter(scope.start)
        } finally {
          setResolving(false)
        }
      }

      setToast('AI 正在结合高德地点生成导览内容…')
      const generated = await generateDraftSpots(working)
      const { spots } = generated
      working = persist({
        ...working,
        spots,
        coverImage: spots[0]?.image || working.coverImage,
      })
      setSelectedId(spots[0]?.id ?? null)

      setToast('正在把节点定位到高德地图…')
      const located = await locateAttractionOnMap(working)
      const saved = persist({
        ...working,
        spots: located.spots,
        start: located.start,
        zoom: located.zoom,
      })
      setMapCenter(located.start)
      setSelectedId(saved.spots[0]?.id ?? null)
      window.setTimeout(() => {
        mapApiRef.current?.setCenter(located.start)
        mapApiRef.current?.setZoom(located.zoom)
      }, 200)
      setToast(
        generated.mode === 'template'
          ? `本地占位模板生成 ${saved.spots.length} 站（未调用模型）；名称、坐标与讲解需人工核验`
          : located.locatedCount > 0
          ? `已生成 ${saved.spots.length} 站，并定位 ${located.locatedCount} 个节点；可改文案、传图、拖标记`
          : `已生成 ${saved.spots.length} 站；坐标需在地图上拖动校准`,
      )
    } catch (e) {
      setToast(e instanceof Error ? e.message : '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const onAddSpot = () => {
    if (!draft) return
    const spot = newSpotAt(draft.start, draft.spots.length)
    const spots = [...draft.spots, spot]
    persist({ ...draft, spots })
    setSelectedId(spot.id)
  }

  const onUploadImage = async (file: File | null) => {
    if (!draft || !selected || !file) return
    if (!file.type.startsWith('image/')) {
      setToast('请选择图片文件')
      return
    }
    try {
      const dataUrl = await readImageFile(file)
      const patch: Partial<Spot> = {
        image: dataUrl,
        imageCredit: file.name,
      }
      const nextSpots = draft.spots.map((s) => (s.id === selected.id ? { ...s, ...patch } : s))
      persist({
        ...draft,
        spots: nextSpots,
        coverImage: draft.coverImage === selected.image || !draft.coverImage ? dataUrl : draft.coverImage,
      })
      setToast('图片已上传')
    } catch {
      setToast('图片读取失败')
    }
  }

  const onPublish = async () => {
    if (!draft) return
    if (!draft.name.trim()) {
      setToast('请先填写景点名称')
      return
    }
    if (draft.spots.length === 0) {
      setToast('请先生成或添加导览节点')
      return
    }
    try {
      setToast('正在打包图片…')
      const result = await publishDraft(draft.id, { zoom: draft.zoom, start: draft.start })
      if (result) {
        setDraft(result.draft)
        const n = Object.keys(result.pkg.assets || {}).length
        if (result.mode === 'config') {
          setToast(`已发布（${n} 张图），前台可立即查看`)
        } else {
          setToast(`写入 public/data 失败，已改为下载文件（含 ${n} 张图）`)
        }
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : '导出失败')
    }
  }

  const useMapCenterAsStart = () => {
    const center = mapApiRef.current?.getCenter()
    if (!center || !draft) {
      setToast('地图尚未就绪')
      return
    }
    updateDraft({ start: center })
    setToast('已将地图中心设为游客起点')
  }

  const useFirstSpotAsStart = () => {
    if (!draft?.spots[0]) return
    const first = draft.spots[0]
    updateDraft({ start: { lng: first.lng, lat: first.lat } })
    setMapCenter({ lng: first.lng, lat: first.lat })
    setToast('游客起点已对齐第一站')
  }

  if (!draft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f8fa] text-sm text-[#6b7280]">
        加载中…
      </div>
    )
  }

  const busy = resolving || generating
  const stageNumber = stage === 'story' ? 3 : stage
  const canPublish = draft.spots.length > 0 && (!draft.experience || draft.storyReview?.status === 'approved')
  const startStory = () => {
    try { persist(createTemplateStory(draft)); setStage('story'); setToast('本地模板故事已起稿（未调用模型），请编辑并审核。') }
    catch (error) { setToast(error instanceof Error ? error.message : '故事起稿失败') }
  }
  const stepClass = (active: boolean) => `min-h-11 rounded-md px-3 text-sm disabled:opacity-40 ${active ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6b7280]'}`
  const readiness = !draft.spots.length ? '还需：生成至少一个地点' : !draft.experience ? '可发布原版导览；至少三个地点可起稿故事' : !canPublish ? '还需：确认人工审核' : '已可发布'

  return (
    <div className="h-screen flex flex-col bg-[#f7f8fa] text-[#111827]">
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-2 bg-white border-b border-black/5">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/publish" className="inline-flex items-center gap-1 text-sm text-[#6b7280] hover:text-[#111827]">
            <ArrowLeft size={16} />
            返回
          </Link>
          <input
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value, amapContext: '' })}
            placeholder="景点名称"
            className="min-w-0 flex-1 max-w-xs bg-transparent text-[15px] font-medium outline-none placeholder:text-[#c4c4c4]"
          />
          <span
            className={`hidden sm:inline text-[11px] px-1.5 py-0.5 rounded-md ${
              draft.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {draft.status === 'published' ? '已发布' : '草稿'}
          </span>
        </div>

        <nav className="order-3 w-full overflow-x-auto border-t border-black/5 px-4 py-2 md:order-none md:w-auto md:border-0 md:px-0" aria-label="发布工作流"><ol className="flex min-w-max items-center gap-1 rounded-lg bg-[#f3f4f6] p-0.5">
          <li><button onClick={() => setStage(1)} aria-current={stage === 1 ? 'step' : undefined} className={stepClass(stage === 1)}>1.确定范围</button></li>
          <li><button onClick={() => void goStage2()} aria-current={stage === 2 ? 'step' : undefined} className={stepClass(stage === 2)}>2.地点与内容</button></li>
          <li><button onClick={() => setStage('story')} disabled={!draft.experience} aria-current={stage === 'story' ? 'step' : undefined} className={stepClass(stage === 'story')}>3.故事编排</button></li>
        </ol></nav>

        <div className="flex items-center gap-2 shrink-0">
          {stage !== 1 && <button type="button" onClick={() => setStage(stage === 'story' ? 2 : 1)} className="min-h-11 rounded-lg border border-black/10 bg-white px-3 text-sm hover:bg-[#f3f4f6]">上一步</button>}
          {stage === 1 && <button type="button" onClick={() => void goStage2()} disabled={busy} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-[#3b82f6] px-3.5 text-sm text-white hover:bg-[#2563eb] disabled:opacity-50">继续：地点与内容<ArrowRight size={14} /></button>}
          {stage === 2 && <button type="button" onClick={() => draft.experience ? setStage('story') : draft.spots.length >= 3 ? startStory() : void onGenerateAndLocate()} disabled={busy} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-[#3b82f6] px-3.5 text-sm text-white hover:bg-[#2563eb] disabled:opacity-50">{draft.experience ? '继续：故事编排' : draft.spots.length >= 3 ? '从当前地点起稿故事' : generating ? '生成中…' : '生成地点与内容'}<ArrowRight size={14} /></button>}
          {stage === 2 && !draft.experience && <button onClick={onPublish} disabled={busy || !canPublish} className="min-h-11 rounded-lg border border-black/10 bg-white px-3 text-sm disabled:opacity-50">发布原版导览</button>}
          {stage === 'story' && <button type="button" onClick={onPublish} disabled={busy || !canPublish} aria-describedby="publish-readiness" className="min-h-11 rounded-lg bg-[#3b82f6] px-3.5 text-sm text-white hover:bg-[#2563eb] disabled:opacity-50">发布体验</button>}
        </div>
      </header>

      <div id="publish-readiness" className="shrink-0 border-b border-black/5 bg-white px-4 py-2 text-xs text-[#4b5563]" role="status"><span className="font-medium">第 {stageNumber} 步</span> · {readiness}</div>

      {stage === 1 ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-xl mx-auto p-6 sm:p-10 space-y-6">
            <div>
              <h2 className="text-xl font-medium tracking-tight">确定旅游范围</h2>
              <p className="mt-1.5 text-sm text-[#6b7280] leading-relaxed">
                先写清景点与城市，再用高德确认景区位置与周边地点；下一步会把这些地点交给 AI 生成导览。
              </p>
            </div>

            <label className="block">
              <span className="text-xs text-[#9ca3af]">景点名称</span>
              <input
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value, amapContext: '' })}
                placeholder="如：豫园、长白山北坡"
                className="mt-1 w-full rounded-lg border border-black/8 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3b82f6]/50"
              />
            </label>

            <label className="block">
              <span className="text-xs text-[#9ca3af]">城市 / 区域</span>
              <div className="mt-1">
                <CityRegionSelect
                  value={draft.city || ''}
                  onChange={(city) => updateDraft({ city, amapContext: '' })}
                  disabled={busy}
                />
              </div>
              <p className="mt-1 text-[11px] text-[#9ca3af]">数据来自高德行政区查询（DistrictSearch）</p>
            </label>

            <label className="block">
              <span className="text-xs text-[#9ca3af]">简介</span>
              <textarea
                value={draft.description}
                onChange={(e) => updateDraft({ description: e.target.value })}
                rows={4}
                placeholder="简述景区特色、游览重点，供 AI 写讲解稿"
                className="mt-1 w-full resize-none rounded-lg border border-black/8 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3b82f6]/50"
              />
            </label>

            <div className="rounded-xl border border-black/8 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">高德范围</p>
                  <p className="text-xs text-[#9ca3af] mt-0.5">
                    {draft.amapContext
                      ? `起点 ${draft.start.lng.toFixed(5)}, ${draft.start.lat.toFixed(5)}`
                      : '尚未检索'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onResolveScope()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#111827] text-white px-3 py-1.5 text-sm hover:bg-black disabled:opacity-50"
                >
                  <MapPin size={14} />
                  {resolving ? '检索中…' : draft.amapContext ? '重新检索' : '检索景区'}
                </button>
              </div>
              {draft.amapContext ? (
                <pre className="max-h-48 overflow-y-auto rounded-lg bg-[#f9fafb] px-3 py-2 text-[11px] leading-relaxed text-[#4b5563] whitespace-pre-wrap font-sans">
                  {draft.amapContext}
                </pre>
              ) : (
                <p className="text-sm text-[#9ca3af]">填写名称后点「检索景区」，确认旅游范围再进入下一步。</p>
              )}
            </div>
          </div>
        </div>
      ) : stage === 'story' && draft.experience ? <Suspense fallback={<div className="flex-1 p-8 text-sm text-gray-500">正在打开故事编排器…</div>}><StoryEditor draft={{ ...draft, experience: draft.experience }} onChange={experience => updateDraft({ experience })} onReview={storyReview => updateDraft({ storyReview })} onPresentationChange={presentation => updateDraft({ presentation })} /></Suspense> : (
        <div className="flex-1 min-h-0 flex">
          <aside className="w-[min(100%,380px)] shrink-0 border-r border-black/5 bg-white flex flex-col min-h-0">
            <div className="p-4 space-y-3 border-b border-black/5 shrink-0">
              <p className="text-xs text-[#9ca3af]">阶段二 · 高德地点 + AI 导览内容</p>
              <p className="text-sm text-[#6b7280] leading-relaxed">
                一次生成讲解并落到地图；左侧改文案/传图，右侧拖标记校准。
              </p>
              <button
                type="button"
                onClick={() => void onGenerateAndLocate()}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#111827] text-white px-3 py-2 text-sm hover:bg-black disabled:opacity-50"
              >
                <Sparkles size={15} />
                {generating ? '生成中…' : draft.spots.length ? '重新生成并定位' : 'AI 生成并定位'}
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={useMapCenterAsStart}
                  className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs hover:bg-[#f9fafb]"
                >
                  地图中心 → 起点
                </button>
                <button
                  type="button"
                  onClick={useFirstSpotAsStart}
                  className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs hover:bg-[#f9fafb]"
                >
                  第一站 → 起点
                </button>
                <button
                  type="button"
                  onClick={onAddSpot}
                  className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs hover:bg-[#f9fafb]"
                >
                  <Plus size={12} />
                  手动加点
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {draft.spots.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-[#9ca3af]">
                  点上方「AI 生成并定位」，会把高德地点喂给 AI
                </p>
              ) : (
                <div className="px-3 py-2 space-y-1">
                  {draft.spots.map((spot, index) => {
                    const active = spot.id === selectedId
                    return (
                      <div
                        key={spot.id}
                        className={`flex items-center gap-1 rounded-lg px-2 py-2 ${
                          active ? 'bg-[#eff6ff]' : 'hover:bg-[#f9fafb]'
                        }`}
                      >
                        <button
                          type="button"
                          className="flex-1 flex items-center gap-2 text-left min-w-0"
                          onClick={() => {
                            setSelectedId(spot.id)
                            setMapCenter({ lng: spot.lng, lat: spot.lat })
                          }}
                        >
                          <span className="w-5 h-5 rounded-full bg-[#111827] text-white text-[11px] flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{spot.name}</span>
                            <span className="block text-[11px] text-[#9ca3af] tabular-nums">
                              {spot.lng.toFixed(4)}, {spot.lat.toFixed(4)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={index === 0}
                          className="p-1 rounded text-[#9ca3af] hover:text-[#111827] disabled:opacity-25"
                          onClick={() => moveSpot(index, -1)}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={index === draft.spots.length - 1}
                          className="p-1 rounded text-[#9ca3af] hover:text-[#111827] disabled:opacity-25"
                          onClick={() => moveSpot(index, 1)}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="p-1 rounded text-[#9ca3af] hover:text-red-600"
                          onClick={() => {
                            const spots = draft.spots.filter((s) => s.id !== spot.id)
                            persist({ ...draft, spots })
                            if (selectedId === spot.id) setSelectedId(spots[0]?.id ?? null)
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {selected && (
                <div className="border-t border-black/5 p-4 space-y-3">
                  <p className="text-xs font-medium text-[#6b7280]">节点内容</p>
                  <label className="block">
                    <span className="text-xs text-[#9ca3af]">名称</span>
                    <input
                      value={selected.name}
                      onChange={(e) => updateSpot(selected.id, { name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-black/8 bg-[#f9fafb] px-2.5 py-1.5 text-sm outline-none focus:bg-white focus:border-[#3b82f6]/50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-[#9ca3af]">诗意副标题</span>
                    <input
                      value={selected.poetic}
                      onChange={(e) => updateSpot(selected.id, { poetic: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-black/8 bg-[#f9fafb] px-2.5 py-1.5 text-sm outline-none focus:bg-white focus:border-[#3b82f6]/50"
                    />
                  </label>
                  <div>
                    <span className="text-xs text-[#9ca3af]">实景图</span>
                    <div className="mt-1 rounded-lg border border-black/8 overflow-hidden bg-[#f3f4f6]">
                      <div className="aspect-[16/10]">
                        {selected.image ? (
                          <img src={selected.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-[#9ca3af]">
                            未上传
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end px-2 py-2 border-t border-black/5 bg-white">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 text-xs text-[#3b82f6]"
                        >
                          <ImagePlus size={13} />
                          上传
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void onUploadImage(e.target.files?.[0] || null)
                            e.target.value = ''
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-xs text-[#9ca3af]">讲解标题</span>
                    <input
                      value={selected.slides[0]?.title || ''}
                      onChange={(e) => updateSelectedSlide('title', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/8 bg-[#f9fafb] px-2.5 py-1.5 text-sm outline-none focus:bg-white focus:border-[#3b82f6]/50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-[#9ca3af]">要点（每行一条）</span>
                    <textarea
                      value={(selected.slides[0]?.bullets || []).join('\n')}
                      onChange={(e) => updateSelectedSlide('bullets', e.target.value)}
                      rows={3}
                      className="mt-1 w-full resize-none rounded-lg border border-black/8 bg-[#f9fafb] px-2.5 py-1.5 text-sm outline-none focus:bg-white focus:border-[#3b82f6]/50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-[#9ca3af]">口播文案</span>
                    <textarea
                      value={selected.slides[0]?.narration || ''}
                      onChange={(e) => updateSelectedSlide('narration', e.target.value)}
                      rows={4}
                      className="mt-1 w-full resize-none rounded-lg border border-black/8 bg-[#f9fafb] px-2.5 py-1.5 text-sm outline-none focus:bg-white focus:border-[#3b82f6]/50"
                    />
                  </label>
                </div>
              )}
            </div>
          </aside>

          <section className="relative flex-1 min-w-0">
            <PublishSpotMap
              center={mapCenter || draft.start}
              zoom={draft.zoom}
              spots={draft.spots}
              selectedId={selectedId}
              start={draft.start}
              onSelect={setSelectedId}
              onMove={(spotId, pos) => updateSpot(spotId, pos)}
              onStartMove={(pos) => updateDraft({ start: pos })}
              onZoomChange={(z) => updateDraft({ zoom: Number(z.toFixed(2)) })}
              onReady={(api) => {
                mapApiRef.current = api
              }}
              onError={setMapError}
            />
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-red-600">
                {mapError}
              </div>
            )}
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-[#6b7280] bg-white/90 px-3 py-1.5 rounded-full border border-black/5 shadow-sm">
              拖标记校准 · 绿色「起」为游客起点
            </p>
          </section>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-[#111827] text-white text-sm px-4 py-2 shadow-lg max-w-[90vw]">
          {toast}
          <button type="button" className="ml-3 text-white/60" onClick={() => setToast('')}>
            关闭
          </button>
        </div>
      )}
    </div>
  )
}
