import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Download, Footprints, Stamp } from 'lucide-react'
import { resolveMediaUrl, type PublishedAttraction } from '../lib/tourPackage'
import type { TrailDefinitionV1 } from './trailSchema'
import { confirmCheckpoint, eventKey, freshTrailSession, restoreTrailSession, sessionKey, trailCardSvg, undoCheckpoint, type TrailEvent, type TrailEventName, type TrailSession } from './trailSession'
import './trail.css'

export function TrailImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? <div className="tr-image-fallback">画面暂不可用，仍可阅读并手动打卡。</div> : <img src={src} alt={alt} onError={() => setFailed(true)} />
}
function Recommendation({ recommendation, onEvent }: { recommendation: NonNullable<TrailDefinitionV1['recommendations']>[number]; onEvent: (type: TrailEventName, targetId: string) => void }) {
  const element = useRef<HTMLElement>(null)
  const viewed = useRef(false)
  useEffect(() => {
    if (!element.current || viewed.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !viewed.current) { viewed.current = true; onEvent('promotion_view', recommendation.id); observer.disconnect() }
    }, { threshold: 0.2 })
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [onEvent, recommendation.id])
  const labels = { editorial: '编辑推荐', demo_promotion: '运营推荐 · 演示', sponsored: '合作推广' }
  return <aside ref={element} className="tr-recommendation" aria-label="可选推荐"><small>{labels[recommendation.label]} · 可跳过</small><h3>{recommendation.title}</h3><p>{recommendation.description}</p>{recommendation.href && <a className="tr-link" href={recommendation.href} target={recommendation.href.startsWith('https:') ? '_blank' : undefined} rel="noreferrer" onClick={() => onEvent('promotion_click', recommendation.id)}>了解这项推荐 ↗</a>}</aside>
}
const read = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
function readEvents(id: string): TrailEvent[] {
  try { const raw = JSON.parse(read(eventKey(id)) ?? '[]'); return Array.isArray(raw) ? raw.filter(event => event && event.trailId === id && ['trail_open', 'checkpoint_confirm', 'checkpoint_undo', 'trail_complete', 'trail_restart', 'promotion_view', 'promotion_click'].includes(event.type) && typeof event.sessionId === 'string' && Number.isSafeInteger(event.at) && (event.targetId === undefined || typeof event.targetId === 'string')).slice(-200) : [] } catch { return [] }
}
export function TrailPlayer({ trail, pkg, preview = false }: { trail: TrailDefinitionV1; pkg: PublishedAttraction; preview?: boolean }) {
  const [session, setSession] = useState(() => restoreTrailSession(preview ? null : read(sessionKey(trail.id)), trail))
  const current = useRef(session)
  const [events, setEvents] = useState<TrailEvent[]>(() => preview ? [] : readEvents(trail.id))
  const eventLog = useRef(events)
  const [message, setMessage] = useState('')
  const [storageFailed, setStorageFailed] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const started = useRef(false)
  const focusTarget = useRef<HTMLElement>(null)
  const progress = session.completedCheckpointIds.length
  const complete = progress === trail.checkpoints.length
  const persist = useCallback((key: string, value: unknown) => {
    if (preview) return
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { setStorageFailed(true) }
  }, [preview])
  const record = useCallback((type: TrailEventName, targetId?: string) => {
    const event: TrailEvent = { type, trailId: trail.id, sessionId: current.current.sessionId, at: Date.now(), ...(targetId ? { targetId } : {}) }
    const next = [...eventLog.current, event].slice(-200)
    eventLog.current = next; setEvents(next); persist(eventKey(trail.id), next)
  }, [trail.id, persist])
  useEffect(() => { if (!started.current) { started.current = true; record('trail_open') } }, [record]) // one open event per mount
  const save = (next: TrailSession) => { current.current = next; setSession(next); persist(sessionKey(trail.id), next) }
  const confirm = (id: string) => {
    const next = confirmCheckpoint(current.current, trail, id)
    if (next === current.current) return
    save(next); record('checkpoint_confirm', id)
    setMessage(`已收集「${trail.checkpoints.find(cp => cp.id === id)!.stampLabel}」印章。`)
    if (next.completedCheckpointIds.length === trail.checkpoints.length) record('trail_complete')
    requestAnimationFrame(() => { focusTarget.current?.focus({ preventScroll: true }); focusTarget.current?.scrollIntoView({ block: 'start', behavior: 'instant' }) })
  }
  const undo = () => { const next = undoCheckpoint(current.current); if (next === current.current) return; const id = current.current.completedCheckpointIds.at(-1)!; save(next); record('checkpoint_undo', id); setMessage('已撤销上一站打卡，可以重新确认。') }
  const restart = () => { save(freshTrailSession(trail)); record('trail_restart'); setResetConfirm(false); setMessage('已重新开始；此前的事件记录仍可查看。') }
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([trailCardSvg(trail, session)], { type: 'image/svg+xml;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = `${trail.id}-探索纪念卡.svg`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('纪念卡已生成，请查看浏览器下载。')
    } catch { setMessage('下载暂不可用，可以先保留本页探索记录。') }
  }
  return <div className="tr-page"><header className="tr-header"><Link to={preview ? `/publish/trails/${trail.id}` : '/'}><ArrowLeft size={17} />{preview ? '返回路线编辑' : '时空漫游者'}</Link><span>主题路线 · 手动打卡</span></header>
    <main className="tr-main">
      {preview && <p className="tr-notice">本机草稿预览 · 尚未发布，不写入游客进度</p>}
      <section className="tr-hero"><TrailImage key={trail.coverImage ?? pkg.coverImage} src={resolveMediaUrl(pkg, trail.coverImage ?? pkg.coverImage)} alt={`${trail.title}路线封面`} /><div><small>TIMEWALKER · TRAIL</small><h1>{trail.title}</h1><p>{trail.description}</p><span>{trail.checkpoints.length} 站{trail.estimatedMinutes ? ` · 参考 ${trail.estimatedMinutes} 分钟` : ''} · 自由停留</span></div></section>
      <div className="tr-progress" aria-label="路线进度"><div><Stamp size={23} /><strong>已收集 {progress} / {trail.checkpoints.length} 枚印章</strong></div><progress aria-label="已完成站点" value={progress} max={trail.checkpoints.length} /><p>按顺序探索，亲手确认。无需 GPS；不代表实地到站核验。</p></div>
      {storageFailed && <p className="tr-notice" role="alert">浏览器存储不可用，本次仍可完成；刷新后可能无法恢复，请先保存纪念卡。</p>}
      {message && <p className="tr-notice" role="status">{message}</p>}
      <ol className="tr-stops">{trail.checkpoints.map((cp, index) => {
        const spot = pkg.spots.find(spot => spot.id === cp.spotId)!
        const done = index < progress; const active = index === progress
        return <li key={cp.id}><article className={`tr-stop ${done ? 'is-done' : active ? 'is-current' : ''}`} aria-label={cp.heading} ref={active ? focusTarget : undefined} tabIndex={active ? -1 : undefined}>
          <div className="tr-stop-title"><span className="tr-stamp" aria-label={done ? `已收集 ${cp.stampLabel}` : `第 ${index + 1} 站`}>{done ? <Check size={22} /> : index + 1}</span><div><small>{spot.name} · {done ? '已收集' : active ? '现在去发现' : '等待探索'}</small><h2>{cp.heading}</h2></div></div>
          {active && <><TrailImage key={spot.image} src={resolveMediaUrl(pkg, spot.image)} alt={spot.name} /><p>{cp.instruction}</p><button className="tr-button tr-primary" onClick={() => confirm(cp.id)}><Footprints size={18} />完成打卡 · 收下「{cp.stampLabel}」</button></>}
          {done && <p className="tr-stamp-text">✦ {cp.stampLabel}</p>}
        </article>{trail.recommendations?.filter(rec => rec.afterCheckpointId === cp.id && done).map(rec => <Recommendation key={`${session.sessionId}:${rec.id}`} recommendation={rec} onEvent={record} />)}</li>
      })}</ol>
      {complete && <section className="tr-finish" aria-label="探索完成" ref={focusTarget} tabIndex={-1}><small>探索过的风景，成为你的记忆</small><h2>这一路的风景，已收进你的纪念卡</h2><div className="tr-seals">{trail.checkpoints.map(cp => <span key={cp.id}>✦<br />{cp.stampLabel}</span>)}</div><p>由本次 {progress} 次手动打卡生成，不是到店或消费凭证。</p><button className="tr-button tr-primary" onClick={download}><Download size={18} />保存探索纪念卡</button></section>}
      <div className="tr-actions">{!!progress && <button className="tr-button" onClick={undo}>撤销上一次打卡</button>}{!!progress && <button className="tr-button" onClick={() => setResetConfirm(true)}>重新开始探索</button>}{trail.relatedExperienceId && <Link className="tr-button" to={`/experience/${trail.relatedExperienceId}`}>换一种方式 · 体验相关故事</Link>}</div>
      {resetConfirm && <div className="tr-notice" role="group" aria-label="重新开始确认"><p>重新开始会清除本条路线的印章进度。可以先保存纪念卡。</p><button className="tr-button" onClick={() => setResetConfirm(false)}>保留当前进度</button><button className="tr-button" onClick={restart}>确认重新开始</button></div>}
      <details className="tr-events"><summary>查看本机演示事件（{events.length}）</summary><p>仅当前浏览器，最多保留 200 条；不代表跨设备流量、订单或收益。</p><ol>{events.slice(-30).map((event, index) => <li key={`${event.at}:${index}`}>{event.type}{event.targetId ? ` · ${event.targetId}` : ''} · {new Date(event.at).toLocaleTimeString()}</li>)}</ol></details>
    </main>
  </div>
}
