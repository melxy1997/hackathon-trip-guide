import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Share2, Sparkles } from 'lucide-react'
import type { ExperienceDefinitionV1 } from '../experienceSchema'
import type { ExperienceState } from '../storyEngine'
import type { PublishedAttraction } from '../../lib/tourPackage'
import { resolveMediaUrl } from '../../lib/tourPackage'
import { discoveryLabels, journalSvg, journalText, journeyTitle } from '../journey'
import type { Discovery } from '../events'

function DiscoveryPhoto({ src, title, discovery }: { src: string; title: string; discovery: Discovery }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <p className="tw-fineprint">照片暂不可用，你的发现文字仍保留在手账中。</p>
  return <figure className="tw-discovery-photo"><img src={src} alt={`${title} · 本次观察的样例照片`} onError={() => setFailed(true)} />{discovery.x !== undefined && discovery.y !== undefined && <span className="tw-photo-pin" style={{ left: `${discovery.x * 100}%`, top: `${discovery.y * 100}%` }} aria-hidden="true"><span>✦</span></span>}</figure>
}

export function EndingJournal({ pkg, definition, state, onRestart }: { pkg: PublishedAttraction; definition: ExperienceDefinitionV1; state: ExperienceState; onRestart: () => void }) {
  const scenes = state.visitedSceneIds.map(id => definition.scenes.find(s => s.id === id)).filter(s => !!s)
  const spots = state.visitedSpotIds.map(id => pkg.spots.find(s => s.id === id)).filter(s => !!s)
  const [message, setMessage] = useState('')
  const [showCopy, setShowCopy] = useState(false)
  const copyId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); titleRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }) }, [])
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([journalSvg(definition, state)], { type: 'image/svg+xml;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url; link.download = `${pkg.id.replace(/[^a-zA-Z0-9_-]/g, '')}-手账.svg`
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('手账卡已生成，请查看浏览器下载。卡片包含本次选择与发现。')
    } catch { setShowCopy(true); setMessage('卡片暂时无法保存，可以复制下方文字手账。') }
  }
  const share = async () => {
    const text = journalText(definition, state)
    if (navigator.share) {
      try { await navigator.share({ title: definition.title, text }); setMessage('已完成分享。'); return }
      catch (e) { if (e instanceof Error && e.name === 'AbortError') { setMessage('已取消分享，手账仍保留在这里。'); return } }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text)
      setMessage('文字手账已复制，可以粘贴分享给同行的人。')
    } catch { setShowCopy(true); setMessage('请选中下方文字手动复制，手账仍可以保存为卡片。') }
  }
  return <section className="tw-journal" aria-labelledby="journal-title">
    <p className="tw-eyebrow">TIMEWALKER · 旅程留痕</p>
    <h1 id="journal-title" ref={titleRef} tabIndex={-1}>我的时空手账</h1>
    <p className="tw-intro">{definition.title}，留下了属于你的这一页。</p>
    <div className="tw-journey-seal"><Sparkles size={24} /><div><small>这趟旅程的称号</small><h2>{journeyTitle(state)}</h2><p>{spots.length} 处走过的地点 · {state.choices.length} 次选择 · {state.observations.length} 次人工观察</p></div></div>
    {state.directorUsed && <p className="tw-notice">本次使用了导演跳幕，以下仅记录实际进入的章节和完成的互动。</p>}
    <div className="tw-journal-images">{spots.slice(0, 3).map(s => <figure key={s.id}><img src={resolveMediaUrl(pkg, s.image)} alt={s.name} /><figcaption>{s.name}</figcaption></figure>)}</div>
    <div className="tw-journal-detail">
      <div><span>我的选择</span><p>{state.choices.map(c => c.label).join('；') || '这次还没有留下审美选择'}</p></div>
      <div><span>我的发现</span><p>{state.observations.length ? state.observations.map(o => `${definition.scenes.find(s => s.interaction?.id === o.interactionId)?.title ?? '观察发现'} · 人工确认`).join('；') : '这次没有完成观察任务'}</p></div>
      <div><span>走过的章节</span><ol>{scenes.map(s => <li key={s.id}>{s.title}</li>)}</ol></div>
    </div>
    {state.observations.some(o => o.discovery) && <section className="tw-my-discoveries" aria-label="我的观察记录"><h2>我想记住的细节</h2>{state.observations.map((o, index) => {
      if (!o.discovery) return null
      const scene = definition.scenes.find(s => s.interaction?.id === o.interactionId)
      const spot = pkg.spots.find(s => s.id === scene?.spotId)
      const image = scene?.blocks.find(b => b.type === 'image')?.assetRef ?? spot?.image
      return <article className="tw-discovery-entry" key={`${o.interactionId}:${index}`}>
        {image && <DiscoveryPhoto src={resolveMediaUrl(pkg, image)} title={spot?.name ?? '我的发现'} discovery={o.discovery} />}
        <div><small>{spot?.name ?? scene?.title} · 手动记录</small><h3>{discoveryLabels[o.discovery.category]}</h3><p>{o.discovery.note || '这一处细节，是我想带走的风景。'}</p></div>
      </article>
    })}</section>}
    <div className="tw-keepsake-actions"><button className="tw-button tw-primary" onClick={download}><Download size={17} />保存手账卡</button><button className="tw-button" onClick={() => void share()}><Share2 size={17} />分享文字手账</button></div>
    {message && <p className="tw-notice" role="status">{message}</p>}
    {showCopy && <div className="tw-copy-journal"><label htmlFor={copyId}>可复制的文字手账</label><textarea id={copyId} rows={8} readOnly value={journalText(definition, state)} onFocus={e => e.target.select()} /></div>}
    <p className="tw-fineprint">模拟游览 · 文学演绎 · 手账由本次体验事件生成。卡片为 SVG 格式，可用浏览器打开。再次开启会重置本机进度，可以先保存喜欢的这一页。</p>
    <div className="tw-actions"><button className="tw-button" onClick={onRestart}>换个视角，再走一次</button><Link className="tw-button" to="/">返回发现页</Link></div>
  </section>
}
