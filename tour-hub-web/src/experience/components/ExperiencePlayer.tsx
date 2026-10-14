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
import { resolvePresentation, locationLabel, presentationCopy } from '../presentation'
import { OfflineDemoPanel } from '../../offline/OfflineDemoPanel'
import { offlineDemoIds } from '../../offline/demoStories'
import '../experience.css'

export function ExperiencePlayer({ pkg, preview, director }: { pkg: PublishedAttraction & { experience: ExperienceDefinitionV1 }; preview: boolean; director: boolean }) {
  const definition = pkg.experience
  const presentation = resolvePresentation(pkg.presentation)
  const copy = presentationCopy(presentation)
  const indoor = presentation.locationMode === 'indoor'
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
  const imageCredit = pkg.spots.find(s => resolveAsset(s.image) === resolveAsset(image))?.imageCredit
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

  return <div className="tw-experience" data-preset={presentation.preset} data-motif={presentation.motif}>
    <header className="tw-header"><Link to={preview ? `/publish/${pkg.id}?tab=story` : '/'}><ArrowLeft size={16} />{preview ? '返回编辑器' : '时空漫游者'}</Link><span>{preview ? '未发布草稿预览 · ' : ''}{locationLabel(presentation)}</span></header>
    {state.phase === 'completed' ? <EndingJournal pkg={pkg} definition={definition} state={state} onRestart={reset} /> : <><div className="tw-playbar">
      <div className="tw-progress" aria-label={copy.player.progressAria}><span>{progress.visited} / {progress.total} {presentation.labels.stage} · {state.observations.length} {copy.player.progressItem}</span><progress aria-label={copy.player.progressBarAria} max={progress.total || 1} value={progress.visited} /></div>
      <div className="tw-controls"><button onClick={narration.toggle} aria-pressed={narration.enabled}>{narration.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}{narration.enabled ? '关闭旁白' : '开启旁白'}</button><button onClick={() => { send({ type: 'REPLAY_SCENE', ...sceneEvent }); narration.replay() }} disabled={!scene || !['playing', 'awaitingInteraction'].includes(state.phase)}><RotateCcw size={15} />重播本幕</button></div>
    </div><main className="tw-layout">
      <section className="tw-stage" aria-label={copy.player.stageAria}>
        {imageError !== image && <img className="tw-backdrop" key={image} src={resolveAsset(image)} alt={spot?.name ?? pkg.name} onError={() => setImageError(image)} />}
        <div className="tw-stage-shade" />
        <div className="tw-stage-content" key={`${token}:${state.phase}`}>
          <p className="tw-eyebrow">{pkg.name.split('｜')[0]} · TIMEWALKER</p>
          {state.phase === 'idle' ? <>
            <p className="tw-volume">{copy.player.duration(definition.estimatedMinutes)}</p>
            <h1 ref={headingRef} tabIndex={-1}>{definition.title}</h1>
            <p className="tw-intro">{definition.premise}</p>
            <div className="tw-letter"><span>{presentation.openingTitle}</span><p style={{ whiteSpace: 'pre-line' }}>{presentation.openingText}</p><small>{copy.player.openingNote}</small></div>
            <ol className="tw-play-promise">{copy.player.promises.map((promise, index) => <li key={promise}><b>{String(index + 1).padStart(2, '0')}</b>{promise}</li>)}</ol>
            <button className="tw-button tw-primary" onClick={() => send({ type: 'START' })}>{presentation.labels.start} <ArrowRight size={17} /></button>
          </> : state.phase === 'awaitingLocation' ? <>
            <p className="tw-volume">{copy.player.waiting}</p><h1 ref={headingRef} tabIndex={-1}>{spot?.name ?? scene?.title}</h1>
            <p className="tw-intro">{scene?.title}</p><div className="tw-travel-card"><MapPin size={20} /><div><small>{copy.player.nextSegment}</small><p>{previousSpot?.name ?? copy.player.origin} <ArrowRight size={14} /> {spot?.name}</p></div></div>
            {showChoice && <p className="tw-choice-echo" role="status">{copy.player.choiceSaved(recentChoice?.label ?? '', chosenOption?.description)}</p>}
            {showDiscovery && <p className="tw-choice-echo" role="status">{copy.player.observationSaved(lastObservation?.discovery ? discoveryLabels[lastObservation.discovery.category] : undefined)}</p>}
            <p className="tw-fineprint">{copy.player.locationNote}</p>
            <button className="tw-button tw-primary" onClick={() => spot && send({ type: 'LOCATION_ENTER', spotId: spot.id, source: 'simulated', ...sceneEvent })}>{copy.player.enter}{spot?.name} <MapPin size={17} /></button>
          </> : <>
            <p className="tw-volume">{spot?.name ?? copy.player.sceneFallback} · {state.visitedSceneIds.length} 个章节</p>
            <h1 ref={headingRef} tabIndex={-1}>{scene?.title}</h1>
            {showChoice && <p className="tw-choice-echo">{copy.player.choiceEcho(recentChoice?.label ?? '')}</p>}
            <div className="tw-narration" aria-live="polite">{textBlocks.map(b => <p key={b.id} className={b.id === narration.playingBlockId ? 'tw-speaking' : state.completedBlockIds.includes(b.id) ? 'tw-read' : b.id === block?.id ? 'tw-reading-current' : ''}>{b.text}</p>)}</div>
            <p className="tw-fineprint">{textBlocks.some(b => b.fictional) ? '本幕包含文学创作 · 人物、讯息与情节为艺术演绎' : '文化讲述 · 来源见下方资料说明'}</p>
            {imageCredit && <p className="tw-fineprint">{imageCredit}</p>}
            {state.phase === 'playing' && <button className="tw-button tw-primary" onClick={() => send({ type: 'SKIP_SCENE', ...sceneEvent })}>{scene?.mode === 'ending' ? presentation.labels.finish : interaction ? copy.player.interactionNext : presentation.labels.next} <ArrowRight size={17} /></button>}
            {state.phase === 'awaitingInteraction' && interaction?.type === 'single_choice' && <div className="tw-choices" aria-label={copy.player.choicesAria} ref={interactionRef} tabIndex={-1}><p>{copy.player.choicePrompt}<small>{copy.player.choiceHelp}</small></p>{interaction.options.map(o => <button className="tw-choice" key={o.id} aria-label={o.label} aria-describedby={o.description ? `${scene?.id}-${o.id}-detail` : undefined} onClick={() => send({ type: 'CHOICE_SELECTED', interactionId: interaction.id, optionId: o.id, ...sceneEvent })}><span>{o.label}{o.description && <small id={`${scene?.id}-${o.id}-detail`}>{o.description}</small>}</span><ArrowRight size={16} /></button>)}</div>}
            {state.phase === 'awaitingInteraction' && interaction?.type === 'photo_or_tap' && <div ref={interactionRef} tabIndex={-1} aria-label={copy.player.observationAria}><ObservationCard key={token} image={resolveAsset(image)} place={spot?.name ?? scene?.title ?? pkg.name} prompt={interaction.prompt} hints={interaction.hints} copy={copy.observation} onConfirm={discovery => send({ type: 'OBSERVATION_CONFIRMED', interactionId: interaction.id, method: 'manual', ...(discovery ? { discovery } : {}), ...sceneEvent })} /></div>}
            {state.phase === 'error' && <div role="alert"><p>{copy.player.error}</p><button className="tw-button" onClick={reset}>{copy.player.reset}</button></div>}
          </>}
          {imageError === image && <p className="tw-fineprint">{copy.player.imageError}</p>}
        </div>
      </section>
      <aside className="tw-sidebar">
        {!preview && offlineDemoIds.includes(pkg.id) && <OfflineDemoPanel presentation={presentation} />}
        {narration.message && <p role="status" className="tw-notice">{narration.message}</p>}
        {resumed && <p className="tw-notice">{copy.player.resumed}</p>}
        <details className="tw-route" open><summary>{copy.player.routeTitle} <span>{copy.player.routeMode}</span></summary><ol>{pkg.spots.filter(s => progress.spotIds.includes(s.id)).map((s, i) => <li key={s.id} className={spot?.id === s.id ? 'tw-route-active' : ''}><b>{String(i + 1).padStart(2, '0')}</b><div><p>{s.name}</p><small>{state.visitedSpotIds.includes(s.id) ? copy.player.visited : spot?.id === s.id ? copy.player.current : copy.player.pending}</small></div></li>)}</ol><p className="tw-fineprint">{indoor ? '仅展示讯号顺序；不代表展区距离、馆内位置或已验证路线。' : <>静态站点指引无需地图 Key；路线未经现场核验。<Link to={`/tour/${pkg.id}`}>打开原版地图导览</Link></>}</p></details>
        <details className="tw-sources"><summary>{copy.player.sourcesTitle}</summary><p>标记为文学创作的人物、情节与自由联想不代表史实。地点和配图来自所选资料包；艺术画面不代表场馆实拍或科学观测，来源、授权与史实须由发布者审核。</p>{definition.sources.length ? definition.sources.map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a>) : <p>{copy.player.noSources}</p>}</details>
        {diagnostics.length > 0 && <p role="alert" className="tw-notice">{diagnostics.join('；')}</p>}
      </aside>
    </main></>}
    {director && <DirectorConsole definition={definition} state={state} events={events} send={send} onReset={reset} />}
  </div>
}
