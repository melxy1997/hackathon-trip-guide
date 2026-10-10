import { useState } from 'react'
import { Link } from 'react-router-dom'
import { assertExperience, type ExperienceDefinitionV1, type Scene } from '../experienceSchema'
import type { DraftAttraction } from '../../types/attraction'

export function StoryEditor({ draft, onChange }: { draft: DraftAttraction & { experience: ExperienceDefinitionV1 }; onChange: (experience: ExperienceDefinitionV1) => void }) {
  const [selectedId, setSelectedId] = useState(draft.experience.initialSceneId)
  const definition = draft.experience
  const scene = definition.scenes.find(s => s.id === selectedId) ?? definition.scenes[0]
  const updateScene = (patch: Partial<Scene>) => onChange({ ...definition, scenes: definition.scenes.map(s => s.id === scene.id ? { ...s, ...patch } : s) })
  let validation = '结构与分支校验通过；史实和素材授权仍须人工审核。'
  let valid = true
  try { assertExperience(definition, { spotIds: draft.spots.map(s => s.id) }) }
  catch (e) { valid = false; validation = e instanceof Error ? e.message : '故事结构无效' }
  const field = 'mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm'
  return <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-8 bg-[#f7f8fa]">
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6"><div><h2 className="text-xl font-medium">故事编排</h2><p className="text-sm text-gray-500 mt-2">同一体验包驱动游客故事；修改先保存到本机草稿，发布前会再次校验。</p></div><Link to={`/experience/${draft.id}?preview=1&director=1`} className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm">预览草稿故事</Link></div>
      <p className={`rounded-xl p-4 text-sm whitespace-pre-wrap mb-6 ${valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`} role="status">{validation}</p>
      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        <aside className="space-y-2">{definition.scenes.map(s => <button key={s.id} onClick={() => setSelectedId(s.id)} className={`block w-full text-left rounded-xl border p-3 ${s.id === scene.id ? 'bg-[#17251d] text-white border-[#17251d]' : 'bg-white border-black/10'}`}><span className="block text-sm">{s.title}</span><span className="block text-xs mt-1 opacity-60">{s.id} · {s.mode}</span></button>)}</aside>
        <section className="space-y-5 bg-white rounded-xl border border-black/10 p-5">
          <label className="block text-sm">章节标题<input className={field} value={scene.title} onChange={e => updateScene({ title: e.target.value })} /></label>
          <label className="block text-sm">绑定地点<select className={field} value={scene.spotId ?? ''} onChange={e => updateScene({ spotId: e.target.value || undefined })}><option value="">虚拟故事场景</option>{draft.spots.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
          {scene.blocks.filter(b => b.type === 'narration' || b.type === 'caption').map(b => <label key={b.id} className="block text-sm">{b.type === 'narration' ? '章节旁白' : '字幕'} · {b.fictional ? '文学创作' : '有来源的文化讲述'}<textarea className={field} rows={6} value={b.text ?? ''} onChange={e => updateScene({ blocks: scene.blocks.map(block => block.id === b.id ? { ...block, text: e.target.value } : block) })} /><span className="text-xs text-gray-500">{b.sourceIds?.map(id => definition.sources.find(s => s.id === id)?.title).join('；') || '明确标记为文学创作'}</span></label>)}
          {scene.interaction?.type === 'single_choice' && <div className="space-y-3"><h3 className="text-sm font-medium">分支选择</h3>{scene.interaction.options.map(o => <div key={o.id} className="border border-black/10 rounded-lg p-3"><p className="text-xs text-gray-500 mb-2">{o.id} → {o.actions.find(a => a.type === 'goTo')?.sceneId}</p><input aria-label={`选项 ${o.id}`} className={field} value={o.label} onChange={e => { const it = scene.interaction; if (it?.type === 'single_choice') updateScene({ interaction: { ...it, options: it.options.map(option => option.id === o.id ? { ...option, label: e.target.value } : option) } }) }} /></div>)}</div>}
          {scene.interaction?.type === 'photo_or_tap' && <p className="text-sm text-gray-500">本幕使用人工观察确认；完成后转至 {scene.interaction.actionsOnComplete.find(a => a.type === 'goTo')?.sceneId}。本轮未接在线视觉识别。</p>}
          {scene.transitions?.length === 1 && !scene.transitions[0].when && <label className="block text-sm">下一章节<select className={field} value={scene.transitions[0].to} onChange={e => updateScene({ transitions: [{ to: e.target.value }] })}>{definition.scenes.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
        </section>
      </div>
    </div>
  </div>
}
