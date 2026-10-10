import { useCallback, useState } from 'react'
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
import '../experience.css'

export function ExperiencePlayer({ pkg, preview, director }: { pkg: PublishedAttraction & { experience: ExperienceDefinitionV1 }; preview: boolean; director: boolean }) {
  const definition = pkg.experience
  const { state, dispatch, events, reset, diagnostics, resumed } = useStory(pkg, preview)
  const [imageError, setImageError] = useState('')
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

  return <div className="tw-experience">
    <header className="tw-header"><Link to={preview ? `/publish/${pkg.id}` : '/'}><ArrowLeft size={16} />{preview ? '返回编辑器' : '时空漫游者'}</Link><span>{preview ? '未发布草稿预览 · ' : ''}模拟游览</span></header>
    {state.phase === 'completed' ? <EndingJournal pkg={pkg} definition={definition} state={state} onRestart={reset} /> : <main className="tw-layout">
      <section className="tw-stage" aria-label="故事舞台">
        {imageError !== image && <img className="tw-backdrop" key={image} src={resolveAsset(image)} alt={spot?.name ?? pkg.name} onError={() => setImageError(image)} />}
        <div className="tw-stage-shade" />
        <div className="tw-stage-content" key={`${token}:${state.phase === 'idle'}`}>
          <p className="tw-eyebrow">{pkg.name.split('｜')[0]} · TIMEWALKER</p>
          {state.phase === 'idle' ? <>
            <p className="tw-volume">一场 {definition.estimatedMinutes} 分钟的故事</p>
            <h1>{definition.title}</h1>
            <p className="tw-intro">{definition.premise}</p>
            <div className="tw-letter"><span>致后来走进这座园林的你</span><p>如果亭台会说话，<br />它们想留下怎样一句话？</p><small>虚构家书 · 艺术演绎</small></div>
            <button className="tw-button tw-primary" onClick={() => send({ type: 'START' })}>开启时空漫游 <ArrowRight size={17} /></button>
          </> : state.phase === 'awaitingLocation' ? <>
            <p className="tw-volume">故事在下一站等你</p><h1>{spot?.name ?? scene?.title}</h1>
            <p className="tw-intro">{scene?.title}</p><p className="tw-fineprint">当前为模拟游览，点击到站会触发地点事件；不使用真实定位。</p>
            <button className="tw-button tw-primary" onClick={() => spot && send({ type: 'LOCATION_ENTER', spotId: spot.id, source: 'simulated', ...sceneEvent })}>模拟到达{spot?.name} <MapPin size={17} /></button>
          </> : <>
            <p className="tw-volume">{spot?.name ?? '故事场景'} · {state.visitedSceneIds.length} 个章节</p>
            <h1>{scene?.title}</h1>
            <div className="tw-narration" aria-live="polite">{textBlocks.map(b => <p key={b.id} className={b.id === block?.id ? 'tw-speaking' : ''}>{b.text}</p>)}</div>
            <p className="tw-fineprint">{textBlocks.some(b => b.fictional) ? '本幕包含文学创作 · 家书与人物独白为艺术演绎' : '文化讲述 · 来源见下方资料说明'}</p>
            {state.phase === 'playing' && <button className="tw-button tw-primary" onClick={() => send({ type: 'SKIP_SCENE', ...sceneEvent })}>{scene?.mode === 'ending' ? '读完家书，收下手账' : interaction ? '读完了，继续探索' : '前往下一站'} <ArrowRight size={17} /></button>}
            {state.phase === 'awaitingInteraction' && interaction?.type === 'single_choice' && <div className="tw-choices" aria-label="选择审美方向"><p>你想怎样理解眼前的园林？</p>{interaction.options.map(o => <button className="tw-choice" key={o.id} onClick={() => send({ type: 'CHOICE_SELECTED', interactionId: interaction.id, optionId: o.id, ...sceneEvent })}>{o.label}<ArrowRight size={16} /></button>)}</div>}
            {state.phase === 'awaitingInteraction' && interaction?.type === 'photo_or_tap' && <div className="tw-observation"><p>细看轮廓、孔洞与光影，试着发现自己的观察角度。</p><span>样例照片观察 · 人工确认</span><button className="tw-button tw-primary" onClick={() => send({ type: 'OBSERVATION_CONFIRMED', interactionId: interaction.id, method: 'manual', ...sceneEvent })}>我已观察，收下这份发现 <ArrowRight size={17} /></button></div>}
            {state.phase === 'error' && <div role="alert"><p>故事暂时无法推进，请重新开启。</p><button className="tw-button" onClick={reset}>重新开启故事</button></div>}
          </>}
          {imageError === image && <p className="tw-fineprint">场景图片暂不可用，文字故事仍可继续。</p>}
        </div>
      </section>
      <aside className="tw-sidebar">
        <div className="tw-controls"><button onClick={narration.toggle} aria-pressed={narration.enabled}>{narration.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}{narration.enabled ? '关闭旁白' : '开启旁白'}</button><button onClick={() => { send({ type: 'REPLAY_SCENE', ...sceneEvent }); narration.replay() }} disabled={!scene || !['playing', 'awaitingInteraction'].includes(state.phase)}><RotateCcw size={15} />重播本幕</button></div>
        {narration.message && <p role="status" className="tw-notice">{narration.message}</p>}
        {resumed && <p className="tw-notice">已恢复本机保存的故事进度；声音需再次点按开启。</p>}
        <details className="tw-route" open><summary>故事路线 <span>模拟地点</span></summary><ol>{pkg.spots.map((s, i) => <li key={s.id} className={spot?.id === s.id ? 'tw-route-active' : ''}><b>{String(i + 1).padStart(2, '0')}</b><div><p>{s.name}</p><small>{state.visitedSpotIds.includes(s.id) ? '已走进故事' : spot?.id === s.id ? '下一站' : '等待探索'}</small></div></li>)}</ol><p className="tw-fineprint">静态站点指引无需地图 Key；路线未经现场核验。<Link to={`/tour/${pkg.id}`}>打开原版地图导览</Link></p></details>
        <details className="tw-sources"><summary>关于家书与资料来源</summary><p>家书不存在于史料中，是连接园林与情感的文学创作。地点和照片沿用豫园原型素材，授权与史实仍需发布前审核。</p>{definition.sources.map(s => <a key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a>)}</details>
        {diagnostics.length > 0 && <p role="alert" className="tw-notice">{diagnostics.join('；')}</p>}
      </aside>
    </main>}
    {director && <DirectorConsole definition={definition} state={state} events={events} send={send} onReset={reset} />}
  </div>
}
