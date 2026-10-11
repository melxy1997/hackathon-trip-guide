import { assertExperience, type ExperienceDefinitionV1, type Scene } from './experienceSchema.ts'
import { resolveMediaUrl, type PublishedAttraction } from '../lib/tourPackage.ts'

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

/** Deterministic local template; names/media come only from the selected package. */
export function buildTemplate(pkg: PublishedAttraction, raw: BuilderInput, requestId: string): BuilderResult {
  const input = assertBuilderInput(raw)
  if (pkg.id !== input.attractionId || pkg.spots.length < 3) throw new Error('需要至少三个已发布地点才能编排分支故事。')
  const [first, second, third] = pkg.spots
  const last = pkg.spots[Math.min(3, pkg.spots.length - 1)]
  const voice = input.tone === 'poetic' ? '风把未说完的故事留在眼前。' : '准备好了吗？我们一起寻找故事的下一页！'
  const audience = input.audience === 'family' ? '邀请同行的孩子找一个形状，轮流说说它像什么。' : '留一点时间，想想这个形状唤起了哪段记忆。'
  const blocks = (id: string, image: string, text: string): Scene['blocks'] => [
    { id: `${id}-image`, type: 'image', assetRef: resolveMediaUrl(pkg, image) },
    { id: `${id}-voice`, type: 'narration', text, fictional: true },
  ]
  const observe = (id: string, title: string, text: string): Scene => ({
    id, title, spotId: third.id, mode: 'observation', blocks: blocks(id, third.image, text),
    interaction: { id: `${id}-look`, type: 'photo_or_tap', fallback: 'manual_confirm', actionsOnComplete: [
      { type: 'setVar', key: 'observed', value: true }, { type: 'revealMemory', memoryId: 'first-discovery' }, { type: 'goTo', sceneId: 'ending' },
    ] },
  })
  const experience: ExperienceDefinitionV1 = {
    schemaVersion: 1, id: 'builder-story', title: input.theme, premise: `在${pkg.name}，用一段文学创作探索「${input.theme}」。`,
    initialSceneId: 'opening', estimatedMinutes: input.duration, initialVariables: { lens: 'unset', observed: false },
    sources: structuredClone(pkg.experience?.sources ?? []),
    scenes: [
      { id: 'opening', title: '故事的邀请', spotId: first.id, mode: 'cinematic', blocks: blocks('opening', first.image,
        `这是一段为${pkg.name}创作的想象故事，人物与情节均为文学演绎。你在${first.name}收到一张写着「${input.theme}」的纸笺。${voice}请带着好奇心，翻开下一页。`), transitions: [{ to: 'choice' }] },
      { id: 'choice', title: '选择你的目光', spotId: second.id, mode: 'walk', blocks: blocks('choice', second.image,
        `走到${second.name}，纸笺给出两个邀请：去寻找自然留下的形状，或留意人们创造的细节。没有标准答案，你的选择将改变下一幕的讲述。`),
        interaction: { id: 'choose-lens', type: 'single_choice', options: [
          { id: 'nature', label: '寻找自然的形状', description: '下一幕把目光交给轮廓与自然的联想。', actions: [{ type: 'setVar', key: 'lens', value: 'nature' }, { type: 'goTo', sceneId: 'nature' }] },
          { id: 'craft', label: '留意创造的细节', description: '下一幕从一个细节，展开属于你的想象。', actions: [{ type: 'setVar', key: 'lens', value: 'craft' }, { type: 'goTo', sceneId: 'craft' }] },
        ] } },
      observe('nature', '自然的一页', `在${third.name}，请寻找眼前一个让你想到自然的形状。${audience}这是自由联想，不是对景物成因的判断。观察后点击确认，把这一刻留在手札里。`),
      observe('craft', '创造的一页', `在${third.name}，请留意一个你喜欢的细节。想象它会怎样出现在「${input.theme}」的故事中。${audience}这段想象不代表该景物的真实建造史。观察后点击确认。`),
      { id: 'ending', title: '把故事带走', spotId: last.id, mode: 'ending', blocks: blocks('ending', last.image,
        `来到${last.name}，纸笺的最后一行由你填写。你选择的目光和亲自确认的观察，已经成为这趟旅程的手札。关于「${input.theme}」的故事暂时落幕，下一段记忆等待你继续书写。`) },
    ],
  }
  assertExperience(experience, { spotIds: pkg.spots.map(s => s.id) })
  return { experience, mode: 'template', sourceAttractionId: pkg.id, requestId, reviewRequired: true,
    steps: ['读取已发布地点与素材', '套用五幕双分支模板', '完成结构、引用与可终止性校验', '等待人工审核'],
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
