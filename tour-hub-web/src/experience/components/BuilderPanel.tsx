import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assertBuilderCandidate, assertBuilderInput, buildTemplate, type BuilderInput, type BuilderResult } from '../builder'
import { createBuilderDraft } from '../builderDraft'
import { loadPublishedAttraction } from '../../lib/catalog'
import { saveDraft } from '../../lib/draftStore'
import { requestModel } from '../../lib/modelApi'
import type { CatalogItem, PublishedAttraction } from '../../lib/tourPackage'

export function BuilderPanel({ catalog }: { catalog: CatalogItem[] }) {
  const navigate = useNavigate()
  const [input, setInput] = useState<Omit<BuilderInput, 'attractionId'>>({ theme: '一封写给未来的信', audience: 'general', duration: 5, tone: 'poetic', mode: 'template' })
  const [attractionId, setAttractionId] = useState('')
  const selectedId = attractionId || catalog[0]?.id || ''
  const [candidate, setCandidate] = useState<{ result: BuilderResult; pkg: PublishedAttraction } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showContent, setShowContent] = useState(false)
  const request = useRef<{ id: number; controller?: AbortController }>({ id: 0 })
  useEffect(() => () => { request.current.id++; request.current.controller?.abort() }, [])
  const generate = async () => {
    request.current.controller?.abort()
    const current = ++request.current.id
    const controller = new AbortController()
    request.current.controller = controller
    setBusy(true); setError('')
    try {
      const brief = assertBuilderInput({ ...input, attractionId: selectedId })
      const pkg = await loadPublishedAttraction(brief.attractionId)
      if (controller.signal.aborted) return
      const result = brief.mode === 'template' ? buildTemplate(pkg, brief, crypto.randomUUID()) : await requestModel<BuilderResult>('/api/builder/draft', brief, controller.signal)
      assertBuilderCandidate(result.experience, pkg)
      if (current === request.current.id) setCandidate({ result, pkg })
    } catch (e) { if (current === request.current.id) setError(e instanceof Error ? e.message : '生成失败，请重试。') }
    finally { if (current === request.current.id) setBusy(false) }
  }
  const cancel = () => {
    request.current.id++; request.current.controller?.abort(); setBusy(false); setError('生成已取消，输入和上一份候选稿已保留。')
  }
  const adopt = () => {
    if (!candidate) return
    try {
      const draft = saveDraft(createBuilderDraft(candidate.pkg, candidate.result, `attr-${crypto.randomUUID()}`))
      navigate(`/publish/${draft.id}?tab=story`)
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败；候选稿仍在此处。') }
  }
  const field = 'mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm'
  return <section className="rounded-2xl border border-black/10 bg-white p-5 sm:p-7" aria-label="故事 Builder">
    <div className="mb-5"><p className="text-xs tracking-widest text-emerald-700">TRIP EXPERIENCE ENGINE · BUILDER</p><h2 className="text-xl font-medium mt-2">把一个景点，编排成你的故事</h2><p className="text-sm text-gray-500 mt-2">从已有地点起稿，保留双分支与观察任务；采用后进入独立草稿，编辑审核后再发布。</p></div>
    <fieldset disabled={busy} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <label className="text-sm">资料景点<select className={field} value={selectedId} onChange={e => setAttractionId(e.target.value)}>{catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="text-sm sm:col-span-2">故事主题<input className={field} maxLength={100} value={input.theme} onChange={e => setInput({ ...input, theme: e.target.value })} /></label>
      <label className="text-sm">受众<select className={field} value={input.audience} onChange={e => setInput({ ...input, audience: e.target.value as BuilderInput['audience'] })}><option value="general">普通游客</option><option value="family">亲子同行</option></select></label>
      <label className="text-sm">目标时长（分钟）<input className={field} type="number" min={3} max={30} value={input.duration} onChange={e => setInput({ ...input, duration: Number(e.target.value) })} /></label>
      <label className="text-sm">叙述语气<select className={field} value={input.tone} onChange={e => setInput({ ...input, tone: e.target.value as BuilderInput['tone'] })}><option value="poetic">诗意沉浸</option><option value="lively">轻松活泼</option></select></label>
      <label className="text-sm sm:col-span-2">起稿方式<select className={field} value={input.mode} onChange={e => setInput({ ...input, mode: e.target.value as BuilderInput['mode'] })}><option value="template">本地模板 · 无需模型配置</option><option value="online">在线模型 · 需要服务端配置</option></select></label>
    </fieldset>
    <div className="flex items-center gap-3 mt-5"><button disabled={busy || !selectedId} onClick={generate} className="rounded-lg bg-[#17251d] text-white px-5 py-2 text-sm disabled:opacity-40">{busy ? '正在起稿…' : '生成候选故事'}</button>{busy && <button className="text-sm underline" onClick={cancel}>取消生成</button>}<span className="text-xs text-gray-500">模板无需联网；在线失败时可手动切换模板。</span></div>
    {error && <p className="mt-4 rounded-lg bg-amber-50 text-amber-900 p-3 text-sm break-words" role="alert">{error}</p>}
    {candidate && <div className="mt-6 border-t border-black/10 pt-5" aria-label="候选故事">
      <p className="text-xs text-emerald-700">{candidate.result.mode === 'template' ? '本地模板候选 · 未调用模型' : '在线模型候选'} · 待人工审核</p>
      <h3 className="text-lg mt-2">{candidate.result.experience.title}</h3><p className="text-sm text-gray-600 mt-2">{candidate.pkg.name} · {candidate.result.experience.scenes.length} 幕 · 双分支 · 人工观察确认 · 目标 {candidate.result.experience.estimatedMinutes} 分钟</p>
      <ol className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 mt-4">{candidate.result.steps.map((step, i) => <li key={step}>{i + 1}. {step}</li>)}</ol>
      {candidate.result.diagnostics.map(d => <p className="text-xs text-gray-500 mt-2" key={d}>{d}</p>)}
      <div className="flex gap-4 mt-4"><button className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm" onClick={adopt} disabled={busy}>采用候选稿并编辑</button><button className="text-sm underline" onClick={() => setShowContent(!showContent)}>{showContent ? '收起候选内容' : '查看候选内容'}</button></div>
      {showContent && <div className="mt-5 space-y-4">{candidate.result.experience.scenes.map(s => <article key={s.id}><h4 className="text-sm font-medium">{s.title}</h4>{s.blocks.filter(b => b.text).map(b => <p className="text-sm text-gray-600 mt-1" key={b.id}>{b.text}</p>)}</article>)}</div>}
    </div>}
  </section>
}
