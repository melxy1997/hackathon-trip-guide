import { createHash } from 'node:crypto'
import { narrativeSchema, planSchema, type CreativeBrief } from '../../src/agent/contracts.ts'
import { validateStoryGraph } from '../../src/lib/storyTour.ts'
import type { DraftAttraction } from '../../src/types/attraction.ts'
import type { StoryGraph } from '../../src/lib/tourPackage.ts'

export const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function validateSource(source: DraftAttraction) {
  if (!source || !source.id || !Number.isSafeInteger(source.updatedAt) || !Array.isArray(source.spots) || source.spots.length < 2 || source.spots.length > 20 || new Set(source.spots.map(spot => spot.id)).size !== source.spots.length) throw new Error('先选择 2–20 个不重复的真实地点并保存草稿')
  if (source.spots.some(spot => !spot.id || !spot.name || !Number.isFinite(spot.lng) || !Number.isFinite(spot.lat) || Math.abs(spot.lng) > 180 || Math.abs(spot.lat) > 90 || !spot.image)) throw new Error('地点 ID、名称、坐标或图片不完整，请先在地图编辑器确认')
}
export function compileCandidate(source: DraftAttraction, brief: CreativeBrief, rawPlan: unknown, rawNarrative: unknown): DraftAttraction {
  validateSource(source)
  if (source.id !== brief.sourceDraftId) throw new Error('创作简报与草稿不匹配')
  const plan = planSchema.parse(rawPlan)
  const narrative = narrativeSchema.parse(rawNarrative)
  const ids = source.spots.map(spot => spot.id)
  const assertIds = (values: string[]) => {
    if (values.length !== ids.length || new Set(values).size !== ids.length || values.some(id => !ids.includes(id))) throw new Error('结构与逐站内容必须完整引用原有地点，不得新增、遗漏或重复')
  }
  assertIds(plan.nodes.map(node => node.spotId)); assertIds(narrative.spots.map(spot => spot.spotId))
  if (!ids.includes(plan.entrySpotId)) throw new Error('入口不存在')
  let story: StoryGraph | undefined
  if (brief.mode === 'story') {
    story = { title: narrative.title, entry: plan.entrySpotId, choices: {}, endings: {} }
    for (const node of plan.nodes) {
      if (new Set(node.toSpotIds).size !== node.toSpotIds.length || node.toSpotIds.some(id => !ids.includes(id) || id === node.spotId)) throw new Error('去向重复、自环或引用未知地点')
      const written = narrative.spots.find(spot => spot.spotId === node.spotId)!
      if (written.choices.length !== node.toSpotIds.length || new Set(written.choices.map(choice => choice.toSpotId)).size !== written.choices.length || written.choices.some(choice => !node.toSpotIds.includes(choice.toSpotId))) throw new Error('逐站选项与已确认结构不一致')
      story.choices![node.spotId] = written.choices.map(choice => ({ to: choice.toSpotId, label: choice.label, note: choice.note }))
      if (node.toSpotIds.length === 0) {
        if (!written.endingTitle) throw new Error('终幕需要结局标题')
        story.endings![node.spotId] = written.endingTitle
      } else if (written.endingTitle) throw new Error('非终幕不能标为结局')
    }
    const issues = validateStoryGraph({ spots: source.spots, story })
    if (issues.some(issue => issue.level === 'error')) throw new Error(issues.map(issue => issue.message).join('；'))
    // Every reachable node must be able to finish; multi-endings and loops with exits are legal.
    const canFinish = new Set(Object.keys(story.endings!))
    for (let pass = 0; pass < ids.length; pass++) for (const node of plan.nodes) if (node.toSpotIds.some(id => canFinish.has(id))) canFinish.add(node.spotId)
    if (canFinish.size !== ids.length) throw new Error('故事存在无法抵达任何结局的节点')
  } else {
    if (plan.entrySpotId !== ids[0] || plan.nodes.some((node, index) => node.spotId !== ids[index] || JSON.stringify(node.toSpotIds) !== JSON.stringify(ids[index + 1] ? [ids[index + 1]] : [])) || narrative.spots.some(spot => spot.choices.length || spot.endingTitle)) throw new Error('打卡须保留原顺序，不生成故事分支或结局')
  }
  const next = structuredClone(source)
  next.status = 'draft'; next.description = narrative.description; next.mode = brief.mode; next.lastStage = 2
  if (story) next.story = story; else delete next.story
  next.storyDirection = brief.prompt
  next.spots = source.spots.map(spot => { const content = narrative.spots.find(item => item.spotId === spot.id)!; return { ...structuredClone(spot), poetic: content.poetic, slides: content.slides } })
  return next
}
