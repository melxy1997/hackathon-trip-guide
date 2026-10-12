import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowRight, Scan, X } from 'lucide-react'
import type { Discovery } from '../events'
import { discoveryLabels } from '../journey'

export function ObservationCard({ image, place, prompt, hints = [], onConfirm }: { image: string; place: string; prompt?: string; hints?: string[]; onConfirm: (discovery?: Discovery) => void }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const [category, setCategory] = useState<Discovery['category']>('detail')
  const [note, setNote] = useState('')
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const helpId = useId()
  const setPosition = (x: number, y: number) => setPoint({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) })
  const pick = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) { setPosition(.5, .5); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setPosition((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
  }
  const move = (e: KeyboardEvent<HTMLButtonElement>) => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-.05, 0], ArrowRight: [.05, 0], ArrowUp: [0, -.05], ArrowDown: [0, .05] }
    if (e.key === 'Escape') { setPoint(null); return }
    if (!directions[e.key]) return
    e.preventDefault()
    const [dx, dy] = directions[e.key]
    setPosition((point?.x ?? .5) + dx, (point?.y ?? .5) + dy)
  }
  const confirm = () => onConfirm(point || note.trim() ? { ...(point ?? {}), category, ...(note.trim() ? { note: note.trim() } : {}) } : undefined)
  return <section className="tw-observation-card" aria-labelledby={`${helpId}-title`}>
    <div className="tw-observation-heading"><Scan size={18} /><h2 id={`${helpId}-title`}>留住你发现的一处细节</h2><span>没有标准答案</span></div>
    <p id={helpId} className="tw-observation-help">{prompt ?? '点选照片中的轮廓、光影或一个喜欢的细节。也可以直接写一句话，或完成观察后继续。'}</p>
    {hints.length > 0 && <details className="tw-observation-hints"><summary>需要一点观察提示？</summary><ul>{hints.map((hint, index) => <li key={`${index}-${hint}`}>{hint}</li>)}</ul></details>}
    {failed ? <p className="tw-notice" role="status">照片暂不可用，仍可以写下观察或直接确认。</p> : <button type="button" className="tw-photo-target" disabled={!ready} onClick={pick} onKeyDown={move} aria-label="点选照片中的细节" aria-describedby={helpId}>
      <img src={image} alt={`${place}的样例照片，可在照片上标记自己的发现`} onLoad={() => setReady(true)} onError={() => { setFailed(true); setPoint(null) }} />
      {point ? <span className="tw-photo-pin" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-hidden="true"><span>✦</span></span> : <span className="tw-photo-prompt" aria-hidden="true"><Scan size={17} />点一下，留下你的发现</span>}
    </button>}
    <p className="tw-point-status" role="status">{!ready && !failed ? '照片加载中，可以先写记录或直接确认。' : point ? '已标记一个细节 · 可重新点选或用方向键微调' : '也支持键盘：聚焦照片，按回车选中中心，再用方向键移动。'}</p>
    {point && <button className="tw-clear-point" onClick={() => setPoint(null)}><X size={14} />清除标记</button>}
    <div className="tw-discovery-tags" aria-label="发现类型">{Object.entries(discoveryLabels).map(([key, label]) => <button key={key} aria-pressed={category === key} onClick={() => setCategory(key as Discovery['category'])}>{label}</button>)}</div>
    <label className="tw-observation-note">这一刻让我想到… <span>选填 · {note.length}/120</span><textarea maxLength={120} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="例如：光从石头的缝隙里穿过，像一封还没写完的信。" /></label>
    <p className="tw-fineprint">样例照片 · 手动标注与人工确认。确认后存入本机手账；保存或分享手账会包含这句话。</p>
    <div className="tw-observation-confirm"><button className="tw-button tw-primary" onClick={confirm}>我已观察，收下这份发现 <ArrowRight size={17} /></button></div>
  </section>
}
