import { assertExperience, type ExperienceDefinitionV1, type Scene } from './experienceSchema.ts'
import { resolveMediaUrl, type CatalogItem, type PublishedAttraction } from '../lib/tourPackage.ts'
import type { ExperiencePresentation } from './presentation.ts'

export interface BuilderInput {
  attractionId: string
  theme: string
  audience: 'general' | 'family'
  duration: number
  tone: 'poetic' | 'lively'
  mode: 'template' | 'online'
}
export interface BuilderResult {
  experience: ExperienceDefinitionV1
  mode: BuilderInput['mode']
  sourceAttractionId: string
  requestId: string
  steps: string[]
  diagnostics: string[]
  reviewRequired: true
}

export function assertBuilderInput(raw: unknown): BuilderInput {
  const v = raw as Partial<BuilderInput> | null
  if (!v || typeof v !== 'object' || typeof v.attractionId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v.attractionId)
    || typeof v.theme !== 'string' || !v.theme.trim() || v.theme.length > 100
    || !['general', 'family'].includes(v.audience ?? '') || !['poetic', 'lively'].includes(v.tone ?? '')
    || !['template', 'online'].includes(v.mode ?? '') || !Number.isInteger(v.duration) || v.duration! < 3 || v.duration! > 30) {
    throw new Error('请选择已发布景点，填写 1–100 字主题和 3–30 分钟时长，并选择受众、语气与生成模式。')
  }
  return { attractionId: v.attractionId, theme: v.theme.trim(), audience: v.audience!, duration: v.duration!, tone: v.tone!, mode: v.mode! }
}

type TemplateKind = 'heritage' | 'cosmos' | 'neutral'
type TemplateVocabulary = {
  theme: string
  premise: (place: string, theme: string) => string
  opening: { title: string; text: (place: string, spot: string, theme: string, voice: string) => string }
  choice: { title: string; text: (spot: string) => string; options: [TemplateOption, TemplateOption] }
  ending: { title: string; text: (spot: string, theme: string) => string }
}
type TemplateOption = { id: string; label: string; description: string; title: string; text: (spot: string, theme: string, audience: string) => string; prompt: string; hints: string[] }

/** Presentation semantics take priority; absent presentation follows the legacy heritage rendering contract. */
export function templateKindForPresentation(presentation?: ExperiencePresentation): TemplateKind {
  return presentation?.motif === 'transmission' ? 'cosmos' : 'heritage'
}

export function suggestedBuilderTheme(source?: Pick<CatalogItem, 'name' | 'presentation'>): string {
  const name = source?.name?.trim()
  switch (templateKindForPresentation(source?.presentation)) {
    case 'cosmos': return name ? `${name}：一段来自未来的讯号` : '一段来自未来的讯号'
    case 'heritage': return name ? `${name}：写给未来的一封信` : '一封写给未来的信'
    default: return name ? `${name}：未解的线索` : '未解的线索'
  }
}

const templateVocabulary = (kind: TemplateKind): TemplateVocabulary => {
  if (kind === 'cosmos') return {
    theme: '讯号', premise: (place, theme) => `在${place}接收一段围绕「${theme}」的虚构讯号，追踪它的起点或目的地，并完成观察记录。`,
    opening: { title: '接收未知讯号', text: (place, spot, theme, voice) => `这是一段为${place}创作的科幻想象，人物与讯号均为文学演绎。你在${spot}接收到主题为「${theme}」的未知讯号。${voice}请确认接收，开始解码。` },
    choice: { title: '选择追踪方向', text: spot => `进入${spot}，讯号分出两条可追踪路径：回溯它的起点，或推演它要抵达的目的地。没有标准答案，你的选择将改变下一段解码。`, options: [
      { id: 'origin', label: '回溯讯号起点', description: '从传播痕迹推想讯号从何处发出。', title: '起点追踪', text: (spot, theme, audience) => `在${spot}，观察一处像是讯号来源证据的现象：方向、节律、明暗或结构变化。${audience}把它与「${theme}」联系起来；这只是观察与科幻想象，不代表科学结论。确认后保存本次观测。`, prompt: '找一处能帮助你推想讯号起点的方向、节律或明暗变化。', hints: ['先比较不同区域的明暗、方向或重复节律。', '哪一种变化最像传播留下的痕迹？'] },
      { id: 'destination', label: '推演讯号目的地', description: '结合展项情境推想讯号要抵达哪里。', title: '目的地推演', text: (spot, theme, audience) => `在${spot}，观察一处能提示讯号目的地或环境的现象：尺度、边界、运动或彼此关系。${audience}把它与「${theme}」联系起来；这只是观察与科幻想象，不代表科学结论。确认后保存本次观测。`, prompt: '找一处能提示讯号目的地或环境的尺度、边界或运动现象。', hints: ['先观察展项中不同对象的尺度与相对位置。', '哪处边界或运动最能说明它将进入怎样的环境？'] },
    ] },
    ending: { title: '完成航行记录', text: (spot, theme) => `来到${spot}，本次讯号追踪结束。你选择的追踪方向和亲自确认的展项现象，已经写入航行与观测记录。关于「${theme}」的解码暂告完成，等待下一次接收。` },
  }
  if (kind === 'heritage') return {
    theme: '书信', premise: (place, theme) => `在${place}，用一段文学创作探索「${theme}」。`,
    opening: { title: '故事的邀请', text: (place, spot, theme, voice) => `这是一段为${place}创作的想象故事，人物与情节均为文学演绎。你在${spot}收到一张写着「${theme}」的纸笺。${voice}请带着好奇心，翻开下一页。` },
    choice: { title: '选择你的目光', text: spot => `走到${spot}，纸笺给出两个邀请：去寻找自然留下的形状，或留意人们创造的细节。没有标准答案，你的选择将改变下一幕的讲述。`, options: [
      { id: 'nature', label: '寻找自然的形状', description: '下一幕把目光交给轮廓与自然的联想。', title: '自然的一页', text: (spot, _theme, audience) => `在${spot}，请寻找眼前一个让你想到自然的形状。${audience}这是自由联想，不是对景物成因的判断。观察后点击确认，把这一刻留在手札里。`, prompt: '找一处让你想到自然的轮廓、光影或纹理。', hints: ['先看整体轮廓，再靠近一个局部。', '它让你联想到山、水、云，还是别的自然形状？'] },
      { id: 'craft', label: '留意创造的细节', description: '下一幕从一个细节，展开属于你的想象。', title: '创造的一页', text: (spot, theme, audience) => `在${spot}，请留意一个你喜欢的细节。想象它会怎样出现在「${theme}」的故事中。${audience}这段想象不代表该景物的真实建造史。观察后点击确认。`, prompt: '留意一处让你想知道“它是怎样被做出来的”细节。', hints: ['看看边缘、孔洞或表面的变化。', '不必猜真实工艺，只写下你看到的细节或自由联想。'] },
    ] },
    ending: { title: '把故事带走', text: (spot, theme) => `来到${spot}，纸笺的最后一行由你填写。你选择的目光和亲自确认的观察，已经成为这趟旅程的手札。关于「${theme}」的故事暂时落幕，下一段记忆等待你继续书写。` },
  }
  return {
    theme: '线索', premise: (place, theme) => `在${place}，围绕「${theme}」发现线索、选择视角并完成观察记录。`,
    opening: { title: '发现一条线索', text: (place, spot, theme, voice) => `这是一段为${place}创作的想象体验，人物与情节均为文学演绎。你在${spot}发现一条与「${theme}」有关的线索。${voice}请带着好奇心继续探索。` },
    choice: { title: '选择观察视角', text: spot => `来到${spot}，线索提供两个观察视角：关注整体关联，或关注局部细节。没有标准答案，你的选择将改变下一幕的讲述。`, options: [
      { id: 'context', label: '关注整体关联', description: '从环境和对象之间的关系继续观察。', title: '整体视角', text: (spot, theme, audience) => `在${spot}，观察对象与周围环境的关系。${audience}想想这处关联如何回应「${theme}」。这是自由观察，不代表对事实成因的判断。确认后保存这次观察。`, prompt: '找一处对象与环境之间值得记录的关系。', hints: ['先看整体，再比较不同对象的位置。', '哪种关联最能回应你选择的主题？'] },
      { id: 'detail', label: '关注局部细节', description: '从一个具体变化展开你的观察。', title: '细节视角', text: (spot, theme, audience) => `在${spot}，留意一个具体的形状、色彩、纹理或变化。${audience}想想这个细节如何回应「${theme}」。这是自由观察，不代表对事实成因的判断。确认后保存这次观察。`, prompt: '找一处值得记录的形状、色彩、纹理或变化。', hints: ['先选一个局部，再描述你实际看到的变化。', '它如何改变了你对主题的理解？'] },
    ] },
    ending: { title: '完成探索记录', text: (spot, theme) => `来到${spot}，这次探索暂告完成。你选择的视角和亲自确认的观察，已经汇成一份记录。关于「${theme}」仍可从新的线索继续理解。` },
  }
}

/** Deterministic local template; names/media come only from the selected package. */
export function buildTemplate(pkg: PublishedAttraction, raw: BuilderInput, requestId: string): BuilderResult {
  const input = assertBuilderInput(raw)
  if (pkg.id !== input.attractionId || pkg.spots.length < 3) throw new Error('需要至少三个已发布地点才能编排分支故事。')
  const [first, second, third] = pkg.spots
  const last = pkg.spots[Math.min(3, pkg.spots.length - 1)]
  const kind = templateKindForPresentation(pkg.presentation)
  const vocabulary = templateVocabulary(kind)
  const voice = kind === 'cosmos'
    ? input.tone === 'poetic' ? '微弱波形正在眼前展开。' : '接收完成，开始追踪这段讯号！'
    : input.tone === 'poetic' ? '风把未说完的故事留在眼前。' : '准备好了吗？我们一起寻找故事的下一页！'
  const audience = input.audience === 'family' ? '邀请同行的孩子指出一种现象，轮流说说看到了什么。' : '留一点时间，描述你实际看到的现象。'
  const blocks = (id: string, image: string, text: string): Scene['blocks'] => [
    { id: `${id}-image`, type: 'image', assetRef: resolveMediaUrl(pkg, image) },
    { id: `${id}-voice`, type: 'narration', text, fictional: true },
  ]
  const observe = (option: TemplateOption): Scene => ({
    id: option.id, title: option.title, spotId: third.id, mode: 'observation', blocks: blocks(option.id, third.image, option.text(third.name, input.theme, audience)),
    interaction: { id: `${option.id}-look`, type: 'photo_or_tap', prompt: option.prompt, hints: option.hints, fallback: 'manual_confirm', actionsOnComplete: [
      { type: 'setVar', key: 'observed', value: true }, { type: 'revealMemory', memoryId: 'first-discovery' }, { type: 'goTo', sceneId: 'ending' },
    ] },
  })
  const branchVariable = kind === 'cosmos' ? 'signalView' : 'lens'
  const experience: ExperienceDefinitionV1 = {
    schemaVersion: 1, id: 'builder-story', title: input.theme, premise: vocabulary.premise(pkg.name, input.theme),
    initialSceneId: 'opening', estimatedMinutes: input.duration, initialVariables: { [branchVariable]: 'unset', observed: false },
    sources: structuredClone(pkg.experience?.sources ?? []),
    scenes: [
      { id: 'opening', title: vocabulary.opening.title, spotId: first.id, mode: 'cinematic', blocks: blocks('opening', first.image, vocabulary.opening.text(pkg.name, first.name, input.theme, voice)), transitions: [{ to: 'choice' }] },
      { id: 'choice', title: vocabulary.choice.title, spotId: second.id, mode: 'walk', blocks: blocks('choice', second.image, vocabulary.choice.text(second.name)), interaction: { id: 'choose-lens', type: 'single_choice', options: vocabulary.choice.options.map(option => ({
        id: option.id, label: option.label, description: option.description, actions: [{ type: 'setVar' as const, key: branchVariable, value: option.id }, { type: 'goTo' as const, sceneId: option.id }],
      })) } },
      observe(vocabulary.choice.options[0]), observe(vocabulary.choice.options[1]),
      { id: 'ending', title: vocabulary.ending.title, spotId: last.id, mode: 'ending', blocks: blocks('ending', last.image, vocabulary.ending.text(last.name, input.theme)) },
    ],
  }
  assertExperience(experience, { spotIds: pkg.spots.map(s => s.id) })
  return { experience, mode: 'template', sourceAttractionId: pkg.id, requestId, reviewRequired: true,
    steps: ['读取已发布地点、素材与展示语义', `套用${vocabulary.theme}五幕双分支模板`, '完成结构、引用与可终止性校验', '等待人工审核'],
    diagnostics: ['模板生成未调用模型。旁白均标记为文学创作。', '请审核史实、地点顺序与素材授权；时长是目标值，尚未实测。'] }
}

/** Online candidates may reuse trusted sources/media, never invent references. */
export function assertBuilderCandidate(raw: unknown, pkg: PublishedAttraction): ExperienceDefinitionV1 {
  const experience = assertExperience(raw, { spotIds: pkg.spots.map(s => s.id), assets: pkg.assets })
  const sources = pkg.experience?.sources ?? []
  if (experience.sources.some(s => !sources.some(known => known.id === s.id && known.url === s.url && known.title === s.title && known.authority === s.authority))) {
    throw new Error('候选故事使用了资料库之外的来源，请先由人工补充可信资料。')
  }
  const media = new Set([pkg.coverImage, ...pkg.spots.map(s => s.image),
    ...(pkg.experience?.scenes.flatMap(s => s.blocks.flatMap(b => b.assetRef ? [b.assetRef] : [])) ?? [])].flatMap(ref => [ref, resolveMediaUrl(pkg, ref)]))
  if (experience.scenes.some(s => s.blocks.some(b => b.assetRef && !media.has(b.assetRef)))) throw new Error('候选故事引用了资料库之外的媒体。')
  return experience
}

export function validationSuggestion(message: string): string {
  if (/未知目标|不可达|循环|后续转移|终幕/.test(message)) return '检查下方章节连接；为每个非终幕选择已有的下一章，避免回跳形成循环，并让两条分支都到达终幕。'
  if (/来源|虚构/.test(message)) return '为事实旁白勾选已核验的来源；只有人物、情节和自由联想可标记为文学创作。'
  if (/地点/.test(message)) return '将章节重新绑定到当前景点的已有地点。'
  if (/媒体/.test(message)) return '从已发布地点的图片中重新选择素材，避免失效或不安全的引用。'
  return '检查提示对应的章节和字段；修复后系统会自动重新校验。'
}
