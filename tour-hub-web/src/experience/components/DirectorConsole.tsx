import type { ExperienceDefinitionV1 } from '../experienceSchema'
import type { ExperienceEvent } from '../events'
import type { ExperienceState } from '../storyEngine'

export function DirectorConsole({ definition, state, events, send, onReset }: { definition: ExperienceDefinitionV1; state: ExperienceState; events: ExperienceEvent[]; send: (event: ExperienceEvent) => void; onReset: () => void }) {
  return <details className="tw-director" open>
    <summary>导演控制台 · 模拟事件</summary>
    <p>跳幕会标记本次手账；普通游客入口不显示此控制台。</p>
    <div className="tw-director-buttons">{definition.scenes.map(s => <button key={s.id} disabled={state.phase === 'idle'} onClick={() => send({ type: 'DIRECTOR_JUMP', sceneId: s.id })}>{s.title}</button>)}</div>
    <button onClick={onReset}>重置本次体验</button>
    <pre data-testid="engine-state">{JSON.stringify({ phase: state.phase, scene: state.currentSceneId, variables: state.variables, memories: state.memoryIds, token: state.playbackToken }, null, 2)}</pre>
    <ol>{events.slice(-8).map((e, i) => <li key={events.length - 8 + i}>{e.type}{'sceneId' in e ? ` · ${e.sceneId}` : ''}</li>)}</ol>
  </details>
}
