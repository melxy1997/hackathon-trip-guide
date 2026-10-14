import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { assertExperience, ExperienceValidationError, type ExperienceDefinitionV1, type Scene, type Action, type ExperienceDiagnostic } from '../experienceSchema'
import { validationSuggestion } from '../builder'
import { approveStoryDraft } from '../builderDraft'
import { addStoryChoiceOption, addStoryScene, connectStoryRoute, deleteStoryChoiceOption, deleteStoryScene, duplicateStoryScene } from '../storyGraph'
import { StoryGraph } from './StoryGraph'
import { ConfirmDialog } from './ConfirmDialog'
import { PresentationEditor } from './PresentationEditor'
import { assertPresentation, type ExperiencePresentation } from '../presentation'
import { shouldShowStoryEditorOnboarding, writeStoryEditorOnboarding } from '../storyEditorOnboarding'
import type { DraftAttraction } from '../../types/attraction'

export function StoryEditor({ draft, onChange, onReview, onPresentationChange }: {
  draft: DraftAttraction & { experience: ExperienceDefinitionV1 }
  onChange: (experience: ExperienceDefinitionV1) => void
  onReview: (review: DraftAttraction['storyReview']) => void
  onPresentationChange: (presentation: ExperiencePresentation) => void
}) {
  const [selectedId, setSelectedId] = useState(draft.experience.initialSceneId)
  const [reviewChecked, setReviewChecked] = useState(false)
  const [graphMessage, setGraphMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'scene' | 'option'; id: string; label: string } | null>(null)
  const [undo, setUndo] = useState<{ definition: ExperienceDefinitionV1; selectedId: string; message: string } | null>(null)
  const [onboardingStep, setOnboardingStep] = useState(() => shouldShowStoryEditorOnboarding(typeof window === 'undefined' ? null : window.localStorage) ? 0 : -1)
  const inspectorRef = useRef<HTMLElement>(null)
  const definition = draft.experience
  const scene = definition.scenes.find(s => s.id === selectedId) ?? definition.scenes[0]
  const change = (next: ExperienceDefinitionV1, preserveUndo = false) => { if (!preserveUndo) setUndo(null); setReviewChecked(false); onChange(next) }
  const selectScene = (id: string, focus = false) => {
    const selected = definition.scenes.find(item => item.id === id)
    setSelectedId(id)
    setGraphMessage(selected ? `已选择「${selected.title}」。` : '')
    if (focus) requestAnimationFrame(() => { inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); inspectorRef.current?.focus({ preventScroll: true }) })
  }
  const confirmDelete = () => {
    if (!pendingDelete) return
    try {
      const snapshot = { definition: structuredClone(definition), selectedId, message: pendingDelete.kind === 'scene' ? `已删除章节「${pendingDelete.label}」` : `已删除选择「${pendingDelete.label}」` }
      const next = pendingDelete.kind === 'scene' ? deleteStoryScene(definition, pendingDelete.id) : deleteStoryChoiceOption(definition, scene.id, pendingDelete.id)
      change(next, true)
      setUndo(snapshot)
      setGraphMessage(`${snapshot.message}。`)
      if (pendingDelete.kind === 'scene') setSelectedId(next.initialSceneId)
      setPendingDelete(null)
    } catch (error) {
      setGraphMessage(error instanceof Error ? error.message : '删除失败')
      setPendingDelete(null)
    }
  }
  const restoreDelete = () => {
    if (!undo) return
    change(undo.definition, true)
    setSelectedId(undo.selectedId)
    setGraphMessage(`${undo.message}，已撤销。`)
    setUndo(null)
  }
  const graphAction = (action: () => { definition: ExperienceDefinitionV1; sceneId?: string; optionId?: string } | ExperienceDefinitionV1, success: string) => {
    try {
      const result = action()
      const next = 'definition' in result ? result.definition : result
      const nextId = 'sceneId' in result && result.sceneId ? result.sceneId : selectedId
      change(next)
      setSelectedId(nextId)
      setGraphMessage(success)
    } catch (error) {
      setGraphMessage(error instanceof Error ? error.message : '图编辑失败')
    }
  }
  const updateScene = (patch: Partial<Scene>) => change({ ...definition, scenes: definition.scenes.map(s => s.id === scene.id ? { ...s, ...patch } : s) })
  let validation = '结构与分支校验通过；史实和素材授权仍须人工审核。'
  let diagnostics: ExperienceDiagnostic[] = []
  let valid = true
  try { assertExperience(definition, { spotIds: draft.spots.map(s => s.id) }); assertPresentation(draft.presentation) }
  catch (error) { valid = false; validation = error instanceof Error ? error.message : '故事结构无效'; diagnostics = error instanceof ExperienceValidationError ? error.diagnostics : [] }
  const locateDiagnostic = (diagnostic: ExperienceDiagnostic) => {
    if (!diagnostic.sceneId) return
    selectScene(diagnostic.sceneId, true)
    setGraphMessage(`问题已定位到「${definition.scenes.find(item => item.id === diagnostic.sceneId)?.title ?? diagnostic.sceneId}」：${diagnostic.message}`)
  }
  const field = 'mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm'
  const targetOptions = <>{definition.scenes.map(s => <option key={s.id} value={s.id}>{s.title} · {s.id}</option>)}</>
  const goto = (actions: Action[], target: string): Action[] => [...actions.filter(a => a.type !== 'goTo'), { type: 'goTo', sceneId: target }]
  const dismissOnboarding = (completed: boolean) => {
    writeStoryEditorOnboarding(typeof window === 'undefined' ? null : window.localStorage, { dismissed: !completed, completed })
    setOnboardingStep(-1)
  }
  const onboarding = [
    ['从关系图选章节', '点击章节节点即可切换当前编辑对象；红色标记会提示需要修复的结构问题。'],
    ['在编辑区改内容和出口', '修改旁白、地点和分支出口会实时保存到本机草稿。'],
    ['预览、审核与发布', '先预览两条分支并核验素材，再确认人工审核并发布体验。'],
  ] as const
  const targets = (s: Scene): string[] => s.interaction?.type === 'single_choice' ? s.interaction.options.flatMap(o => o.actions.flatMap(a => a.type === 'goTo' ? [a.sceneId] : []))
    : s.interaction?.type === 'photo_or_tap' ? s.interaction.actionsOnComplete.flatMap(a => a.type === 'goTo' ? [a.sceneId] : []) : s.transitions?.map(t => t.to) ?? []
  return <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-8 bg-[#f7f8fa]">
    <div className="max-w-5xl mx-auto">
      {onboardingStep >= 0 && <section className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950" aria-label="故事编排快速引导"><p className="text-xs font-medium text-blue-700">快速引导 · 第 {onboardingStep + 1} 步，共 3 步</p><h3 className="mt-1 font-medium">{onboarding[onboardingStep][0]}</h3><p className="mt-1 text-blue-900">{onboarding[onboardingStep][1]}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded-lg border border-blue-200 bg-white px-3 text-xs" onClick={() => dismissOnboarding(false)}>跳过引导</button>{onboardingStep > 0 && <button type="button" className="min-h-11 rounded-lg border border-blue-200 bg-white px-3 text-xs" onClick={() => setOnboardingStep(onboardingStep - 1)}>上一步</button>}<button type="button" className="min-h-11 rounded-lg bg-blue-700 px-3 text-xs font-medium text-white" onClick={() => onboardingStep === onboarding.length - 1 ? dismissOnboarding(true) : setOnboardingStep(onboardingStep + 1)}>{onboardingStep === onboarding.length - 1 ? '完成引导，不再显示' : '下一步'}</button></div></section>}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6"><div><h2 className="text-xl font-medium">故事编排</h2><p className="text-sm text-gray-500 mt-2">修改保存到本机草稿，预览复用正式播放器；候选稿须审核后发布。</p></div><Link to={`/experience/${draft.id}?preview=1&director=1`} className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm">预览草稿故事</Link></div>
      <div className={`rounded-xl p-4 text-sm whitespace-pre-wrap mb-5 ${valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`} role="status">{validation}{!valid && <><p className="mt-3 font-medium">修复建议：{validationSuggestion(validation)}</p>{diagnostics.some(diagnostic => diagnostic.sceneId) && <div className="mt-3 flex flex-wrap gap-2" aria-label="定位故事结构问题">{diagnostics.filter(diagnostic => diagnostic.sceneId).map((diagnostic, index) => <button key={`${diagnostic.sceneId}-${diagnostic.route?.handle ?? index}`} type="button" className="min-h-11 rounded-lg border border-red-300 bg-white px-3 py-2 text-left text-xs font-medium text-red-800" onClick={() => locateDiagnostic(diagnostic)}>定位：{definition.scenes.find(scene => scene.id === diagnostic.sceneId)?.title ?? diagnostic.sceneId} · {diagnostic.message}</button>)}</div>}</>}</div>
      <section className="rounded-xl border border-black/10 bg-white p-4 mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">章节关系图</h3><p className="mt-1 text-xs text-gray-500">点击节点编辑；从右侧出口拖到目标章节可改跳转。手机上也可继续使用下方选择框。</p></div><div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-black/10 px-3 py-2 text-xs" onClick={() => graphAction(() => addStoryScene(definition), '已新增章节，请完善内容和连接。')}>新增章节</button><button type="button" className="rounded-lg border border-black/10 px-3 py-2 text-xs" onClick={() => graphAction(() => duplicateStoryScene(definition, scene.id), '已复制当前章节。')}>复制章节</button><button type="button" className="min-h-11 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700" onClick={() => setPendingDelete({ kind: 'scene', id: scene.id, label: scene.title })}>删除章节</button></div></div>
        {graphMessage && <p className="text-xs text-amber-800" role="status">{graphMessage}</p>}
        <StoryGraph definition={definition} selectedId={scene.id} diagnostics={diagnostics} onSelect={id => selectScene(id, true)} onConnect={(source, handle, target) => { const sourceScene = definition.scenes.find(item => item.id === source); const route = sourceScene?.interaction?.type === 'single_choice' && handle.startsWith('choice:') ? sourceScene.interaction.options.find(option => `choice:${option.id}` === handle)?.label : '出口'; const targetScene = definition.scenes.find(item => item.id === target); graphAction(() => connectStoryRoute(definition, source, handle, target), `已将「${sourceScene?.title ?? source}」的「${route}」连接到「${targetScene?.title ?? target}」。`) }} />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950"><p><span className="text-xs text-amber-700">正在编辑</span><strong className="ml-2">{scene.title}</strong><span className="ml-2 text-xs opacity-70">{scene.mode}</span></p><button type="button" className="min-h-11 rounded-lg border border-amber-200 bg-white px-3 text-xs font-medium" onClick={() => { inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); inspectorRef.current?.focus({ preventScroll: true }) }}>跳到编辑表单</button></div>
      </section>
      <section className="bg-white rounded-xl border border-black/10 p-5 mb-5 space-y-4">
        <div className="grid sm:grid-cols-[1fr_160px] gap-4"><label className="text-sm">故事标题<input className={field} value={definition.title} onChange={e => change({ ...definition, title: e.target.value })} /></label><label className="text-sm">目标时长（分钟）<input type="number" min={1} max={240} className={field} value={definition.estimatedMinutes} onChange={e => change({ ...definition, estimatedMinutes: Number(e.target.value) })} /></label></div>
        <label className="block text-sm">故事梗概<textarea className={field} rows={2} value={definition.premise} onChange={e => change({ ...definition, premise: e.target.value })} /></label>
        <p className="text-sm">审核状态：<strong>{draft.storyReview?.status === 'approved' ? '人工审核已确认' : '待人工审核'}</strong>{draft.storyReview?.generatedBy && <span className="text-gray-500"> · {draft.storyReview.generatedBy === 'online' ? '在线模型起稿' : draft.storyReview.generatedBy === 'template' ? '本地模板起稿' : draft.storyReview.generatedBy === 'agent' ? '构建智能体起稿' : '人工编写'}</span>}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewChecked} onChange={e => setReviewChecked(e.target.checked)} className="mt-1" />我已核对事实与来源、虚构标注、地点顺序和素材授权，并完成两条分支预览。</label>
        <button disabled={!valid || !reviewChecked} onClick={() => { onReview(approveStoryDraft(draft).storyReview); setReviewChecked(false) }} className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm disabled:opacity-40">确认人工审核</button><p className="text-xs text-gray-500">修改故事、地点、图片或景点信息后，审核会重置。结构校验不代替史实与授权审核。</p>
      </section>
      <PresentationEditor value={draft.presentation} onChange={p => { setReviewChecked(false); setUndo(null); onPresentationChange(p) }} />
      <details className="rounded-xl border border-black/10 bg-white p-4 mb-5"><summary className="text-sm cursor-pointer">章节连接与来源管理</summary>
        <div className="space-y-2 mt-4 text-sm">{definition.scenes.map(s => <button className="block text-left text-gray-600 break-words" onClick={() => setSelectedId(s.id)} key={s.id}>{s.id}（{s.title}） → {targets(s).join(' / ') || '终幕'}{s.id === definition.initialSceneId ? ' · 起点' : ''}</button>)}</div>
        <div className="space-y-4 mt-5">{definition.sources.map(source => <div className="rounded-lg border border-black/10 p-3" key={source.id}><p className="text-xs text-gray-500">来源 {source.id}</p><label className="block text-sm">来源标题<input className={field} value={source.title} onChange={e => change({ ...definition, sources: definition.sources.map(s => s.id === source.id ? { ...s, title: e.target.value } : s) })} /></label><label className="block text-sm mt-2">来源网址（HTTPS）<input className={field} value={source.url} onChange={e => change({ ...definition, sources: definition.sources.map(s => s.id === source.id ? { ...s, url: e.target.value } : s) })} /></label><label className="block text-sm mt-2">来源类型<select className={field} value={source.authority} onChange={e => change({ ...definition, sources: definition.sources.map(s => s.id === source.id ? { ...s, authority: e.target.value as 'official' | 'secondary' } : s) })}><option value="official">官方</option><option value="secondary">二级资料</option></select></label><button className="text-xs text-red-700 mt-3" onClick={() => change({ ...definition, sources: definition.sources.filter(s => s.id !== source.id) })}>删除来源（需同步修复旁白引用）</button></div>)}</div>
        <button className="text-sm underline mt-4" onClick={() => change({ ...definition, sources: [...definition.sources, { id: `source-${crypto.randomUUID()}`, title: '待填写并核验的资料', url: '', authority: 'secondary' }] })}>添加人工来源</button>
      </details>
      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        <aside className="space-y-2">{definition.scenes.map(s => <button key={s.id} className={`block w-full text-left rounded-xl border p-3 transition-colors ${s.id === scene.id ? 'bg-[#17251d] text-white border-[#17251d] ring-2 ring-amber-300 ring-offset-2' : 'bg-white border-black/10'}`} aria-current={s.id === scene.id ? 'true' : undefined} onClick={() => selectScene(s.id)}><span className="block text-sm">{s.title}</span><span className="block text-xs mt-1 opacity-60">{s.id} · {s.mode}</span></button>)}</aside>
        <section ref={inspectorRef} tabIndex={-1} aria-label={`正在编辑章节：${scene.title}`} className="space-y-5 bg-white rounded-xl border border-black/10 p-5 outline-none focus:ring-2 focus:ring-amber-300">
          <h3 className="sr-only">正在编辑章节：{scene.title}</h3>
          <label className="block text-sm">章节标题<input className={field} value={scene.title} onChange={e => updateScene({ title: e.target.value })} /></label>
          <label className="block text-sm">绑定地点<select className={field} value={scene.spotId ?? ''} onChange={e => updateScene({ spotId: e.target.value || undefined })}><option value="">虚拟故事场景</option>{draft.spots.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
          {scene.blocks.filter(b => b.type === 'narration' || b.type === 'caption').map(b => <div key={b.id} className="space-y-2"><label className="block text-sm">{b.type === 'narration' ? '章节旁白' : '字幕'} · {b.fictional ? '文学创作' : '有来源的文化讲述'}<textarea className={field} rows={6} value={b.text ?? ''} onChange={e => updateScene({ blocks: scene.blocks.map(block => block.id === b.id ? { ...block, text: e.target.value } : block) })} /></label>
            <label className="flex gap-2 text-xs text-gray-600"><input type="checkbox" checked={b.fictional === true} onChange={e => updateScene({ blocks: scene.blocks.map(block => block.id === b.id ? { ...block, fictional: e.target.checked } : block) })} />文学创作（人物、情节或自由联想）</label>
            <p className="text-xs text-gray-500">关联来源：{!definition.sources.length && '暂无；请先添加并核验资料。'}</p>{definition.sources.map(source => <label className="flex gap-2 text-xs text-gray-600" key={source.id}><input type="checkbox" checked={b.sourceIds?.includes(source.id) ?? false} onChange={e => updateScene({ blocks: scene.blocks.map(block => block.id === b.id ? { ...block, sourceIds: e.target.checked ? [...(block.sourceIds ?? []), source.id] : block.sourceIds?.filter(id => id !== source.id) } : block) })} />{source.title}</label>)}
          </div>)}
          {scene.blocks.filter(b => b.type === 'image').map(b => <label className="block text-sm" key={b.id}>场景图片<select className={field} value={b.assetRef ?? ''} onChange={e => updateScene({ blocks: scene.blocks.map(block => block.id === b.id ? { ...block, assetRef: e.target.value } : block) })}><option value={b.assetRef}>当前素材</option>{draft.spots.map(s => <option key={s.id} value={s.image}>{s.name}</option>)}</select></label>)}
          {scene.interaction?.type === 'single_choice' && <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">分支选择</h3><button type="button" className="rounded-lg border border-black/10 px-3 py-2 text-xs" onClick={() => graphAction(() => addStoryChoiceOption(definition, scene.id), '已添加新的选择分支。')}>添加选择</button></div>{scene.interaction.options.map(o => <div key={o.id} className="border border-black/10 rounded-lg p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-mono text-gray-400">{o.id}</span><button type="button" className="min-h-11 text-xs text-red-700" aria-label={`删除选择 ${o.label}`} onClick={() => setPendingDelete({ kind: 'option', id: o.id, label: o.label })}>删除选择</button></div><input aria-label={`选项 ${o.id}`} className={field} value={o.label} onChange={e => { const it = scene.interaction; if (it?.type === 'single_choice') updateScene({ interaction: { ...it, options: it.options.map(option => option.id === o.id ? { ...option, label: e.target.value } : option) } }) }} /><label className="block text-sm mt-2">选项说明（选填）<input className={field} maxLength={240} value={o.description ?? ''} onChange={e => { const it = scene.interaction; if (it?.type === 'single_choice') updateScene({ interaction: { ...it, options: it.options.map(option => option.id === o.id ? { ...option, description: e.target.value || undefined } : option) } }) }} /></label><label className="block text-sm mt-2">选项 {o.id} 的下一章<select className={field} value={o.actions.find(a => a.type === 'goTo')?.sceneId ?? ''} onChange={e => { const it = scene.interaction; if (it?.type === 'single_choice') updateScene({ interaction: { ...it, options: it.options.map(option => option.id === o.id ? { ...option, actions: goto(option.actions, e.target.value) } : option) } }) }}>{targetOptions}</select></label></div>)}</div>}
          {scene.interaction?.type === 'photo_or_tap' && <div className="space-y-3"><h3 className="text-sm font-medium">人工观察</h3><label className="block text-sm">主提示（选填）<textarea className={field} rows={2} maxLength={240} value={scene.interaction.prompt ?? ''} onChange={e => { const it = scene.interaction; if (it?.type === 'photo_or_tap') updateScene({ interaction: { ...it, prompt: e.target.value || undefined } }) }} /><span className="text-xs text-gray-500">最多 240 字；留空时播放器使用通用提示。</span></label><div className="space-y-2"><p className="text-sm">轻提示（选填，最多 3 条）</p>{scene.interaction.hints?.map((hint, index) => <div className="flex items-start gap-2" key={index}><input aria-label={`轻提示 ${index + 1}`} className={field} maxLength={80} value={hint} onChange={e => { const it = scene.interaction; if (it?.type === 'photo_or_tap') updateScene({ interaction: { ...it, hints: it.hints?.map((value, i) => i === index ? e.target.value : value) } }) }} /><button type="button" className="shrink-0 text-xs text-red-700 px-2 py-3" onClick={() => { const it = scene.interaction; if (it?.type === 'photo_or_tap') { const hints = it.hints?.filter((_, i) => i !== index); updateScene({ interaction: { ...it, hints: hints?.length ? hints : undefined } }) } }}>删除</button></div>)}{(scene.interaction.hints?.length ?? 0) < 3 && <button type="button" className="text-xs underline" onClick={() => { const it = scene.interaction; if (it?.type === 'photo_or_tap') updateScene({ interaction: { ...it, hints: [...(it.hints ?? []), '新的观察提示'] } }) }}>添加轻提示</button>}</div><label className="block text-sm">人工观察确认后的下一章<select className={field} value={scene.interaction.actionsOnComplete.find(a => a.type === 'goTo')?.sceneId ?? ''} onChange={e => { const it = scene.interaction; if (it?.type === 'photo_or_tap') updateScene({ interaction: { ...it, actionsOnComplete: goto(it.actionsOnComplete, e.target.value) } }) }}>{targetOptions}</select><span className="text-xs text-gray-500">游客自行观察并确认，本轮未接在线视觉识别。</span></label></div>}
          {scene.transitions?.map((t, i) => <label className="block text-sm" key={i}>下一章节{t.when ? `（${t.when.var} ${t.when.op} ${JSON.stringify(t.when.value)}）` : '（兜底）'}<select className={field} value={t.to} onChange={e => updateScene({ transitions: scene.transitions?.map((transition, j) => i === j ? { ...transition, to: e.target.value } : transition) })}>{targetOptions}</select></label>)}
        </section>
      </div>
    </div>
    {pendingDelete && <ConfirmDialog title={`删除「${pendingDelete.label}」？`} description={pendingDelete.kind === 'scene' ? '此章节会立即从本机草稿和关系图中移除。删除后仍可在底部撤销一次。' : '此选择及对应连线会立即移除。删除后仍可在底部撤销一次。'} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />}
    {undo && <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-gray-950 px-4 py-3 text-sm text-white shadow-2xl" role="status"><span>{undo.message}</span><div className="flex shrink-0 gap-1"><button type="button" className="min-h-11 rounded-lg px-3 font-medium text-amber-300" onClick={restoreDelete}>撤销</button><button type="button" className="min-h-11 rounded-lg px-3 text-gray-300" onClick={() => setUndo(null)}>关闭</button></div></div>}
  </div>
}
