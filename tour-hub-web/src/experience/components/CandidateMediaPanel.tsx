import { useState } from 'react'
import type { AgentCandidate } from '../agent/contracts'
import { resolveMediaUrl, type PublishedAttraction } from '../../lib/tourPackage'

function ChapterImage({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? <p className="flex min-h-40 items-center justify-center rounded-lg bg-slate-100 p-4 text-sm text-slate-500">当前配图暂不可用，文字故事仍可继续。</p>
    : <img src={src} alt={`${title} · 当前配图`} onError={() => setFailed(true)} className="max-h-80 w-full rounded-lg bg-slate-100 object-contain" />
}

export function CandidateMediaPanel({ candidate, pkg, disabled, generating, onGenerate, onCancel }: {
  candidate: AgentCandidate
  pkg: PublishedAttraction
  disabled: boolean
  generating: boolean
  onGenerate: (sceneId: string, artDirection: string) => void
  onCancel: () => void
}) {
  const scenes = candidate.experience.scenes.filter(scene => scene.blocks.some(block => block.type === 'image'))
  const [sceneId, setSceneId] = useState('')
  const [artDirection, setArtDirection] = useState('')
  const [consentFor, setConsentFor] = useState('')
  const scene = scenes.find(scene => scene.id === sceneId) ?? scenes[0]
  if (!scene) return null
  const consentKey = JSON.stringify([candidate.experience, scene.id, artDirection])
  const consent = consentFor === consentKey
  const block = scene.blocks.find(block => block.type === 'image')!
  const assets = { ...(pkg.assets ?? {}), ...Object.fromEntries(candidate.resourceManifest.resources.map(resource => [resource.assetRef, resource.value])) }
  const src = resolveMediaUrl({ assets }, block.assetRef!)
  const added = candidate.resourceManifest.resources.some(resource => resource.assetRef === block.assetRef || resource.value === block.assetRef)
  const field = 'mt-1 min-h-11 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm'
  return <section className="mt-5 rounded-xl border border-indigo-100 p-4" aria-label="章节配图">
    <h4 className="font-medium">为故事补一张关键画面</h4>
    <p className="mt-1 text-sm text-gray-500">选择一幕生成插画；完成后仍可在编辑器调整。</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div><ChapterImage key={src} src={src} title={scene.title} /><p className="mt-2 text-xs text-gray-500">{added ? '新增素材' : '已有配图'} · {scene.title}</p></div>
      <fieldset disabled={disabled} className="min-w-0 space-y-3">
        <label className="block text-sm">配图章节<select className={field} value={scene.id} onChange={event => { setSceneId(event.target.value); setConsentFor('') }}>{scenes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label className="block text-sm">画面补充要求（可选）<textarea className={`${field} min-h-24`} maxLength={600} placeholder="例如：突出星云中的一道微弱回信，保留安静的深蓝色调。" value={artDirection} onChange={event => { setArtDirection(event.target.value); setConsentFor('') }} /></label>
        <label className="flex min-h-11 items-start gap-2 text-sm"><input className="mt-1 size-4 shrink-0" type="checkbox" checked={consent} onChange={event => setConsentFor(event.target.checked ? consentKey : '')} /><span>允许本次调用已配置的生图服务（可能计费）</span></label>
        <button type="button" disabled={disabled || !consent} className="min-h-11 rounded-lg bg-indigo-700 px-4 text-sm text-white disabled:opacity-40" onClick={() => { setConsentFor(''); onGenerate(scene.id, artDirection) }}>{generating ? '正在生成插画…' : '为本章生成插画'}</button>
        <p className="text-xs text-gray-500">每次一张，相同要求可复用缓存。取消等待不保证撤销供应商计费；失败仍保留原图。</p>
      </fieldset>
    </div>
    {generating && <button type="button" onClick={onCancel} className="mt-3 min-h-11 text-sm underline">停止等待配图</button>}
  </section>
}
