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
  ? { background: '#071427', accent: '#91dcff', ink: '#edf7ff', muted: '#a4bbd3', font: 'sans-serif' }
  : { background: '#17251d', accent: '#dcc497', ink: '#f4eedf', muted: '#bca77b', font: 'serif' }
export const locationLabel = (p: ExperiencePresentation) => p.locationMode === 'indoor' ? '手动展区体验' : '模拟游览'
