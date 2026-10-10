import { Link } from 'react-router-dom'
import type { ExperienceDefinitionV1 } from '../experienceSchema'
import type { ExperienceState } from '../storyEngine'
import type { PublishedAttraction } from '../../lib/tourPackage'
import { resolveMediaUrl } from '../../lib/tourPackage'

export function EndingJournal({ pkg, definition, state, onRestart }: { pkg: PublishedAttraction; definition: ExperienceDefinitionV1; state: ExperienceState; onRestart: () => void }) {
  const scenes = state.visitedSceneIds.map(id => definition.scenes.find(s => s.id === id)).filter(s => !!s)
  const spots = state.visitedSpotIds.map(id => pkg.spots.find(s => s.id === id)).filter(s => !!s)
  return (
    <section className="tw-journal" aria-labelledby="journal-title">
      <p className="tw-eyebrow">TIMEWALKER · 旅程留痕</p>
      <h1 id="journal-title">我的时空手账</h1>
      <p className="tw-intro">一园山水，一份想与重要的人分享的风景。</p>
      {state.directorUsed && <p className="tw-notice">本次使用了导演跳幕，以下仅记录实际进入的章节和完成的互动。</p>}
      <div className="tw-journal-images">{spots.slice(0, 3).map(s => <figure key={s.id}><img src={resolveMediaUrl(pkg, s.image)} alt={s.name} /><figcaption>{s.name}</figcaption></figure>)}</div>
      <div className="tw-journal-detail">
        <div><span>我的选择</span><p>{state.choices.map(c => c.label).join('；') || '这次还没有留下审美选择'}</p></div>
        <div><span>我的发现</span><p>{state.observations.length ? state.observations.map(o => `${definition.scenes.find(s => s.interaction?.id === o.interactionId)?.title ?? '观察发现'} · 人工确认`).join('；') : '这次没有完成观察任务'}</p></div>
        <div><span>走过的章节</span><ol>{scenes.map(s => <li key={s.id}>{s.title}</li>)}</ol></div>
      </div>
      <p className="tw-fineprint">模拟游览 · 家书与角色独白为文学创作 · 手账由本次体验事件生成</p>
      <div className="tw-actions"><button className="tw-button tw-primary" onClick={onRestart}>换个视角，再走一次</button><Link className="tw-button" to="/">返回发现页</Link></div>
    </section>
  )
}
