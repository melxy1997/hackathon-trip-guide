import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertPublishedAttraction } from '../../lib/tourPackage.ts'
import { createStoryState, transition } from '../storyEngine.ts'
import { journalText } from '../journey.ts'
import type { ExperienceEvent } from '../events.ts'

test('planetarium branches run in the existing engine and record three exhibitions without GPS', () => {
  const pkg = assertPublishedAttraction(JSON.parse(readFileSync(new URL('../../../public/data/attractions/shanghai-planetarium.json', import.meta.url), 'utf8')))
  const d = pkg.experience!
  for (const branch of ['origin', 'destination']) {
    let state = createStoryState(d, branch)
    const send = (event: ExperienceEvent) => { const result = transition(d, state, event); assert.deepEqual(result.diagnostics, []); assert.notEqual(result.state, state); state = result.state }
    send({ type: 'START' })
    for (let i = 0; state.phase !== 'completed' && i < 30; i++) {
      const scene = d.scenes.find(s => s.id === state.currentSceneId)!
      const current = { sceneId: scene.id, token: state.playbackToken! }
      if (state.phase === 'awaitingLocation') send({ type: 'LOCATION_ENTER', ...current, spotId: scene.spotId!, source: 'simulated' })
      else if (state.phase === 'playing') send({ type: 'SKIP_SCENE', ...current })
      else if (scene.interaction?.type === 'single_choice') send({ type: 'CHOICE_SELECTED', ...current, interactionId: scene.interaction.id, optionId: branch })
      else if (scene.interaction?.type === 'photo_or_tap') send({ type: 'OBSERVATION_CONFIRMED', ...current, interactionId: scene.interaction.id, method: 'manual', discovery: { category: 'detail', note: `来自${branch}的回信` } })
      else assert.fail(`unexpected phase ${state.phase}`)
    }
    assert.equal(state.phase, 'completed')
    assert.deepEqual(state.visitedSpotIds, ['home', 'universe', 'journey'])
    assert.equal(state.variables.signalView, branch)
    assert.equal(state.observations.length, 1)
    assert.match(journalText(d, state, pkg.presentation), new RegExp(`来自${branch}的回信`))
    assert.equal(state.visitedSceneIds.length, 5)
  }
})
