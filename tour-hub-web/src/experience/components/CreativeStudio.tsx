import { useEffect, useMemo, useRef, useState } from 'react'
import { CandidateMediaPanel } from './CandidateMediaPanel'
import { portableAgentCandidate } from '../agent/portable'
import { useNavigate } from 'react-router-dom'
import { createAgentDraft, type AgentDraftProvenance } from '../agent/draft'
import { assertAgentCandidate, assertCreativeBrief, assertStoryConcept } from '../agent/validators'
import type { AgentAudience, AgentCandidate, BasePackageIdentity, CreativeBrief, ResearchDossier, StoryConcept } from '../agent/contracts'
import { MAX_STUDIO_FILE_BYTES, STUDIO_SESSION_KEY, parseStudioSession, sameBrief, saveStudioSession, validateStudioSession, type StudioEvidence, type StudioSession } from '../agent/studioSession'
import { resolvePresentation } from '../presentation'
import { loadPublishedAttraction } from '../../lib/catalog'
import { saveDraft } from '../../lib/draftStore'
import { requestModel } from '../../lib/modelApi'
import type { CatalogItem, PublishedAttraction } from '../../lib/tourPackage'

type ConceptResponse = { concepts: StoryConcept[]; requestId: string; basePackage: BasePackageIdentity; researchId?: string }
type CompileResponse = { candidate: AgentCandidate; requestId: string; artifact: { id: string; version: number; hash: string }; model?: string; durationMs?: number; attempts?: number }
type Compiled = { candidate: AgentCandidate; pkg: PublishedAttraction; provenance: AgentDraftProvenance; evidence?: StudioEvidence }
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
  const [busy, setBusy] = useState<'research' | 'concepts' | 'compile' | 'import' | 'export' | 'media' | ''>('')
  const [conceptBrief, setConceptBrief] = useState<CreativeBrief>()
  const [research, setResearch] = useState<ResearchDossier | null>(null)
  const [conceptResearchId, setConceptResearchId] = useState<string>()
  const [notice, setNotice] = useState('')
  const [storageNote, setStorageNote] = useState('')
  const [ready, setReady] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const themeTouched = useRef(false)
  const active = useRef<{ token: number; controller?: AbortController }>({ token: 0 })
  useEffect(() => () => { active.current.token++; active.current.controller?.abort() }, [])
  useEffect(() => {
    if (!themeTouched.current) setTheme(themeFor(selected))
  }, [selected])
  const brief = useMemo(() => ({ attractionId: selectedId, theme: theme.trim(), audience, targetMinutes, style }), [selectedId, theme, audience, targetMinutes, style])
  const conceptCurrent = sameBrief(conceptBrief, brief)
  const researchCurrent = !!research && sameBrief(research.brief, brief)
  const applySession = (session: StudioSession, pkg?: PublishedAttraction) => {
    themeTouched.current = true
    setAttractionId(session.brief.attractionId); setTheme(session.brief.theme); setAudience(session.brief.audience); setTargetMinutes(session.brief.targetMinutes)
    setConcepts(session.concepts); setConceptBrief(session.conceptBrief); setBasePackage(session.basePackage ?? null); setSelection(session.selection)
    // Research IDs are process-local. Restored concepts can be compiled from existing material.
    setConceptResearchId(undefined); setResearch(null)
    setCompiled(session.compiled && pkg ? { ...session.compiled, pkg } : null)
  }
  useEffect(() => {
    let disposed = false
    const restore = async () => {
      try {
        const raw = localStorage.getItem(STUDIO_SESSION_KEY)
        if (raw) {
          const session = await validateStudioSession(parseStudioSession(raw), loadPublishedAttraction)
          const pkg = session.compiled ? await loadPublishedAttraction(session.compiled.candidate.brief.attractionId) : undefined
          if (!disposed) { applySession(session, pkg); setNotice('已恢复本机创作成果；没有重新调用模型。联网研究可按需重新获取。') }
        }
      } catch { if (!disposed) setNotice('本机创作记录无法恢复，可导入成果文件或重新开始。') }
      finally { if (!disposed) setReady(true) }
    }
    void restore()
    return () => { disposed = true }
    // Restore once, before autosaving. The current catalog is not needed to validate the saved package.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const snapshot = (): StudioSession => ({ schemaVersion: 1, savedAt: Date.now(), brief, concepts, selection,
    ...(conceptBrief ? { conceptBrief } : {}), ...(basePackage ? { basePackage } : {}),
    ...(conceptResearchId ? { researchId: conceptResearchId } : {}),
    ...(compiled ? { compiled: { candidate: compiled.candidate, provenance: compiled.provenance, ...(compiled.evidence ? { evidence: compiled.evidence } : {}) } } : {}) })
  useEffect(() => {
    if (!ready || !selectedId) return
    const timer = setTimeout(() => {
      try {
        const current = snapshot()
        assertCreativeBrief(current.brief)
        const saved = saveStudioSession(current, localStorage)
        setStorageNote(saved ? '创作进度已保存在本机' : '本机空间不足或成果较大，请导出创作成果以免刷新丢失。')
      } catch { setStorageNote('本机保存不可用，请导出创作成果。') }
    }, 200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, brief, concepts, conceptBrief, basePackage, selection, conceptResearchId, compiled])
  const run = async <T,>(stage: 'research' | 'concepts' | 'compile' | 'import' | 'export' | 'media', work: (signal: AbortSignal) => Promise<T>, accept: (result: T) => void) => {
    if (busy || !ready) return
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
  const researchNow = () => run('research', signal => requestModel<{ dossier: ResearchDossier }>('/api/agent/research', assertCreativeBrief(brief), signal), response => {
    setResearch(response.dossier); setNotice('研究完成，可查看灵感资料后生成构想。')
  })
  const generateConcepts = () => run('concepts', async signal => {
    const validBrief = assertCreativeBrief(brief)
    const response = await requestModel<ConceptResponse>('/api/agent/concepts', { ...validBrief, ...(researchCurrent ? { researchId: research!.id } : {}) }, signal)
    if (!Array.isArray(response.concepts) || response.concepts.length !== 2) throw new Error('构想服务必须返回恰好两个故事构想。')
    response.concepts.forEach(assertStoryConcept)
    return response
  }, response => { setConcepts(response.concepts); setBasePackage(response.basePackage); setConceptBrief({ ...brief }); setConceptResearchId(response.researchId); setSelection('') })
  const compile = () => {
    const selectedConcept = concepts.find(item => item.id === selection)
    if (!selectedConcept || !basePackage || !conceptCurrent) return
    run('compile', async signal => {
      const validBrief = assertCreativeBrief(brief)
      const [response, pkg] = await Promise.all([
        requestModel<CompileResponse>('/api/agent/compile', { brief: validBrief, basePackage, selectedConcept, ...(conceptResearchId ? { researchId: conceptResearchId } : {}) }, signal),
        loadPublishedAttraction(validBrief.attractionId),
      ])
      assertAgentCandidate(response.candidate, pkg)
      if (!sameBrief(response.candidate.brief, validBrief) || response.candidate.selectedConcept.id !== selectedConcept.id) throw new Error('候选与当前简报或选择不一致，请重新编译。')
      return { candidate: response.candidate, pkg, provenance: { requestId: response.requestId, artifactId: response.artifact.id, artifactVersion: response.artifact.version, artifactHash: response.artifact.hash }, evidence: { requestId: response.requestId, ...(response.model ? { model: response.model } : {}), ...(response.durationMs !== undefined ? { durationMs: response.durationMs } : {}), ...(response.attempts !== undefined ? { attempts: response.attempts } : {}) } }
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
  const generateMedia = (sceneId: string, artDirection: string) => {
    if (!compiled) return
    const source = compiled
    run('media', async signal => {
      const response = await requestModel<{ candidate: AgentCandidate; artifact: { id: string; version: number; hash: string }; requestId: string; media: { cacheHit: boolean } }>(
        '/api/agent/media', { candidate: source.candidate, sceneId, artDirection, confirmBilling: true }, signal)
      const candidate = assertAgentCandidate(response.candidate, source.pkg)
      return { ...source, candidate, provenance: { ...source.provenance, requestId: response.requestId, artifactId: response.artifact.id, artifactVersion: response.artifact.version, artifactHash: response.artifact.hash }, cacheHit: response.media.cacheHit }
    }, result => { const { cacheHit, ...next } = result; setCompiled(next); setNotice(cacheHit ? '已复用保存的插画，本章配图已更新。' : '新插画已保存并用于本章；导出成果时会携带新增素材。') })
  }
  const exportSession = () => run('export', async () => {
    const saved = snapshot()
    if (saved.compiled && compiled) saved.compiled.candidate = await portableAgentCandidate(saved.compiled.candidate, compiled.pkg)
    const content = JSON.stringify(saved, null, 2)
    if (new Blob([content]).size > MAX_STUDIO_FILE_BYTES) throw new Error('成果超过 8 MiB，请减少新增素材后导出。')
    return content
  }, content => {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `timewalker-studio-${selectedId}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('已导出创作成果，新增素材已随文件携带，可在其他浏览器导入。')
  })
  const importSession = (file?: File) => {
    if (!file) return
    run('import', async () => {
      if (file.size > MAX_STUDIO_FILE_BYTES) throw new Error('创作成果文件超过 8 MiB。')
      const session = await validateStudioSession(parseStudioSession(await file.text()), loadPublishedAttraction)
      const pkg = session.compiled ? await loadPublishedAttraction(session.compiled.candidate.brief.attractionId) : undefined
      return { session, pkg }
    }, ({ session, pkg }) => { applySession(session, pkg); setNotice('已导入已完成的创作成果；没有重新调用模型，采用后仍进入独立待审草稿。') })
  }
  const field = 'mt-1 min-h-11 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm'
  return <section className="rounded-2xl border border-indigo-200 bg-white p-5 sm:p-7" aria-label="Creative Studio">
    <div><p className="text-xs tracking-widest text-indigo-700">CREATIVE STUDIO · 在线智能体</p><h2 className="mt-2 text-xl font-medium">从故事构想到可编辑体验</h2><p className="mt-2 text-sm text-gray-500">先生成两个构想，人工选择后再编译。创作进度自动保存在本机，可导出交接；采用后进入独立草稿。</p></div>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="示例主题"><button type="button" className="min-h-11 rounded-lg border px-3 text-sm" disabled={!!busy || !ready} onClick={() => fillDemo('heritage')}>填入园林家书示例</button><button type="button" className="min-h-11 rounded-lg border px-3 text-sm" disabled={!!busy || !ready} onClick={() => fillDemo('cosmos')}>填入深空讯号示例</button></div>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-40" disabled={!!busy || !ready || !selectedId} onClick={exportSession}>{busy === 'export' ? '正在打包成果…' : '导出创作成果'}</button>
      <button type="button" className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-40" disabled={!!busy || !ready} onClick={() => fileInput.current?.click()}>导入创作成果</button>
      <input ref={fileInput} disabled={!!busy || !ready} type="file" accept="application/json,.json" className="sr-only" aria-label="创作成果文件" onChange={event => { importSession(event.target.files?.[0]); event.target.value = '' }} />
      <span className="text-xs text-gray-500" role="status">{ready ? storageNote : '正在恢复创作进度…'}</span>
    </div>
    {notice && <p className="mt-3 text-sm text-indigo-800" role="status">{notice}</p>}
    <fieldset disabled={!!busy || !ready} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm">资料景点<select className={field} value={selectedId} onChange={e => { setAttractionId(e.target.value); themeTouched.current = false }}>{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm sm:col-span-2">故事主题<input className={field} maxLength={120} value={theme} onChange={e => { themeTouched.current = true; setTheme(e.target.value) }} /></label>
      <label className="text-sm">受众<select className={field} value={audience} onChange={e => setAudience(e.target.value as AgentAudience)}><option value="general">普通游客</option><option value="family">亲子同行</option></select></label>
      <label className="text-sm">目标时长（分钟）<input className={field} type="number" min={3} max={30} value={targetMinutes} onChange={e => setTargetMinutes(Number(e.target.value))} /></label>
      <p className="text-sm">呈现风格<span className={`${field} block text-gray-600`} aria-label="呈现风格">{style === 'cosmos' ? '深空讯号 · 来自所选包' : '文化遗产 · 来自所选包'}</span></p>
    </fieldset>
    <div className="mt-5 rounded-xl bg-indigo-50/70 p-4" aria-label="故事灵感研究">
      <p className="text-sm text-gray-600">可先联网补充故事灵感，也可直接使用已有景点资料。</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className="min-h-11 rounded-lg border border-indigo-200 bg-white px-3 text-sm disabled:opacity-40" disabled={!!busy || !ready || !selectedId} onClick={researchNow}>{busy === 'research' ? '正在研究场景…' : '联网补充故事灵感'}</button>
        {(research || conceptResearchId) && <button type="button" className="min-h-11 px-2 text-sm underline" disabled={!!busy || !ready} onClick={() => { setResearch(null); setConceptResearchId(undefined); setNotice('已切换为已有景点资料，可继续生成或编译。') }}>使用已有资料</button>}
      </div>
      {research && <details className="mt-3 text-sm" open><summary className="cursor-pointer">{researchCurrent ? '本次研究将用于新构想' : '简报已改变，请重新研究或直接使用已有资料'} · {research.pages.length} 条灵感资料</summary><ul className="mt-2 space-y-3">{research.pages.map(page => <li key={page.source.id}><a className="text-indigo-700 underline break-words" href={page.source.url} target="_blank" rel="noreferrer">{page.source.title}</a><span className="ml-2 text-xs text-gray-500">{page.extracted ? '已读取正文' : '搜索摘要'}</span><p className="mt-1 text-gray-600 break-words">{page.excerpt.slice(0, 300)}</p></li>)}</ul>{research.warnings.map(warning => <p className="mt-2 text-amber-800" key={warning}>{warning}</p>)}</details>}
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled={!!busy || !ready || !selectedId} onClick={generateConcepts} className="min-h-11 rounded-lg bg-indigo-700 px-5 text-sm text-white disabled:opacity-40">{busy === 'concepts' ? '正在生成构想…' : '生成两个故事构想'}</button>{busy && <button type="button" className="min-h-11 px-2 text-sm underline" onClick={cancel}>取消当前请求</button>}<span className="text-xs text-gray-500">需要服务端在线模型配置；下方本地 Builder 可随时使用。</span></div>
    {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 break-words" role="alert">{error}</p>}
    {concepts.length === 2 && <fieldset className="mt-6 border-t pt-5" disabled={!!busy || !ready}><legend className="text-base font-medium">选择一个故事构想</legend>{!conceptCurrent && <p className="mt-2 text-sm text-amber-800">简报已改变，请重新生成构想。上一份候选仍可采用或导出。</p>}<div className="mt-3 grid gap-3 sm:grid-cols-2">{concepts.map(concept => <label key={concept.id} className={`block min-h-11 cursor-pointer rounded-xl border p-4 ${selection === concept.id ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-black/10'}`}><span className="flex items-start gap-3"><input className="mt-1 size-4" type="radio" name="studio-concept" value={concept.id} checked={selection === concept.id} onChange={() => setSelection(concept.id)} /><span><strong>{concept.title}</strong><span className="mt-2 block text-sm text-gray-600"><b>故事前提：</b>{concept.premise}</span><span className="mt-2 block text-sm text-gray-600"><b>悬念：</b>{concept.suspense}</span><span className="mt-2 block text-sm text-gray-600"><b>地点作用：</b>{concept.locationRole}</span><span className="mt-2 block text-sm text-gray-600"><b>结局：</b>{concept.resolution}</span></span></span></label>)}</div><button type="button" className="mt-4 min-h-11 rounded-lg bg-[#17251d] px-5 text-sm text-white disabled:opacity-40" disabled={!selection || !!busy || !ready || !conceptCurrent} onClick={compile}>{busy === 'compile' ? '正在编译故事…' : '编译所选构想'}</button></fieldset>}
    {compiled && <div className="mt-6 border-t pt-5" aria-label="已编译候选"><p className="text-xs text-indigo-700">智能体候选 · 尚未采用 · 待人工审核</p><h3 className="mt-2 text-lg">{compiled.candidate.experience.title}</h3><p className="mt-1 text-sm text-gray-500">所选构想：{compiled.candidate.selectedConcept.title} · {compiled.pkg.name}</p>{compiled.evidence && <details className="mt-3 text-xs text-gray-500"><summary className="cursor-pointer">查看本次运行记录</summary><p className="mt-2 break-all">请求：{compiled.evidence.requestId} · 模型：{compiled.evidence.model ?? '未记录'} · 耗时：{compiled.evidence.durationMs === undefined ? '未记录' : `${(compiled.evidence.durationMs / 1000).toFixed(1)} 秒`} · 尝试：{compiled.evidence.attempts ?? '未记录'}</p><p className="mt-1 break-all">产物：{compiled.provenance.artifactId} · {compiled.provenance.artifactHash}</p></details>}<ol className="mt-4 space-y-3" aria-label="故事节拍时间线">{compiled.candidate.beatSheet.beats.map((beat, index) => { const spot = compiled.pkg.spots.find(item => item.id === beat.spotId)?.name || beat.spotId; return <li key={beat.id} className="rounded-lg bg-gray-50 p-3 text-sm"><strong>{index + 1}. {beat.title}</strong><span className="block text-gray-600">地点：{spot} · {beat.summary}</span>{beat.branches?.map(branch => { const rejoin = compiled.candidate.beatSheet.beats.find(item => item.id === branch.rejoinsAtBeatId)?.title || branch.rejoinsAtBeatId; return <span className="mt-1 block text-gray-600" key={branch.id}>选择「{branch.label}」：{branch.summary}（在 {compiled.pkg.spots.find(item => item.id === branch.spotId)?.name || branch.spotId}；汇合到：{rejoin}）</span> })}{beat.observationTask && <span className="mt-1 block text-gray-600">观察任务：{beat.observationTask}</span>}</li> })}</ol><CandidateMediaPanel candidate={compiled.candidate} pkg={compiled.pkg} disabled={!!busy || !ready} generating={busy === 'media'} onGenerate={generateMedia} onCancel={cancel} /><button type="button" className="mt-4 min-h-11 rounded-lg bg-emerald-700 px-4 text-sm text-white disabled:opacity-40" onClick={adopt} disabled={!!busy || !ready}>采用并进入故事编辑器</button></div>}
  </section>
}
