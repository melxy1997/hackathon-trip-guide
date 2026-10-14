export interface ExperiencePresentation {
  preset: 'heritage' | 'cosmos'
  motif: 'letter' | 'transmission'
  locationMode: 'outdoor' | 'indoor'
  openingTitle: string
  openingText: string
  labels: { start: string; next: string; finish: string; journal: string; stage: string }
}

const heritage: ExperiencePresentation = {
  preset: 'heritage', motif: 'letter', locationMode: 'outdoor',
  openingTitle: '致后来走进这座园林的你', openingText: '如果亭台会说话，\n它们想留下怎样一句话？',
  labels: { start: '开启时空漫游', next: '前往下一站', finish: '读完家书，收下手账', journal: '我的时空手账', stage: '站' },
}
const cosmos: ExperiencePresentation = {
  preset: 'cosmos', motif: 'transmission', locationMode: 'indoor',
  openingTitle: '接收端：此刻的你', openingText: '一段尚未解码的讯号。\n它从哪里来，又要抵达哪里？',
  labels: { start: '接收宇宙讯号', next: '继续接收讯号', finish: '解码完成，生成航行记录', journal: '我的航行记录', stage: '展区' },
}
export function presentationForPreset(preset: ExperiencePresentation['preset']): ExperiencePresentation {
  return structuredClone(preset === 'cosmos' ? cosmos : heritage)
}
export function resolvePresentation(presentation?: ExperiencePresentation): ExperiencePresentation {
  return structuredClone(presentation ?? heritage)
}

/** Bounded text and enum values only; presentation cannot inject CSS, HTML or runtime actions. */
export function assertPresentation(raw: unknown): ExperiencePresentation | undefined {
  if (raw === undefined) return undefined
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
  const oneOf = (v: unknown, values: string[]) => typeof v === 'string' && values.includes(v)
  if (!object(raw) || Object.keys(raw).some(k => !['preset', 'motif', 'locationMode', 'openingTitle', 'openingText', 'labels'].includes(k)) ||
      !oneOf(raw.preset, ['heritage', 'cosmos']) || !oneOf(raw.motif, ['letter', 'transmission']) ||
      !oneOf(raw.locationMode, ['outdoor', 'indoor']) || !text(raw.openingTitle, 100) || !text(raw.openingText, 1000) || !object(raw.labels)) throw new Error('展示配置无效：请检查主题、媒介、地点模式和开场文本。')
  const keys = ['start', 'next', 'finish', 'journal', 'stage']
  if (Object.keys(raw.labels).some(k => !keys.includes(k)) || keys.some(k => !text((raw.labels as Record<string, unknown>)[k], 80))) throw new Error('展示配置无效：按钮和记录标签需为 1–80 字文本。')
  return raw as unknown as ExperiencePresentation
}

export const presentationPalette = (preset: ExperiencePresentation['preset']) => preset === 'cosmos'
  ? { background: '#071427', surface: '#0b203c', surfaceRaised: '#102c4b', ink: '#edf7ff', muted: '#a4bbd3', accent: '#91dcff', onAccent: '#071427', border: '#91dcff50', focus: '#bdeaff', font: 'sans-serif', stageRadius: '16px' }
  : { background: '#151d1a', surface: '#23352b', surfaceRaised: '#eee4cd', ink: '#f4eedf', muted: '#b6b4a8', accent: '#dcc497', onAccent: '#1c2a21', border: '#dcc49766', focus: '#eed9ac', font: 'serif', stageRadius: '4px' }
export const locationLabel = (p: ExperiencePresentation) => p.locationMode === 'indoor' ? '手动展区体验' : '模拟游览'

const heritageCopy = {
  player: {
    record: '手账', progressAria: '探索进度', progressItem: '份发现', progressBarAria: '已探索地点', stageAria: '故事舞台', duration: (minutes: number) => `一场 ${minutes} 分钟的故事`,
    openingNote: '文学创作 · 艺术演绎', promises: ['选择你的视角', '留下自己的发现', '收下一张手账'], waiting: '故事在下一站等你', nextSegment: '下一段故事', origin: '故事起点',
    choiceSaved: (label: string, detail?: string) => `你的选择「${label}」已记入手账。${detail ?? '下一幕将沿着这份好奇继续。'}`,
    observationSaved: (label?: string) => `已收下你的发现${label ? `「${label}」` : ''}，这份观察将在结局的手账里等你。`,
    locationNote: '当前为模拟游览，点击到站会触发地点事件；不使用真实定位。', enter: '模拟到达', sceneFallback: '故事场景', choiceEcho: (label: string) => `沿着你选择的「${label}」继续探索`,
    interactionNext: '读完了，继续探索', choicesAria: '选择探索方向', choicePrompt: '你想带着哪一种目光继续？', choiceHelp: '没有标准答案，下一幕会因你的选择而不同。', observationAria: '观察探索',
    error: '故事暂时无法推进，请重新开启。', reset: '重新开启故事', imageError: '场景图片暂不可用，文字故事仍可继续。', resumed: '已恢复本机保存的故事进度；声音需再次点按开启。',
    routeTitle: '故事路线', routeMode: '模拟地点', visited: '已走进故事', current: '下一站', pending: '等待探索', sourcesTitle: '关于故事与资料来源', noSources: '此故事未关联史实来源，旁白应作为文学创作阅读。',
  },
  observation: {
    title: '留住你发现的一处细节', openEnded: '没有标准答案', help: '点选画面中的轮廓、光影或一个喜欢的细节。也可以直接写一句话，或完成观察后继续。', hints: '需要一点观察提示？', imageUnavailable: '画面暂不可用，仍可以写下观察或直接确认。',
    targetAria: '点选画面中的细节', imageAlt: (place: string) => `${place}的样例画面，可在照片上标记自己的发现`, imagePrompt: '点一下，留下你的发现', loading: '画面加载中，可以先写记录或直接确认。', marked: '已标记一个细节 · 可重新点选或用方向键微调', keyboard: '也支持键盘：聚焦画面，按回车选中中心，再用方向键移动。',
    clear: '清除标记', categoryAria: '发现类型', noteLabel: '这一刻让我想到…', placeholder: '例如：光从石头的缝隙里穿过，像一封还没写完的信。', fineprint: '样例画面 · 手动标注与人工确认。确认后存入本机手账；保存或分享手账会包含这句话。', confirm: '我已观察，收下这份发现',
  },
  journal: {
    record: '手账', card: '手账卡', eyebrow: 'TIMEWALKER · 旅程留痕', intro: (title: string) => `${title}，留下了属于你的这一页。`, role: '这趟旅程的称号', places: '处走过的地点', choiceHeading: '我的选择', noChoices: '尚未留下选择', discoveriesHeading: '我的发现', discoveryFallback: '观察发现', noDiscoveries: '尚未完成观察', chapters: '走过的章节', observationsAria: '我的观察记录', observationsTitle: '我想记住的细节', photoUnavailable: '画面暂不可用，你的发现文字仍保留在手账中。', photoAlt: (title: string) => `${title} · 本次观察的样例画面`, discoveryTitle: '我的发现', emptyNote: '这一处细节，是我想带走的风景。',
    downloaded: '手账卡已生成，请查看浏览器下载。卡片包含本次选择与发现。', downloadFailed: '卡片暂时无法保存，可以复制下方文字手账。', shared: '已完成分享。', shareCancelled: '已取消分享，手账仍保留在这里。', copied: '文字手账已复制，可以粘贴分享给同行的人。', copyFailed: '请选中下方文字手动复制，手账仍可以保存为卡片。', save: '保存手账卡', share: '分享文字手账', copyLabel: '可复制的文字手账', restart: '换个视角，再走一次', home: '返回发现页', filename: '手账',
    fineprint: '文学演绎 · 记录由本次体验事件生成。卡片为 SVG 格式，可用浏览器打开。再次开启会重置本机进度，可以先保存喜欢的这一页。',
  },
  offline: { aria: '离线故事包', title: '把这段故事装进口袋', cleared: '离线素材已清除，你的故事进度与手账记录仍保留。', ready: '准备完成。现在可以关闭网络，刷新后继续故事。', description: '支持离线的样例故事可提前把分支、画面与旅途记录保存在当前浏览器。', prepare: '准备离线故事', prepared: '离线已准备', unprepared: '尚未准备', online: '浏览器报告网络可用', offline: '浏览器报告已断网', continue: '可离线继续本故事', connectFirst: '请先联网准备', processing: '正在处理…', retry: '重新检查并准备', clear: '清除离线素材', assetUnit: '份素材', packageLabel: '完整包', buildLabel: '构建', productionNote: '仅保证已准备的固定样例。地图、在线 AI、外部来源页面仍需联网。浏览器清理存储或新版本发布后，请重新检查准备状态。', developmentNote: '开发模式可直接试玩；离线准备请使用 npm run build 与 npm run preview。', failed: '离线准备失败，请重试。', progressAria: '离线准备进度' },
}

const cosmosCopy = {
  player: {
    ...heritageCopy.player, record: '航行记录', progressAria: '接收进度', progressItem: '条观测', progressBarAria: '已接收展区', stageAria: '讯号接收界面', duration: (minutes: number) => `一段 ${minutes} 分钟的讯号`, openingNote: '科学主题 · 艺术演绎', promises: ['选择观测视角', '标记一条观测', '生成航行记录'], waiting: '下一段讯号等待接收', nextSegment: '下一段讯号', origin: '接收起点',
    choiceSaved: (label: string, detail?: string) => `你的选择「${label}」已写入航行记录。${detail ?? '下一段讯号将沿此方向解码。'}`, observationSaved: (label?: string) => `已记录观测${label ? `「${label}」` : ''}，这条讯号将在航行记录中汇总。`, locationNote: '展区是讯号章节导航。请手动进入，不使用室内定位或精确路线。', enter: '进入展区', sceneFallback: '讯号片段', choiceEcho: (label: string) => `按你选择的「${label}」继续解码`, interactionNext: '完成读取，继续接收', choicesAria: '选择解码方向', choicePrompt: '你要从哪个方向继续解码？', choiceHelp: '没有标准答案，后续讯号会随选择改变。', observationAria: '讯号观测', error: '讯号暂时无法继续解码，请重新接收。', reset: '重新接收讯号', imageError: '观测画面暂不可用，文字讯号仍可继续。', resumed: '已恢复本机保存的接收进度；音频需再次点按开启。', routeTitle: '讯号序列', routeMode: '手动进入', visited: '已接收', current: '当前讯号', pending: '等待接收', sourcesTitle: '关于讯号与资料来源', noSources: '此讯号未关联资料来源，旁白应作为艺术演绎阅读。',
  },
  observation: {
    ...heritageCopy.observation, title: '标记一条观测讯号', openEnded: '开放观测', help: '点选画面中的轮廓、亮度或一处讯号特征。也可以直接写下观测，或确认后继续。', hints: '需要观测提示？', imageUnavailable: '观测画面暂不可用，仍可写下讯号或直接确认。', targetAria: '标记观测画面中的讯号', imageAlt: (place: string) => `${place}的观测画面，可在图像上标记讯号`, imagePrompt: '点一下，标记讯号', loading: '观测画面加载中，可以先写入记录或直接确认。', marked: '已标记一条讯号 · 可重新点选或用方向键微调', keyboard: '键盘操作：聚焦画面，按回车标记中心，再用方向键移动。', clear: '清除讯号标记', categoryAria: '讯号类型', noteLabel: '观测备注', placeholder: '例如：这束光的边缘像一条正在远离的轨迹。', fineprint: '样例画面 · 手动标注与人工确认。确认后写入本机航行记录；保存或分享记录会包含这段备注。', confirm: '确认观测并写入记录',
  },
  journal: {
    ...heritageCopy.journal, record: '航行记录', card: '航行卡', eyebrow: 'TIMEWALKER · 讯号归档', intro: (title: string) => `${title}，已生成本次接收的飞行记录。`, role: '本次航行识别', places: '个展区章节', choiceHeading: '解码选择', noChoices: '本次未写入解码选择', discoveriesHeading: '观测讯号', discoveryFallback: '讯号观测', noDiscoveries: '本次未完成观测任务', chapters: '接收序列', observationsAria: '我的讯号记录', observationsTitle: '已归档的观测讯号', photoUnavailable: '观测画面暂不可用，文字讯号仍保留在航行记录中。', photoAlt: (title: string) => `${title} · 本次讯号观测画面`, discoveryTitle: '观测讯号', emptyNote: '这条讯号已写入本次飞行记录。', downloaded: '航行卡已生成，请查看浏览器下载。卡片包含本次选择与观测。', downloadFailed: '航行卡暂时无法保存，可以复制下方文字记录。', shared: '航行记录已完成分享。', shareCancelled: '已取消分享，航行记录仍保留在这里。', copied: '文字航行记录已复制，可以粘贴到其他应用。', copyFailed: '请选中下方文字手动复制，航行记录仍可保存为航行卡。', save: '保存航行卡', share: '分享文字航行记录', copyLabel: '可复制的文字航行记录', restart: '重新选择观测方向', home: '返回体验列表', filename: '航行记录', fineprint: '艺术演绎 · 记录由本次体验事件生成。航行卡为 SVG 格式，可用浏览器打开。重新接收会重置本机进度，请先保存需要的记录。',
  },
  offline: { aria: '离线讯号包', title: '将讯号存入本机', cleared: '离线素材已清除，你的接收进度与航行记录仍保留。', ready: '准备完成。现在可以关闭网络，刷新后继续接收讯号。', description: '支持离线的样例讯号可提前把分支、观测画面与航行记录保存在当前浏览器。', prepare: '准备离线讯号', prepared: '讯号已存入本机', unprepared: '讯号尚未准备', online: '浏览器报告网络可用', offline: '浏览器报告已断网', continue: '可离线继续接收讯号', connectFirst: '请先联网存入讯号', processing: '正在处理讯号…', retry: '重新检查讯号包', clear: '清除离线讯号', assetUnit: '份讯号素材', packageLabel: '讯号包', buildLabel: '版本', productionNote: '仅保证已准备的固定样例讯号。在线 AI、外部来源页面仍需联网；浏览器清理存储或新版本发布后，请重新检查。', developmentNote: '开发模式可直接接收讯号；离线准备请使用 npm run build 与 npm run preview。', failed: '离线讯号准备失败，请重试。', progressAria: '离线讯号准备进度' },
}

export type ExperienceFrameworkCopy = typeof heritageCopy
export function presentationCopy(presentation?: ExperiencePresentation): ExperienceFrameworkCopy {
  return resolvePresentation(presentation).motif === 'transmission' ? cosmosCopy : heritageCopy
}
