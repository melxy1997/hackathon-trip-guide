import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAgentDraft, type AgentDraftProvenance } from '../agent/draft'
import { assertAgentCandidate, assertCreativeBrief, assertStoryConcept } from '../agent/validators'
import type { AgentAudience, AgentCandidate, BasePackageIdentity, CreativeBrief, StoryConcept } from '../agent/contracts'
import { resolvePresentation } from '../presentation'
import { loadPublishedAttraction } from '../../lib/catalog'
import { saveDraft } from '../../lib/draftStore'
import { requestModel } from '../../lib/modelApi'
import type { CatalogItem, PublishedAttraction } from '../../lib/tourPackage'

type ConceptResponse = { concepts: StoryConcept[]; requestId: string; basePackage: BasePackageIdentity }
type CompileResponse = { candidate: AgentCandidate; requestId: string; artifact: { id: string; version: number; hash: string } }
type Compiled = { candidate: AgentCandidate; pkg: PublishedAttraction; provenance: AgentDraftProvenance }
const themeFor = (item?: CatalogItem) => resolvePresentation(item?.presentation).preset === 'cosmos' ? '解码一段来自未来的深空讯号' : '寻找一封被园林保存至今的回信'
const styleFor = (item?: CatalogItem): CreativeBrief['style'] => resolvePresentation(item?.presentation).preset

export function CreativeStudio({ catalog }: { catalog: CatalogItem[] }) {
  const navigate = useNavigate()
  const initial = catalog[0]
  const [attractionId, setAttractionId] = useState('')
  const selectedId = attractionId || initial?.id || ''
  const selected = catalog.find(item => item.id === selectedId)
  const style = styleFor(selected)
  const [theme, setTheme] = useState(themeFor(initial))
  const [audience, setAudience] = useState<AgentAudience>('general')
  const [targetMinutes, setTargetMinutes] = useState(5)
  const [concepts, setConcepts] = useState<StoryConcept[]>([])
  const [basePackage, setBasePackage] = useState<BasePackageIdentity | null>(null)
  const [selection, setSelection] = useState('')
  const [compiled, setCompiled] = useState<Compiled | null>(null)
  const [busy, setBusy] = useState<'concepts' | 'compile' | ''>('')
  const [error, setError] = useState('')
  const themeTouched = useRef(false)
  const active = useRef<{ token: number; controller?: AbortController }>({ token: 0 })
  useEffect(() => () => { active.current.token++; active.current.controller?.abort() }, [])
  useEffect(() => {
    if (!themeTouched.current) setTheme(themeFor(selected))
  }, [selected])
  const brief = useMemo(() => ({ attractionId: selectedId, theme, audience, targetMinutes, style }), [selectedId, theme, audience, targetMinutes, style])
  const run = async <T,>(stage: 'concepts' | 'compile', work: (signal: AbortSignal) => Promise<T>, accept: (result: T) => void) => {
    if (busy) return
    active.current.controller?.abort()
    const token = ++active.current.token
    const controller = new AbortController()
    active.current.controller = controller
    setBusy(stage); setError('')
    try {
      const result = await work(controller.signal)
      if (token === active.current.token && !controller.signal.aborted) accept(result)
    } catch (e) {
      if (token === active.current.token && !controller.signal.aborted) setError(e instanceof Error ? e.message : '生成失败，请重试。')
    } finally { if (token === active.current.token) setBusy('') }
  }
  const generateConcepts = () => run('concepts', async signal => {
    const validBrief = assertCreativeBrief(brief)
    const response = await requestModel<ConceptResponse>('/api/agent/concepts', validBrief, signal)
    if (!Array.isArray(response.concepts) || response.concepts.length !== 2) throw new Error('构想服务必须返回恰好两个故事构想。')
    response.concepts.forEach(assertStoryConcept)
    return response
  }, response => { setConcepts(response.concepts); setBasePackage(response.basePackage); setSelection('') })
  const compile = () => {
    const selectedConcept = concepts.find(item => item.id === selection)
    if (!selectedConcept || !basePackage) return
    run('compile', async signal => {
      const validBrief = assertCreativeBrief(brief)
      const [response, pkg] = await Promise.all([
        requestModel<CompileResponse>('/api/agent/compile', { brief: validBrief, basePackage, selectedConcept }, signal),
        loadPublishedAttraction(validBrief.attractionId),
      ])
      assertAgentCandidate(response.candidate, pkg)
      return { candidate: response.candidate, pkg, provenance: { requestId: response.requestId, artifactId: response.artifact.id, artifactVersion: response.artifact.version, artifactHash: response.artifact.hash } }
    }, setCompiled)
  }
  const cancel = () => { active.current.token++; active.current.controller?.abort(); setBusy(''); setError('已取消当前请求；创作简报、构想、选择和上一份候选稿均已保留。') }
  const adopt = () => {
    if (!compiled) return
    try {
      const draft = saveDraft(createAgentDraft(compiled.pkg, compiled.candidate, `attr-${crypto.randomUUID()}`, compiled.provenance))
      navigate(`/publish/${draft.id}?tab=story`)
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败；候选稿仍在此处。') }
  }
  const fillDemo = (preset: CreativeBrief['style']) => {
    const match = catalog.find(item => styleFor(item) === preset && item.experience) || catalog.find(item => styleFor(item) === preset)
    if (match) setAttractionId(match.id)
    themeTouched.current = true
    setTheme(preset === 'cosmos' ? '解码一段来自未来的深空讯号' : '寻找一封被园林保存至今的回信')
  }
  const field = 'mt-1 min-h-11 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm'
  return <section className="rounded-2xl border border-indigo-200 bg-white p-5 sm:p-7" aria-label="Creative Studio">
    <div><p className="text-xs tracking-widest text-indigo-700">CREATIVE STUDIO · 在线智能体</p><h2 className="mt-2 text-xl font-medium">从故事构想到可编辑体验</h2><p className="mt-2 text-sm text-gray-500">先生成两个构想，人工选择后再编译。采用前不会保存模型产物；结果仍需人工审核。</p></div>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="示例主题"><button type="button" className="min-h-11 rounded-lg border px-3 text-sm" disabled={!!busy} onClick={() => fillDemo('heritage')}>填入园林家书示例</button><button type="button" className="min-h-11 rounded-lg border px-3 text-sm" disabled={!!busy} onClick={() => fillDemo('cosmos')}>填入深空讯号示例</button></div>
    <fieldset disabled={!!busy} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm">资料景点<select className={field} value={selectedId} onChange={e => { setAttractionId(e.target.value); themeTouched.current = false }}>{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm sm:col-span-2">故事主题<input className={field} maxLength={120} value={theme} onChange={e => { themeTouched.current = true; setTheme(e.target.value) }} /></label>
      <label className="text-sm">受众<select className={field} value={audience} onChange={e => setAudience(e.target.value as AgentAudience)}><option value="general">普通游客</option><option value="family">亲子同行</option></select></label>
      <label className="text-sm">目标时长（分钟）<input className={field} type="number" min={3} max={30} value={targetMinutes} onChange={e => setTargetMinutes(Number(e.target.value))} /></label>
      <p className="text-sm">呈现风格<span className={`${field} block text-gray-600`} aria-label="呈现风格">{style === 'cosmos' ? '深空讯号 · 来自所选包' : '文化遗产 · 来自所选包'}</span></p>
    </fieldset>
    <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled={!!busy || !selectedId} onClick={generateConcepts} className="min-h-11 rounded-lg bg-indigo-700 px-5 text-sm text-white disabled:opacity-40">{busy === 'concepts' ? '正在生成构想…' : '生成两个故事构想'}</button>{busy && <button type="button" className="min-h-11 px-2 text-sm underline" onClick={cancel}>取消当前请求</button>}<span className="text-xs text-gray-500">需要服务端在线模型配置；下方本地 Builder 可随时使用。</span></div>
    {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 break-words" role="alert">{error}</p>}
    {concepts.length === 2 && <fieldset className="mt-6 border-t pt-5" disabled={!!busy}><legend className="text-base font-medium">选择一个故事构想</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{concepts.map(concept => <label key={concept.id} className={`block min-h-11 cursor-pointer rounded-xl border p-4 ${selection === concept.id ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-black/10'}`}><span className="flex items-start gap-3"><input className="mt-1 size-4" type="radio" name="studio-concept" value={concept.id} checked={selection === concept.id} onChange={() => setSelection(concept.id)} /><span><strong>{concept.title}</strong><span className="mt-2 block text-sm text-gray-600"><b>故事前提：</b>{concept.premise}</span><span className="mt-2 block text-sm text-gray-600"><b>悬念：</b>{concept.suspense}</span><span className="mt-2 block text-sm text-gray-600"><b>地点作用：</b>{concept.locationRole}</span><span className="mt-2 block text-sm text-gray-600"><b>结局：</b>{concept.resolution}</span></span></span></label>)}</div><button type="button" className="mt-4 min-h-11 rounded-lg bg-[#17251d] px-5 text-sm text-white disabled:opacity-40" disabled={!selection || !!busy} onClick={compile}>{busy === 'compile' ? '正在编译故事…' : '编译所选构想'}</button></fieldset>}
    {compiled && <div className="mt-6 border-t pt-5" aria-label="已编译候选"><p className="text-xs text-indigo-700">智能体候选 · 尚未保存 · 待人工审核</p><h3 className="mt-2 text-lg">{compiled.candidate.experience.title}</h3><ol className="mt-4 space-y-3" aria-label="故事节拍时间线">{compiled.candidate.beatSheet.beats.map((beat, index) => { const spot = compiled.pkg.spots.find(item => item.id === beat.spotId)?.name || beat.spotId; return <li key={beat.id} className="rounded-lg bg-gray-50 p-3 text-sm"><strong>{index + 1}. {beat.title}</strong><span className="block text-gray-600">地点：{spot} · {beat.summary}</span>{beat.branches?.map(branch => { const rejoin = compiled.candidate.beatSheet.beats.find(item => item.id === branch.rejoinsAtBeatId)?.title || branch.rejoinsAtBeatId; return <span className="mt-1 block text-gray-600" key={branch.id}>选择「{branch.label}」：{branch.summary}（在 {compiled.pkg.spots.find(item => item.id === branch.spotId)?.name || branch.spotId}；汇合到：{rejoin}）</span> })}{beat.observationTask && <span className="mt-1 block text-gray-600">观察任务：{beat.observationTask}</span>}</li> })}</ol><button type="button" className="mt-4 min-h-11 rounded-lg bg-emerald-700 px-4 text-sm text-white disabled:opacity-40" onClick={adopt} disabled={!!busy}>采用并进入故事编辑器</button></div>}
  </section>
}
