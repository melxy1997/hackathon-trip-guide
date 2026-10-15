import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Share2, Sparkles } from 'lucide-react'
import type { ExperienceDefinitionV1 } from '../experienceSchema'
import type { ExperienceState } from '../storyEngine'
import type { PublishedAttraction } from '../../lib/tourPackage'
import { resolveMediaUrl } from '../../lib/tourPackage'
import { discoveryLabels, journalSvg, journalText, journeyTitle } from '../journey'
import { resolvePresentation, locationLabel, presentationCopy, type ExperienceFrameworkCopy } from '../presentation'
import type { Discovery } from '../events'

function DiscoveryPhoto({ src, title, discovery, copy }: { src: string; title: string; discovery: Discovery; copy: ExperienceFrameworkCopy['journal'] }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <p className="tw-fineprint">{copy.photoUnavailable}</p>
  return <figure className="tw-discovery-photo"><img src={src} alt={copy.photoAlt(title)} onError={() => setFailed(true)} />{discovery.x !== undefined && discovery.y !== undefined && <span className="tw-photo-pin" style={{ left: `${discovery.x * 100}%`, top: `${discovery.y * 100}%` }} aria-hidden="true"><span>✦</span></span>}</figure>
}

export function EndingJournal({ pkg, definition, state, onRestart }: { pkg: PublishedAttraction; definition: ExperienceDefinitionV1; state: ExperienceState; onRestart: () => void }) {
  const presentation = resolvePresentation(pkg.presentation)
  const copy = presentationCopy(presentation).journal
  const scenes = state.visitedSceneIds.map(id => definition.scenes.find(s => s.id === id)).filter(s => !!s)
  const spots = state.visitedSpotIds.map(id => pkg.spots.find(s => s.id === id)).filter(s => !!s)
  const [message, setMessage] = useState('')
  const [showCopy, setShowCopy] = useState(false)
  const copyId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); titleRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }) }, [])
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([journalSvg(definition, state, presentation)], { type: 'image/svg+xml;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url; link.download = `${pkg.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${copy.filename}.svg`
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(copy.downloaded)
    } catch { setShowCopy(true); setMessage(copy.downloadFailed) }
  }
  const share = async () => {
    const text = journalText(definition, state, presentation)
    if (navigator.share) {
      try { await navigator.share({ title: definition.title, text }); setMessage(copy.shared); return }
      catch (e) { if (e instanceof Error && e.name === 'AbortError') { setMessage(copy.shareCancelled); return } }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text)
      setMessage(copy.copied)
    } catch { setShowCopy(true); setMessage(copy.copyFailed) }
  }
  return <section className="tw-journal" aria-labelledby="journal-title">
    <p className="tw-eyebrow">{copy.eyebrow}</p>
    <h1 id="journal-title" ref={titleRef} tabIndex={-1}>{presentation.labels.journal}</h1>
    <p className="tw-intro">{copy.intro(definition.title)}</p>
    <div className="tw-journey-seal"><Sparkles size={24} /><div><small>{copy.role}</small><h2>{journeyTitle(state, presentation)}</h2><p>{spots.length} {presentation.locationMode === 'indoor' ? '个展区章节' : copy.places} · {state.choices.length} 次选择 · {state.observations.length} 次人工观察</p></div></div>
    {state.directorUsed && <p className="tw-notice">本次使用了导演跳幕，以下仅记录实际进入的章节和完成的互动。</p>}
    <div className="tw-journal-images">{spots.slice(0, 3).map(s => <figure key={s.id}><img src={resolveMediaUrl(pkg, s.image)} alt={s.name} /><figcaption>{s.name}</figcaption></figure>)}</div>
    <div className="tw-journal-detail">
      <div><span>{copy.choiceHeading}</span><p>{state.choices.map(c => c.label).join('；') || copy.noChoices}</p></div>
      <div><span>{copy.discoveriesHeading}</span><p>{state.observations.length ? state.observations.map(o => `${definition.scenes.find(s => s.interaction?.id === o.interactionId)?.title ?? copy.discoveryFallback} · 人工确认`).join('；') : copy.noDiscoveries}</p></div>
      <div><span>{copy.chapters}</span><ol>{scenes.map(s => <li key={s.id}>{s.title}</li>)}</ol></div>
    </div>
    {state.observations.some(o => o.discovery) && <section className="tw-my-discoveries" aria-label={copy.observationsAria}><h2>{copy.observationsTitle}</h2>{state.observations.map((o, index) => {
      if (!o.discovery) return null
      const scene = definition.scenes.find(s => s.interaction?.id === o.interactionId)
      const spot = pkg.spots.find(s => s.id === scene?.spotId)
      const image = scene?.blocks.find(b => b.type === 'image')?.assetRef ?? spot?.image
      return <article className="tw-discovery-entry" key={`${o.interactionId}:${index}`}>
        {image && <DiscoveryPhoto src={resolveMediaUrl(pkg, image)} title={spot?.name ?? copy.discoveryTitle} discovery={o.discovery} copy={copy} />}
        <div><small>{spot?.name ?? scene?.title} · 手动记录</small><h3>{discoveryLabels[o.discovery.category]}</h3><p>{o.discovery.note || copy.emptyNote}</p></div>
      </article>
    })}</section>}
    <div className="tw-keepsake-actions"><button className="tw-button tw-primary" onClick={download}><Download size={17} />{copy.save}</button><button className="tw-button" onClick={() => void share()}><Share2 size={17} />{copy.share}</button></div>
    {message && <p className="tw-notice" role="status">{message}</p>}
    {showCopy && <div className="tw-copy-journal"><label htmlFor={copyId}>{copy.copyLabel}</label><textarea id={copyId} rows={8} readOnly value={journalText(definition, state, presentation)} onFocus={e => e.target.select()} /></div>}
    <p className="tw-fineprint">{locationLabel(presentation)} · {copy.fineprint}</p>
    {pkg.relatedTrailId && <aside className="tw-notice"><p>故事之后，还可以按自己的节奏继续探索。</p><Link className="tw-button" to={`/trail/${pkg.relatedTrailId}`}>沿着故事中的地点继续探索 →</Link></aside>}
    <div className="tw-actions"><button className="tw-button" onClick={onRestart}>{copy.restart}</button><Link className="tw-button" to="/">{copy.home}</Link></div>
  </section>
}
