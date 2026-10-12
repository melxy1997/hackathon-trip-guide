import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, MapPin, Volume2, VolumeX, RotateCcw } from 'lucide-react'
import { resolveMediaUrl, type PublishedAttraction } from '../../lib/tourPackage'
import type { ExperienceDefinitionV1 } from '../experienceSchema'
import type { ExperienceEvent } from '../events'
import { narrationBlocks } from '../storyEngine'
import { useStory } from '../useStory'
import { useNarration } from '../useNarration'
import { EndingJournal } from './EndingJournal'
import { DirectorConsole } from './DirectorConsole'
import { ObservationCard } from './ObservationCard'
import { discoveryLabels, journeyProgress } from '../journey'
import { OfflineDemoPanel } from '../../offline/OfflineDemoPanel'
import '../experience.css'

export function ExperiencePlayer({ pkg, preview, director }: { pkg: PublishedAttraction & { experience: ExperienceDefinitionV1 }; preview: boolean; director: boolean }) {
  const definition = pkg.experience
  const { state, dispatch, events, reset, diagnostics, resumed } = useStory(pkg, preview)
  const [imageError, setImageError] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const interactionRef = useRef<HTMLDivElement>(null)
  const scene = definition.scenes.find(s => s.id === state.currentSceneId)
  const spot = pkg.spots.find(s => s.id === scene?.spotId)
  const token = state.playbackToken ?? ''
  const send = useCallback((event: ExperienceEvent) => dispatch(event), [dispatch])
  const resolveAsset = useCallback((ref: string) => resolveMediaUrl(pkg, ref), [pkg])
  const block = state.phase === 'playing' && scene ? narrationBlocks(scene).find(b => !state.completedBlockIds.includes(b.id)) : undefined
  const narration = useNarration(block, scene?.id ?? '', token, send, resolveAsset)
  const image = scene?.blocks.find(b => b.type === 'image')?.assetRef ?? spot?.image ?? pkg.coverImage
  const textBlocks = scene?.blocks.filter(b => b.type === 'narration' || b.type === 'caption') ?? []
  const sceneEvent = { sceneId: scene?.id ?? '', token }
  const interaction = scene?.interaction
  const progress = journeyProgress(definition, state)
  const recentChoice = state.choices.at(-1)
  const choiceDefinition = recentChoice ? definition.scenes.find(s => s.interaction?.id === recentChoice.interactionId)?.interaction : undefined
  const chosenOption = choiceDefinition?.type === 'single_choice' ? choiceDefinition.options.find(o => o.id === recentChoice?.optionId) : undefined
  const showChoice = chosenOption?.actions.some(a => a.type === 'goTo' && a.sceneId === scene?.id)
  const lastObservation = state.observations.at(-1)
  const observedScene = definition.scenes.find(s => s.interaction?.id === lastObservation?.interactionId)
  const showDiscovery = observedScene?.interaction?.type === 'photo_or_tap' && observedScene.interaction.actionsOnComplete.some(a => a.type === 'goTo' && a.sceneId === scene?.id)
  const previousSpot = pkg.spots.find(s => s.id === state.visitedSpotIds.at(-1))
  useEffect(() => {
    if (!token || state.phase === 'completed') return
    const target = state.phase === 'awaitingInteraction' ? interactionRef.current : headingRef.current
    target?.focus({ preventScroll: true })
    const rect = target?.getBoundingClientRect()
    if (rect && (rect.top < 110 || rect.bottom > window.innerHeight - 24)) target?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [token, state.phase])

  return <div className="tw-experience">
    <header className="tw-header"><Link to={preview ? `/publish/${pkg.id}?tab=story` : '/'}><ArrowLeft size={16} />{preview ? '返回编辑器' : '时空漫游者'}</Link><span>{preview ? '未发布草稿预览 · ' : ''}模拟游览</span></header>
    {state.phase === 'completed' ? <EndingJournal pkg={pkg} definition={definition} state={state} onRestart={reset} /> : <><div className="tw-playbar">
      <div className="tw-progress" aria-label="探索进度"><span>{progress.visited} / {progress.total} 站 · {state.observations.length} 份发现</span><progress aria-label="已探索地点" max={progress.total || 1} value={progress.visited} /></div>
      <div className="tw-controls"><button onClick={narration.toggle} aria-pressed={narration.enabled}>{narration.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}{narration.enabled ? '关闭旁白' : '开启旁白'}</button><button onClick={() => { send({ type: 'REPLAY_SCENE', ...sceneEvent }); narration.replay() }} disabled={!scene || !['playing', 'awaitingInteraction'].includes(state.phase)}><RotateCcw size={15} />重播本幕</button></div>
    </div><main className="tw-layout">
      <section className="tw-stage" aria-label="故事舞台">
        {imageError !== image && <img className="tw-backdrop" key={image} src={resolveAsset(image)} alt={spot?.name ?? pkg.name} onError={() => setImageError(image)} />}
        <div className="tw-stage-shade" />
        <div className="tw-stage-content" key={`${token}:${state.phase === 'idle'}`}>
          <p className="tw-eyebrow">{pkg.name.split('｜')[0]} · TIMEWALKER</p>
          {state.phase === 'idle' ? <>
            <p className="tw-volume">一场 {definition.estimatedMinutes} 分钟的故事</p>
            <h1 ref={headingRef} tabIndex={-1}>{definition.title}</h1>
            <p className="tw-intro">{definition.premise}</p>
            <div className="tw-letter"><span>致后来走进这座园林的你</span><p>如果亭台会说话，<br />它们想留下怎样一句话？</p><small>文学创作 · 艺术演绎</small></div>
            <ol className="tw-play-promise"><li><b>01</b>选择你的视角</li><li><b>02</b>留下自己的发现</li><li><b>03</b>收下一张手账</li></ol>
            <button className="tw-button tw-primary" onClick={() => send({ type: 'START' })}>开启时空漫游 <ArrowRight size={17} /></button>
          </> : state.phase === 'awaitingLocation' ? <>
            <p className="tw-volume">故事在下一站等你</p><h1 ref={headingRef} tabIndex={-1}>{spot?.name ?? scene?.title}</h1>
            <p className="tw-intro">{scene?.title}</p><div className="tw-travel-card"><MapPin size={20} /><div><small>下一段故事</small><p>{previousSpot?.name ?? '故事起点'} <ArrowRight size={14} /> {spot?.name}</p></div></div>
            {showChoice && <p className="tw-choice-echo" role="status">你的选择「{recentChoice?.label}」已记入手账。{chosenOption?.description ?? '下一幕将沿着这份好奇继续。'}</p>}
            {showDiscovery && <p className="tw-choice-echo" role="status">已收下你的发现{lastObservation?.discovery ? `「${discoveryLabels[lastObservation.discovery.category]}」` : ''}，这份观察将在结局的手账里等你。</p>}
            <p className="tw-fineprint">当前为模拟游览，点击到站会触发地点事件；不使用真实定位。</p>
            <button className="tw-button tw-primary" onClick={() => spot && send({ type: 'LOCATION_ENTER', spotId: spot.id, source: 'simulated', ...sceneEvent })}>模拟到达{spot?.name} <MapPin size={17} /></button>
          </> : <>
            <p className="tw-volume">{spot?.name ?? '故事场景'} · {state.visitedSceneIds.length} 个章节</p>
            <h1 ref={headingRef} tabIndex={-1}>{scene?.title}</h1>
            {showChoice && <p className="tw-choice-echo">沿着你选择的「{recentChoice?.label}」继续探索</p>}
            <div className="tw-narration" aria-live="polite">{textBlocks.map(b => <p key={b.id} className={b.id === narration.playingBlockId ? 'tw-speaking' : ''}>{b.text}</p>)}</div>
            <p className="tw-fineprint">{textBlocks.some(b => b.fictional) ? '本幕包含文学创作 · 家书与人物独白为艺术演绎' : '文化讲述 · 来源见下方资料说明'}</p>
            {state.phase === 'playing' && <button className="tw-button tw-primary" onClick={() => send({ type: 'SKIP_SCENE', ...sceneEvent })}>{scene?.mode === 'ending' ? '读完家书，收下手账' : interaction ? '读完了，继续探索' : '前往下一站'} <ArrowRight size={17} /></button>}
            {state.phase === 'awaitingInteraction' && interaction?.type === 'single_choice' && <div className="tw-choices" aria-label="选择探索方向" ref={interactionRef} tabIndex={-1}><p>你想带着哪一种目光继续？<small>没有标准答案，下一幕会因你的选择而不同。</small></p>{interaction.options.map(o => <button className="tw-choice" key={o.id} aria-label={o.label} aria-describedby={o.description ? `${scene?.id}-${o.id}-detail` : undefined} onClick={() => send({ type: 'CHOICE_SELECTED', interactionId: interaction.id, optionId: o.id, ...sceneEvent })}><span>{o.label}{o.description && <small id={`${scene?.id}-${o.id}-detail`}>{o.description}</small>}</span><ArrowRight size={16} /></button>)}</div>}
            {state.phase === 'awaitingInteraction' && interaction?.type === 'photo_or_tap' && <div ref={interactionRef} tabIndex={-1} aria-label="观察探索"><ObservationCard key={token} image={resolveAsset(image)} place={spot?.name ?? scene?.title ?? pkg.name} prompt={interaction.prompt} hints={interaction.hints} onConfirm={discovery => send({ type: 'OBSERVATION_CONFIRMED', interactionId: interaction.id, method: 'manual', ...(discovery ? { discovery } : {}), ...sceneEvent })} /></div>}
            {state.phase === 'error' && <div role="alert"><p>故事暂时无法推进，请重新开启。</p><button className="tw-button" onClick={reset}>重新开启故事</button></div>}
          </>}
          {imageError === image && <p className="tw-fineprint">场景图片暂不可用，文字故事仍可继续。</p>}
        </div>
      </section>
      <aside className="tw-sidebar">
        {!preview && pkg.id === 'yuyuan-timewalker' && <OfflineDemoPanel />}
        {narration.message && <p role="status" className="tw-notice">{narration.message}</p>}
        {resumed && <p className="tw-notice">已恢复本机保存的故事进度；声音需再次点按开启。</p>}
        <details className="tw-route" open><summary>故事路线 <span>模拟地点</span></summary><ol>{pkg.spots.filter(s => progress.spotIds.includes(s.id)).map((s, i) => <li key={s.id} className={spot?.id === s.id ? 'tw-route-active' : ''}><b>{String(i + 1).padStart(2, '0')}</b><div><p>{s.name}</p><small>{state.visitedSpotIds.includes(s.id) ? '已走进故事' : spot?.id === s.id ? '下一站' : '等待探索'}</small></div></li>)}</ol><p className="tw-fineprint">静态站点指引无需地图 Key；路线未经现场核验。<Link to={`/tour/${pkg.id}`}>打开原版地图导览</Link></p></details>
        <details className="tw-sources"><summary>关于故事与资料来源</summary><p>标记为文学创作的人物、情节与自由联想不代表史实。地点和照片沿用所选景点的资料包，授权与史实须由发布者审核。</p>{definition.sources.length ? definition.sources.map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a>) : <p>此故事未关联史实来源，旁白应作为文学创作阅读。</p>}</details>
        {diagnostics.length > 0 && <p role="alert" className="tw-notice">{diagnostics.join('；')}</p>}
      </aside>
    </main></>}
    {director && <DirectorConsole definition={definition} state={state} events={events} send={send} onReset={reset} />}
  </div>
}
