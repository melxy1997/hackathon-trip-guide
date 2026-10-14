import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowRight, Scan, X } from 'lucide-react'
import type { Discovery } from '../events'
import { discoveryLabels } from '../journey'
import { presentationCopy, type ExperienceFrameworkCopy } from '../presentation'

export function ObservationCard({ image, place, prompt, hints = [], copy = presentationCopy().observation, onConfirm }: { image: string; place: string; prompt?: string; hints?: string[]; copy?: ExperienceFrameworkCopy['observation']; onConfirm: (discovery?: Discovery) => void }) {
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
    <div className="tw-observation-heading"><Scan size={18} /><h2 id={`${helpId}-title`}>{copy.title}</h2><span>{copy.openEnded}</span></div>
    <p id={helpId} className="tw-observation-help">{prompt ?? copy.help}</p>
    {hints.length > 0 && <details className="tw-observation-hints"><summary>{copy.hints}</summary><ul>{hints.map((hint, index) => <li key={`${index}-${hint}`}>{hint}</li>)}</ul></details>}
    {failed ? <p className="tw-notice" role="status">{copy.imageUnavailable}</p> : <button type="button" className="tw-photo-target" disabled={!ready} onClick={pick} onKeyDown={move} aria-label={copy.targetAria} aria-describedby={helpId}>
      <img src={image} alt={copy.imageAlt(place)} onLoad={() => setReady(true)} onError={() => { setFailed(true); setPoint(null) }} />
      {point ? <span className="tw-photo-pin" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-hidden="true"><span>✦</span></span> : <span className="tw-photo-prompt" aria-hidden="true"><Scan size={17} />{copy.imagePrompt}</span>}
    </button>}
    <p className="tw-point-status" role="status">{!ready && !failed ? copy.loading : point ? copy.marked : copy.keyboard}</p>
    {point && <button className="tw-clear-point" onClick={() => setPoint(null)}><X size={14} />{copy.clear}</button>}
    <div className="tw-discovery-tags" aria-label={copy.categoryAria}>{Object.entries(discoveryLabels).map(([key, label]) => <button key={key} aria-pressed={category === key} onClick={() => setCategory(key as Discovery['category'])}>{label}</button>)}</div>
    <label className="tw-observation-note">{copy.noteLabel} <span>选填 · {note.length}/120</span><textarea maxLength={120} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={copy.placeholder} /></label>
    <p className="tw-fineprint">{copy.fineprint}</p>
    <div className="tw-observation-confirm"><button className="tw-button tw-primary" onClick={confirm}>{copy.confirm} <ArrowRight size={17} /></button></div>
  </section>
}
