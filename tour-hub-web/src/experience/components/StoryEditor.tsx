import { useState } from 'react'
import { Link } from 'react-router-dom'
import { assertExperience, type ExperienceDefinitionV1, type Scene, type Action } from '../experienceSchema'
import { validationSuggestion } from '../builder'
import { approveStoryDraft } from '../builderDraft'
import type { DraftAttraction } from '../../types/attraction'

export function StoryEditor({ draft, onChange, onReview }: {
  draft: DraftAttraction & { experience: ExperienceDefinitionV1 }
  onChange: (experience: ExperienceDefinitionV1) => void
  onReview: (review: DraftAttraction['storyReview']) => void
}) {
  const [selectedId, setSelectedId] = useState(draft.experience.initialSceneId)
  const [reviewChecked, setReviewChecked] = useState(false)
  const definition = draft.experience
  const scene = definition.scenes.find(s => s.id === selectedId) ?? definition.scenes[0]
  const change = (next: ExperienceDefinitionV1) => { setReviewChecked(false); onChange(next) }
  const updateScene = (patch: Partial<Scene>) => change({ ...definition, scenes: definition.scenes.map(s => s.id === scene.id ? { ...s, ...patch } : s) })
  let validation = '结构与分支校验通过；史实和素材授权仍须人工审核。'
  let valid = true
  try { assertExperience(definition, { spotIds: draft.spots.map(s => s.id) }) }
  catch (e) { valid = false; validation = e instanceof Error ? e.message : '故事结构无效' }
  const field = 'mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm'
  const targetOptions = <>{definition.scenes.map(s => <option key={s.id} value={s.id}>{s.title} · {s.id}</option>)}</>
  const goto = (actions: Action[], target: string): Action[] => [...actions.filter(a => a.type !== 'goTo'), { type: 'goTo', sceneId: target }]
  const targets = (s: Scene): string[] => s.interaction?.type === 'single_choice' ? s.interaction.options.flatMap(o => o.actions.flatMap(a => a.type === 'goTo' ? [a.sceneId] : []))
    : s.interaction?.type === 'photo_or_tap' ? s.interaction.actionsOnComplete.flatMap(a => a.type === 'goTo' ? [a.sceneId] : []) : s.transitions?.map(t => t.to) ?? []
  return <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-8 bg-[#f7f8fa]">
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6"><div><h2 className="text-xl font-medium">故事编排</h2><p className="text-sm text-gray-500 mt-2">修改保存到本机草稿，预览复用正式播放器；候选稿须审核后发布。</p></div><Link to={`/experience/${draft.id}?preview=1&director=1`} className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm">预览草稿故事</Link></div>
      <div className={`rounded-xl p-4 text-sm whitespace-pre-wrap mb-5 ${valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`} role="status">{validation}{!valid && <p className="mt-3 font-medium">修复建议：{validationSuggestion(validation)}</p>}</div>
      <section className="bg-white rounded-xl border border-black/10 p-5 mb-5 space-y-4">
        <div className="grid sm:grid-cols-[1fr_160px] gap-4"><label className="text-sm">故事标题<input className={field} value={definition.title} onChange={e => change({ ...definition, title: e.target.value })} /></label><label className="text-sm">目标时长（分钟）<input type="number" min={1} max={240} className={field} value={definition.estimatedMinutes} onChange={e => change({ ...definition, estimatedMinutes: Number(e.target.value) })} /></label></div>
        <label className="block text-sm">故事梗概<textarea className={field} rows={2} value={definition.premise} onChange={e => change({ ...definition, premise: e.target.value })} /></label>
        <p className="text-sm">审核状态：<strong>{draft.storyReview?.status === 'approved' ? '人工审核已确认' : '待人工审核'}</strong>{draft.storyReview?.generatedBy && <span className="text-gray-500"> · {draft.storyReview.generatedBy === 'online' ? '在线模型起稿' : draft.storyReview.generatedBy === 'template' ? '本地模板起稿' : '人工编写'}</span>}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewChecked} onChange={e => setReviewChecked(e.target.checked)} className="mt-1" />我已核对事实与来源、虚构标注、地点顺序和素材授权，并完成两条分支预览。</label>
        <button disabled={!valid || !reviewChecked} onClick={() => { onReview(approveStoryDraft(draft).storyReview); setReviewChecked(false) }} className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm disabled:opacity-40">确认人工审核</button><p className="text-xs text-gray-500">修改故事、地点、图片或景点信息后，审核会重置。结构校验不代替史实与授权审核。</p>
      </section>
      <details className="rounded-xl border border-black/10 bg-white p-4 mb-5"><summary className="text-sm cursor-pointer">章节连接与来源管理</summary>
        <div className="space-y-2 mt-4 text-sm">{definition.scenes.map(s => <button className="block text-left text-gray-600 break-words" onClick={() => setSelectedId(s.id)} key={s.id}>{s.id}（{s.title}） → {targets(s).join(' / ') || '终幕'}{s.id === definition.initialSceneId ? ' · 起点' : ''}</button>)}</div>
        <div className="space-y-4 mt-5">{definition.sources.map(source => <div className="rounded-lg border border-black/10 p-3" key={source.id}><p className="text-xs text-gray-500">来源 {source.id}</p><label className="block text-sm">来源标题<input className={field} value={source.title} onChange={e => change({ ...definition, sources: definition.sources.map(s => s.id === source.id ? { ...s, title: e.target.value } : s) })} /></label><label className="block text-sm mt-2">来源网址（HTTPS）<input className={field} value={source.url} onChange={e => change({ ...definition, sources: definition.sources.map(s => s.id === source.id ? { ...s, url: e.target.value } : s) })} /></label><label className="block text-sm mt-2">来源类型<select className={field} value={source.authority} onChange={e => change({ ...definition, sources: definition.sources.map(s => s.id === source.id ? { ...s, authority: e.target.value as 'official' | 'secondary' } : s) })}><option value="official">官方</option><option value="secondary">二级资料</option></select></label><button className="text-xs text-red-700 mt-3" onClick={() => change({ ...definition, sources: definition.sources.filter(s => s.id !== source.id) })}>删除来源（需同步修复旁白引用）</button></div>)}</div>
        <button className="text-sm underline mt-4" onClick={() => change({ ...definition, sources: [...definition.sources, { id: `source-${crypto.randomUUID()}`, title: '待填写并核验的资料', url: '', authority: 'secondary' }] })}>添加人工来源</button>
      </details>
      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        <aside className="space-y-2">{definition.scenes.map(s => <button key={s.id} onClick={() => setSelectedId(s.id)} className={`block w-full text-left rounded-xl border p-3 ${s.id === scene.id ? 'bg-[#17251d] text-white border-[#17251d]' : 'bg-white border-black/10'}`}><span className="block text-sm">{s.title}</span><span className="block text-xs mt-1 opacity-60">{s.id} · {s.mode}</span></button>)}</aside>
        <section className="space-y-5 bg-white rounded-xl border border-black/10 p-5">
          <label className="block text-sm">章节标题<input className={field} value={scene.title} onChange={e => updateScene({ title: e.target.value })} /></label>
          <label className="block text-sm">绑定地点<select className={field} value={scene.spotId ?? ''} onChange={e => updateScene({ spotId: e.target.value || undefined })}><option value="">虚拟故事场景</option>{draft.spots.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
          {scene.blocks.filter(b => b.type === 'narration' || b.type === 'caption').map(b => <div key={b.id} className="space-y-2"><label className="block text-sm">{b.type === 'narration' ? '章节旁白' : '字幕'} · {b.fictional ? '文学创作' : '有来源的文化讲述'}<textarea className={field} rows={6} value={b.text ?? ''} onChange={e => updateScene({ blocks: scene.blocks.map(block => block.id === b.id ? { ...block, text: e.target.value } : block) })} /></label>
            <label className="flex gap-2 text-xs text-gray-600"><input type="checkbox" checked={b.fictional === true} onChange={e => updateScene({ blocks: scene.blocks.map(block => block.id === b.id ? { ...block, fictional: e.target.checked } : block) })} />文学创作（人物、情节或自由联想）</label>
            <p className="text-xs text-gray-500">关联来源：{!definition.sources.length && '暂无；请先添加并核验资料。'}</p>{definition.sources.map(source => <label className="flex gap-2 text-xs text-gray-600" key={source.id}><input type="checkbox" checked={b.sourceIds?.includes(source.id) ?? false} onChange={e => updateScene({ blocks: scene.blocks.map(block => block.id === b.id ? { ...block, sourceIds: e.target.checked ? [...(block.sourceIds ?? []), source.id] : block.sourceIds?.filter(id => id !== source.id) } : block) })} />{source.title}</label>)}
          </div>)}
          {scene.blocks.filter(b => b.type === 'image').map(b => <label className="block text-sm" key={b.id}>场景图片<select className={field} value={b.assetRef ?? ''} onChange={e => updateScene({ blocks: scene.blocks.map(block => block.id === b.id ? { ...block, assetRef: e.target.value } : block) })}><option value={b.assetRef}>当前素材</option>{draft.spots.map(s => <option key={s.id} value={s.image}>{s.name}</option>)}</select></label>)}
          {scene.interaction?.type === 'single_choice' && <div className="space-y-3"><h3 className="text-sm font-medium">分支选择</h3>{scene.interaction.options.map(o => <div key={o.id} className="border border-black/10 rounded-lg p-3"><input aria-label={`选项 ${o.id}`} className={field} value={o.label} onChange={e => { const it = scene.interaction; if (it?.type === 'single_choice') updateScene({ interaction: { ...it, options: it.options.map(option => option.id === o.id ? { ...option, label: e.target.value } : option) } }) }} /><label className="block text-sm mt-2">选项说明（选填）<input className={field} maxLength={240} value={o.description ?? ''} onChange={e => { const it = scene.interaction; if (it?.type === 'single_choice') updateScene({ interaction: { ...it, options: it.options.map(option => option.id === o.id ? { ...option, description: e.target.value || undefined } : option) } }) }} /></label><label className="block text-sm mt-2">选项 {o.id} 的下一章<select className={field} value={o.actions.find(a => a.type === 'goTo')?.sceneId ?? ''} onChange={e => { const it = scene.interaction; if (it?.type === 'single_choice') updateScene({ interaction: { ...it, options: it.options.map(option => option.id === o.id ? { ...option, actions: goto(option.actions, e.target.value) } : option) } }) }}>{targetOptions}</select></label></div>)}</div>}
          {scene.interaction?.type === 'photo_or_tap' && <label className="block text-sm">人工观察确认后的下一章<select className={field} value={scene.interaction.actionsOnComplete.find(a => a.type === 'goTo')?.sceneId ?? ''} onChange={e => { const it = scene.interaction; if (it?.type === 'photo_or_tap') updateScene({ interaction: { ...it, actionsOnComplete: goto(it.actionsOnComplete, e.target.value) } }) }}>{targetOptions}</select><span className="text-xs text-gray-500">游客自行观察并确认，本轮未接在线视觉识别。</span></label>}
          {scene.transitions?.map((t, i) => <label className="block text-sm" key={i}>下一章节{t.when ? `（${t.when.var} ${t.when.op} ${JSON.stringify(t.when.value)}）` : '（兜底）'}<select className={field} value={t.to} onChange={e => updateScene({ transitions: scene.transitions?.map((transition, j) => i === j ? { ...transition, to: e.target.value } : transition) })}>{targetOptions}</select></label>)}
        </section>
      </div>
    </div>
  </div>
}
