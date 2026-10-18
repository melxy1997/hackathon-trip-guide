import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ensureEditableDraft } from '../lib/draftStore'
import type { DraftAttraction } from '../types/attraction'
import { builderRequest } from './client'
import type { BuilderJob, CreativeBrief } from './contracts'
import './builder.css'
interface Health { modelConfigured: boolean; researchConfigured: boolean }
const storedJob = (id: string) => { try { return localStorage.getItem(`builder:last-job:${id}`) || '' } catch { return '' } }
const rememberJob = (id: string, job: string) => { try { localStorage.setItem(`builder:last-job:${id}`, job) } catch { /* The job still lives on the server. */ } }
export function BuilderPage() {
  const { id = '' } = useParams(); const navigate = useNavigate()
  const [source, setSource] = useState<DraftAttraction>(); const [health, setHealth] = useState<Health>()
  const [prompt, setPrompt] = useState(''); const [audience, setAudience] = useState('自由行游客'); const [style, setStyle] = useState('有悬念、有情绪回收的沉浸故事')
  const [mode, setMode] = useState<CreativeBrief['mode']>('story'); const [minutes, setMinutes] = useState(20); const [policy, setPolicy] = useState<CreativeBrief['rewritePolicy']>('redesign')
  const [job, setJob] = useState<BuilderJob>(); const [candidate, setCandidate] = useState<DraftAttraction>()
  const [resumeId, setResumeId] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const restore = useCallback((saved: BuilderJob) => { setJob(saved); setPrompt(saved.brief.prompt); setMode(saved.brief.mode); setAudience(saved.brief.audience); setStyle(saved.brief.storyStyle); setMinutes(saved.brief.targetMinutes); setPolicy(saved.brief.rewritePolicy) }, [])
  const running = !!job && ['queued', 'running'].includes(job.status)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [draft, config] = await Promise.all([ensureEditableDraft(id), builderRequest<Health>('health')])
        if (!draft) throw new Error('未找到原草稿，请先在地图编辑器保存地点。')
        if (cancelled) return
        setSource(draft); setHealth(config); setMode(draft.mode === 'story' ? 'story' : 'checkin')
        const previous = storedJob(id); setResumeId(previous)
        if (previous) { const data = await builderRequest<{ job: BuilderJob }>(`jobs/${encodeURIComponent(previous)}`); if (!cancelled && data.job.sourceDraftId === id) restore(data.job) }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '创作服务暂不可用') }
    })()
    return () => { cancelled = true }
  }, [id, restore])
  useEffect(() => {
    if (!job?.id || !running) return
    let cancelled = false; let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const data = await builderRequest<{ job: BuilderJob }>(`jobs/${job.id}`)
        if (!cancelled) { setJob(data.job); if (['queued', 'running'].includes(data.job.status)) timer = setTimeout(() => void poll(), 1200) }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '查询任务失败；可使用任务 ID 恢复') }
    }
    timer = setTimeout(() => void poll(), 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [job?.id, running])
  useEffect(() => {
    if (!job?.candidateHash) return
    let cancelled = false
    void builderRequest<{ draft: DraftAttraction }>(`jobs/${job.id}/candidate`).then(data => { if (!cancelled) setCandidate(data.draft) }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : '读取候选失败') })
    return () => { cancelled = true }
  }, [job?.id, job?.candidateHash])
  const action = async (request: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await request() } catch (e) { setError(e instanceof Error ? e.message : '操作未完成，请重试') } finally { setBusy(false) } }
  const start = () => void action(async () => {
    const data = await builderRequest<{ job: BuilderJob }>('jobs', { sourceDraftId: id, mode, prompt, audience, storyStyle: style, targetMinutes: minutes, rewritePolicy: policy })
    setJob(data.job); setCandidate(undefined); rememberJob(id, data.job.id); setResumeId(data.job.id)
  })
  return <div className="ba-page"><header className="ba-header"><Link to={`/publish/${id}/content`}>← 返回内容创作</Link><span>TIMEWALKER · BUILDER</span></header><main className="ba-main"><p className="ba-eyebrow">把目的地变成新的体验</p><h1>从一个灵感，走到一份完整作品</h1><p className="ba-lead">研究地点、比较两个创意，再把你选择的方向写成可编辑的新草稿。原稿保留，发布由你决定。</p>
    {error && <p className="ba-notice" role="alert">{error}</p>}
    {!source && !error && <p role="status">正在读取地点和创作服务…</p>}
    {source && <><section className="ba-source"><strong>{source.name}</strong><span>{source.spots.length} 个已选地点 · 沿用原坐标与图片</span><p>{source.spots.map(spot => spot.name).join(' → ')}</p></section>
      {health && (!health.modelConfigured || !health.researchConfigured) && <p className="ba-notice">创作服务尚未配置完整。请由团队在服务端配置模型和 Tavily 后重启；当前不会生成或扣费。仍可返回原稿继续编辑和预览。</p>}
      <fieldset className="ba-form" disabled={busy || running}><legend>这次想创作什么？</legend><label>创作命题<textarea maxLength={2000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="例如：以一封未寄出的家书串起园林，让游客在两条线索中作出选择，最后收回最初的悬念。" /></label><div className="ba-grid"><label>体验模式<select value={mode} onChange={event => setMode(event.target.value as CreativeBrief['mode'])}><option value="story">沉浸式故事</option><option value="checkin">主题打卡讲解</option></select></label><label>面向谁<input maxLength={100} value={audience} onChange={event => setAudience(event.target.value)} /></label><label>风格<input maxLength={100} value={style} onChange={event => setStyle(event.target.value)} /></label><label>参考时长（分钟）<input type="number" min={3} max={180} value={minutes} onChange={event => setMinutes(Number(event.target.value))} /></label></div><label>如何对待原作<select value={policy} onChange={event => setPolicy(event.target.value as CreativeBrief['rewritePolicy'])}><option value="redesign">围绕原地点重新构思</option><option value="keep-world">保留原作世界观，重新编写情节</option></select></label><button className="ba-button ba-primary" disabled={!prompt.trim() || !audience.trim() || !style.trim() || minutes < 3 || minutes > 180 || !health?.modelConfigured || !health?.researchConfigured} onClick={start}>研究地点，生成两个创意</button></fieldset>
      <details className="ba-resume"><summary>找回已有创作任务</summary><label>任务 ID<input value={resumeId} onChange={event => setResumeId(event.target.value)} maxLength={100} /></label><button className="ba-button" disabled={busy || running || !resumeId.trim()} onClick={() => void action(async () => { const data = await builderRequest<{ job: BuilderJob }>(`jobs/${encodeURIComponent(resumeId.trim())}`); if (data.job.sourceDraftId !== id) throw new Error('此任务属于另一个原草稿'); setCandidate(undefined); restore(data.job); rememberJob(id, data.job.id) })}>读取已有任务</button></details>
    </>}
    {job && <section className="ba-job" aria-label="创作任务"><div className="ba-job-heading"><h2>{job.stage}</h2>{running && <button className="ba-button" disabled={busy} onClick={() => void action(async () => { const data = await builderRequest<{ job: BuilderJob }>(`jobs/${job.id}/cancel`, {}); setJob(data.job) })}>取消本次生成</button>}</div><progress max={100} value={job.progress} aria-label="创作进度" /><p className="ba-meta">任务 <code>{job.id}</code> · 候选版本 {job.version} · 离开页面不会取消，可回来继续查看</p>{job.error && <p className="ba-notice" role="alert">{job.error}</p>}
      {!!job.research?.sourceUrls.length && <details><summary>本次检索资料（{job.research.sourceUrls.length}）</summary><ul>{job.research.sourceUrls.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul></details>}
      {!!job.concepts?.length && <><h2>两个方向，你更想走进哪一个？</h2><div className="ba-grid ba-concepts">{job.concepts.map(concept => <article key={concept.conceptId} className={job.selectedConceptId === concept.conceptId ? 'is-selected' : ''}><small>{job.selectedConceptId === concept.conceptId ? '已选方向' : '创意提案'}</small><h3>{concept.title}</h3><p>{concept.logline}</p><dl><dt>你的角色</dt><dd>{concept.visitorRole}</dd><dt>开场悬念</dt><dd>{concept.hook}</dd><dt>冲突与推进</dt><dd>{concept.conflict}</dd><dt>高潮与收尾</dt><dd>{concept.climax}<br />{concept.ending}</dd></dl><button className="ba-button ba-primary" disabled={busy || running} onClick={() => void action(async () => { const data = await builderRequest<{ job: BuilderJob }>(`jobs/${job.id}/select-concept`, { conceptId: concept.conceptId }); setCandidate(undefined); setJob(data.job) })}>选择「{concept.title}」并编写</button></article>)}</div></>}
      {candidate && job.status === 'completed' && <section className="ba-candidate" aria-label="完成候选"><h2>{candidate.story?.title || '主题讲解已完成'}</h2><p>{candidate.description}</p><p className="ba-meta">{candidate.spots.length} 站 · {candidate.mode === 'story' ? `${Object.keys(candidate.story?.endings || {}).length} 个结局` : '有序打卡'} · 地点与故事结构已检查</p><ol>{candidate.spots.map(spot => <li key={spot.id}><strong>{spot.name} · {spot.poetic}</strong>{spot.slides.map((slide, index) => <details key={index}><summary>{slide.title}</summary><p>{slide.narration}</p></details>)}</li>)}</ol><p className="ba-meta">采纳后创建独立草稿，进入当前游客页面预览。新草稿不会自动发布。</p><button className="ba-button ba-primary" disabled={busy} onClick={() => void action(async () => { const data = await builderRequest<{ draft: DraftAttraction }>(`jobs/${job.id}/adopt`, { version: job.version, hash: job.candidateHash }); navigate(`/publish/${data.draft.id}/preview?from=content`) })}>{busy ? '正在准备新草稿…' : '采纳为新草稿，进入真实预览'}</button></section>}
      <details className="ba-log"><summary>查看创作步骤（{job.events.length}）</summary><ol>{job.events.map((event, index) => <li key={index}>{event.tool} · {event.status} · {Math.round(event.durationMs / 1000)} 秒</li>)}</ol></details>
    </section>}
  </main></div>
}
