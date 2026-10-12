import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture } from './fixtures.ts'
import { addStoryScene, connectStoryRoute, deleteStoryScene, duplicateStoryScene, storyDepths, storyRoutes } from '../storyGraph.ts'

const definition = () => structuredClone(fixture().definition)

test('story graph exposes every transition, choice and observation route', () => {
  const routes = storyRoutes(definition())
  assert.ok(routes.some(route => route.handle === 'choice:nature' && route.target === 'jade-nature'))
  assert.ok(routes.some(route => route.handle === 'choice:craft' && route.target === 'jade-craft'))
  assert.ok(routes.some(route => route.handle === 'observation' && route.source === 'jade-nature'))
  assert.ok(routes.some(route => route.handle === 'transition:0' && route.source === 'prologue'))
})

test('story graph assigns reachable depths from the initial scene', () => {
  const draft = definition()
  const depths = storyDepths(draft)
  assert.equal(depths.get(draft.initialSceneId), 0)
  assert.ok((depths.get('epilogue') ?? 0) > 0)
})

test('add creates a unique minimal scene routed to the ending', () => {
  const draft = definition()
  const first = addStoryScene(draft)
  const second = addStoryScene(first.definition)
  assert.notEqual(first.sceneId, second.sceneId)
  const scene = first.definition.scenes.find(item => item.id === first.sceneId)
  assert.equal(scene?.blocks[0].fictional, true)
  assert.equal(scene?.transitions?.[0].to, 'epilogue')
})

test('duplicate deep copies scene, block, interaction and option ids', () => {
  const draft = definition()
  const result = duplicateStoryScene(draft, 'rockery')
  const source = draft.scenes.find(scene => scene.id === 'rockery')!
  const copy = result.definition.scenes.find(scene => scene.id === result.sceneId)!
  assert.notEqual(copy.id, source.id)
  assert.notEqual(copy.blocks[0].id, source.blocks[0].id)
  assert.notEqual(copy.interaction?.id, source.interaction?.id)
  if (copy.interaction?.type !== 'single_choice' || source.interaction?.type !== 'single_choice') assert.fail('expected choices')
  assert.notDeepEqual(copy.interaction.options.map(option => option.id), source.interaction.options.map(option => option.id))
  copy.blocks[0].text = 'changed'
  assert.notEqual(source.blocks[0].text, 'changed')
})

test('connect replaces only the addressed route and preserves side effects', () => {
  const draft = definition()
  const result = connectStoryRoute(draft, 'rockery', 'choice:nature', 'epilogue')
  const interaction = result.scenes.find(scene => scene.id === 'rockery')?.interaction
  if (interaction?.type !== 'single_choice') assert.fail('expected choice')
  const nature = interaction.options.find(option => option.id === 'nature')!
  const craft = interaction.options.find(option => option.id === 'craft')!
  assert.equal(nature.actions.find(action => action.type === 'goTo')?.sceneId, 'epilogue')
  assert.ok(nature.actions.some(action => action.type === 'setVar'))
  assert.equal(craft.actions.find(action => action.type === 'goTo')?.sceneId, 'jade-craft')
})

test('connect handles ordinary and observation routes and rejects endings', () => {
  let draft = connectStoryRoute(definition(), 'prologue', 'transition:0', 'epilogue')
  assert.equal(draft.scenes.find(scene => scene.id === 'prologue')?.transitions?.[0].to, 'epilogue')
  draft = connectStoryRoute(draft, 'jade-nature', 'observation', 'epilogue')
  const interaction = draft.scenes.find(scene => scene.id === 'jade-nature')?.interaction
  if (interaction?.type !== 'photo_or_tap') assert.fail('expected observation')
  assert.equal(interaction.actionsOnComplete.find(action => action.type === 'goTo')?.sceneId, 'epilogue')
  assert.throws(() => connectStoryRoute(draft, 'epilogue', 'transition:0', 'prologue'), /终幕/)
})

test('delete protects initial and inbound-linked scenes but removes a safe scene', () => {
  const draft = definition()
  assert.throws(() => deleteStoryScene(draft, draft.initialSceneId), /开始章节/)
  assert.throws(() => deleteStoryScene(draft, 'epilogue'), /指向本章/)
  const added = addStoryScene(draft)
  const detached = connectStoryRoute(added.definition, added.sceneId, 'transition:0', added.sceneId)
  assert.equal(deleteStoryScene(detached, added.sceneId).scenes.length, draft.scenes.length)
})
