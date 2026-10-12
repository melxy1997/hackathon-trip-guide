import type { Action, ExperienceDefinitionV1, Scene } from './experienceSchema'

export type StoryRoute = {
  id: string
  source: string
  target: string
  handle: string
  label: string
}

const nextId = (base: string, used: Set<string>) => {
  const clean = base.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'item'
  if (!used.has(clean)) return clean
  let suffix = 2
  while (used.has(`${clean}-${suffix}`)) suffix++
  return `${clean}-${suffix}`
}

const targetOf = (actions: Action[]) => actions.find(action => action.type === 'goTo')?.sceneId
const replaceTarget = (actions: Action[], target: string): Action[] => [
  ...actions.filter(action => action.type !== 'goTo'),
  { type: 'goTo', sceneId: target },
]

export function storyRoutes(definition: ExperienceDefinitionV1): StoryRoute[] {
  return definition.scenes.flatMap(scene => {
    if (scene.interaction?.type === 'single_choice') {
      return scene.interaction.options.flatMap(option => {
        const target = targetOf(option.actions)
        return target ? [{ id: `${scene.id}:choice:${option.id}`, source: scene.id, target, handle: `choice:${option.id}`, label: option.label }] : []
      })
    }
    if (scene.interaction?.type === 'photo_or_tap') {
      const target = targetOf(scene.interaction.actionsOnComplete)
      return target ? [{ id: `${scene.id}:observation`, source: scene.id, target, handle: 'observation', label: '观察完成' }] : []
    }
    return (scene.transitions ?? []).map((transition, index) => ({
      id: `${scene.id}:transition:${index}`,
      source: scene.id,
      target: transition.to,
      handle: `transition:${index}`,
      label: transition.when ? `${transition.when.var} ${transition.when.op}` : '下一章',
    }))
  })
}

export function storyDepths(definition: ExperienceDefinitionV1): Map<string, number> {
  const routes = storyRoutes(definition)
  const outgoing = new Map<string, string[]>()
  for (const route of routes) outgoing.set(route.source, [...(outgoing.get(route.source) ?? []), route.target])
  const depths = new Map<string, number>([[definition.initialSceneId, 0]])
  const queue = [definition.initialSceneId]
  while (queue.length) {
    const source = queue.shift()!
    const depth = depths.get(source) ?? 0
    for (const target of outgoing.get(source) ?? []) {
      if (depths.has(target)) continue
      depths.set(target, depth + 1)
      queue.push(target)
    }
  }
  const unreachableDepth = Math.max(0, ...depths.values()) + 1
  for (const scene of definition.scenes) if (!depths.has(scene.id)) depths.set(scene.id, unreachableDepth)
  return depths
}

export function addStoryScene(definition: ExperienceDefinitionV1): { definition: ExperienceDefinitionV1; sceneId: string } {
  const used = new Set(definition.scenes.map(scene => scene.id))
  const blockIds = new Set(definition.scenes.flatMap(scene => scene.blocks.map(block => block.id)))
  const sceneId = nextId('new-scene', used)
  const blockId = nextId(`${sceneId}-narration`, blockIds)
  const ending = definition.scenes.find(scene => scene.mode === 'ending')
  const target = ending?.id ?? definition.initialSceneId
  const scene: Scene = {
    id: sceneId,
    title: '新章节',
    mode: 'cinematic',
    blocks: [{ id: blockId, type: 'narration', text: '在这里写下新的故事内容。', fictional: true }],
    transitions: [{ to: target }],
  }
  return { definition: { ...definition, scenes: [...definition.scenes, scene] }, sceneId }
}

export function duplicateStoryScene(definition: ExperienceDefinitionV1, sourceId: string): { definition: ExperienceDefinitionV1; sceneId: string } {
  const source = definition.scenes.find(scene => scene.id === sourceId)
  if (!source) throw new Error('找不到要复制的章节。')
  const sceneIds = new Set(definition.scenes.map(scene => scene.id))
  const interactionIds = new Set(definition.scenes.flatMap(scene => scene.interaction ? [scene.interaction.id] : []))
  const sceneId = nextId(`${source.id}-copy`, sceneIds)
  const copy = structuredClone(source)
  copy.id = sceneId
  copy.title = `${source.title}（副本）`
  const blockIds = new Set<string>()
  copy.blocks = copy.blocks.map(block => {
    const id = nextId(`${sceneId}-${block.id}`, blockIds)
    blockIds.add(id)
    return { ...block, id }
  })
  if (copy.interaction) {
    copy.interaction.id = nextId(`${sceneId}-${copy.interaction.id}`, interactionIds)
    if (copy.interaction.type === 'single_choice') {
      const optionIds = new Set<string>()
      copy.interaction.options = copy.interaction.options.map(option => {
        const id = nextId(`${option.id}-copy`, optionIds)
        optionIds.add(id)
        return { ...option, id }
      })
    }
  }
  return { definition: { ...definition, scenes: [...definition.scenes, copy] }, sceneId }
}

export function deleteStoryScene(definition: ExperienceDefinitionV1, sceneId: string): ExperienceDefinitionV1 {
  if (definition.scenes.length === 1) throw new Error('故事至少需要一个章节。')
  if (sceneId === definition.initialSceneId) throw new Error('开始章节不能删除。')
  const inbound = storyRoutes(definition).filter(route => route.target === sceneId && route.source !== sceneId)
  if (inbound.length) throw new Error(`请先改掉指向本章的 ${inbound.length} 条连线。`)
  if (!definition.scenes.some(scene => scene.id === sceneId)) throw new Error('找不到要删除的章节。')
  return { ...definition, scenes: definition.scenes.filter(scene => scene.id !== sceneId) }
}

export function deleteStoryChoiceOption(definition: ExperienceDefinitionV1, sceneId: string, optionId: string): ExperienceDefinitionV1 {
  const scene = definition.scenes.find(item => item.id === sceneId)
  if (scene?.interaction?.type !== 'single_choice') throw new Error('当前章节不是选择分支。')
  if (scene.interaction.options.length <= 2) throw new Error('选择分支至少需要两个选项。')
  if (!scene.interaction.options.some(option => option.id === optionId)) throw new Error('找不到要删除的选项。')
  const next: Scene = {
    ...scene,
    interaction: { ...scene.interaction, options: scene.interaction.options.filter(option => option.id !== optionId) },
  }
  return { ...definition, scenes: definition.scenes.map(item => item.id === sceneId ? next : item) }
}

export function addStoryChoiceOption(definition: ExperienceDefinitionV1, sceneId: string): { definition: ExperienceDefinitionV1; optionId: string } {
  const scene = definition.scenes.find(item => item.id === sceneId)
  if (scene?.interaction?.type !== 'single_choice') throw new Error('当前章节不是选择分支。')
  if (scene.interaction.options.length >= 10) throw new Error('一个选择分支最多十个选项。')
  const target = targetOf(scene.interaction.options[0]?.actions ?? [])
  if (!target) throw new Error('请先为现有选项设置下一章。')
  const optionId = nextId('new-option', new Set(scene.interaction.options.map(option => option.id)))
  const next: Scene = {
    ...scene,
    interaction: {
      ...scene.interaction,
      options: [...scene.interaction.options, { id: optionId, label: '新的探索方向', actions: [{ type: 'goTo', sceneId: target }] }],
    },
  }
  return { definition: { ...definition, scenes: definition.scenes.map(item => item.id === sceneId ? next : item) }, optionId }
}

export function connectStoryRoute(definition: ExperienceDefinitionV1, sourceId: string, handle: string, targetId: string): ExperienceDefinitionV1 {
  if (!definition.scenes.some(scene => scene.id === targetId)) throw new Error('连线目标章节不存在。')
  const source = definition.scenes.find(scene => scene.id === sourceId)
  if (!source) throw new Error('连线起点章节不存在。')
  if (source.mode === 'ending') throw new Error('终幕不能创建后续连线。')
  let changed = false
  const next: Scene = structuredClone(source)
  if (handle.startsWith('transition:') && !next.interaction) {
    const index = Number(handle.slice('transition:'.length))
    if (Number.isInteger(index) && next.transitions?.[index]) {
      next.transitions[index] = { ...next.transitions[index], to: targetId }
      changed = true
    }
  } else if (handle.startsWith('choice:') && next.interaction?.type === 'single_choice') {
    const optionId = handle.slice('choice:'.length)
    next.interaction.options = next.interaction.options.map(option => {
      if (option.id !== optionId) return option
      changed = true
      return { ...option, actions: replaceTarget(option.actions, targetId) }
    })
  } else if (handle === 'observation' && next.interaction?.type === 'photo_or_tap') {
    next.interaction.actionsOnComplete = replaceTarget(next.interaction.actionsOnComplete, targetId)
    changed = true
  }
  if (!changed) throw new Error('这条出口已经不存在，请刷新关系图。')
  return { ...definition, scenes: definition.scenes.map(scene => scene.id === sourceId ? next : scene) }
}
