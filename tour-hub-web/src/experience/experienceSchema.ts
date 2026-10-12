/** Frozen V1: declaration-only stories. No scripts, expressions or URL callbacks. */
export type StoryValue = string | number | boolean
export type Condition = { var: string; op: 'eq' | 'neq' | 'in'; value: StoryValue | StoryValue[] }
export type Action =
  | { type: 'setVar'; key: string; value: StoryValue }
  | { type: 'revealMemory'; memoryId: string }
  | { type: 'goTo'; sceneId: string }
export type StoryBlock = {
  id: string
  type: 'narration' | 'image' | 'caption' | 'audio'
  text?: string
  assetRef?: string
  fictional?: boolean
  sourceIds?: string[]
}
export type Interaction =
  | { id: string; type: 'single_choice'; options: Array<{ id: string; label: string; description?: string; actions: Action[] }> }
  | { id: string; type: 'photo_or_tap'; prompt?: string; hints?: string[]; fallback: 'manual_confirm'; actionsOnComplete: Action[] }
export interface Scene {
  id: string
  spotId?: string
  title: string
  mode: 'cinematic' | 'walk' | 'observation' | 'ending'
  blocks: StoryBlock[]
  interaction?: Interaction
  transitions?: Array<{ when?: Condition; to: string }>
}
export interface ExperienceDefinitionV1 {
  schemaVersion: 1
  id: string
  title: string
  premise: string
  initialSceneId: string
  estimatedMinutes: number
  initialVariables: Record<string, StoryValue>
  scenes: Scene[]
  sources: Array<{ id: string; url: string; title: string; authority: 'official' | 'secondary' }>
}
export interface ExperienceContext { spotIds: string[]; assets?: Record<string, string> }

export class ExperienceValidationError extends Error {
  readonly issues: string[]
  constructor(issues: string[]) {
    super(`体验包校验失败：\n${issues.join('\n')}`)
    this.name = 'ExperienceValidationError'
    this.issues = issues
  }
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const value = (v: unknown): v is StoryValue => typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 10000

export function safeAssetUrl(ref: unknown, kind: 'image' | 'audio'): ref is string {
  if (typeof ref !== 'string' || ref.length > 3_000_000) return false
  if (/^\/(?!\/)[^\\?#]*$/.test(ref)) {
    try { return !decodeURIComponent(ref).split('/').some(p => p === '..' || p === '.') }
    catch { return false }
  }
  if (kind === 'image' && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(ref)) return true
  try { const u = new URL(ref); return u.protocol === 'https:' && !u.username && !u.password }
  catch { return false }
}

/** Shared by loading, editor and publishing; does not certify facts or licensing. */
export function assertExperience(raw: unknown, context: ExperienceContext): ExperienceDefinitionV1 {
  const issues: string[] = []
  const fail = (where: string, message: string) => issues.push(`${where}: ${message}`)
  if (!object(raw)) throw new ExperienceValidationError(['experience: 必须是对象'])
  if (raw.schemaVersion !== 1) fail('experience', '只支持 schemaVersion=1')
  for (const key of ['id', 'initialSceneId']) if (!identifier(raw[key])) fail(`experience.${key}`, 'ID 无效')
  for (const key of ['title', 'premise']) if (!text(raw[key])) fail(`experience.${key}`, '文本不能为空或超过上限')
  if (typeof raw.estimatedMinutes !== 'number' || !Number.isFinite(raw.estimatedMinutes) || raw.estimatedMinutes <= 0 || raw.estimatedMinutes > 240) fail('experience.estimatedMinutes', '时长须在 0–240 分钟内')
  const variables = object(raw.initialVariables) ? raw.initialVariables : {}
  if (!object(raw.initialVariables)) fail('experience.initialVariables', '变量必须是对象')
  for (const [key, v] of Object.entries(variables)) if (!identifier(key) || !value(v)) fail(`variables.${key}`, '变量名或标量值无效')
  const sources = Array.isArray(raw.sources) ? raw.sources : []
  if (!Array.isArray(raw.sources)) fail('experience.sources', '来源须为数组')
  const sourceIds = new Set<string>()
  for (const s of sources) {
    if (!object(s)) { fail('sources', '来源必须是对象'); continue }
    if (!identifier(s.id) || sourceIds.has(s.id)) fail('sources', '来源 ID 无效或重复')
    else sourceIds.add(s.id)
    if (!text(s.title) || !['official', 'secondary'].includes(String(s.authority))) fail(`source:${s.id}`, '标题或来源类型无效')
    try { const u = new URL(String(s.url)); if (u.protocol !== 'https:' || u.username || u.password) throw Error() }
    catch { fail(`source:${s.id}`, '来源必须是无凭据的 HTTPS URL') }
  }
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : []
  if (!scenes.length || scenes.length > 100) fail('experience.scenes', '需要 1–100 个场景')
  const ids = new Set<string>()
  for (const s of scenes) {
    if (!object(s)) { fail('scenes', '场景必须是对象'); continue }
    if (!identifier(s.id) || ids.has(s.id)) fail('scenes', '场景 ID 无效或重复')
    else ids.add(s.id)
  }
  const graph = new Map<string, string[]>()
  const interactions = new Set<string>()
  for (const s of scenes) {
    if (!object(s)) continue
    const where = `scene:${s.id}`
    if (!text(s.title) || !['cinematic', 'walk', 'observation', 'ending'].includes(String(s.mode))) fail(where, '标题或场景模式无效')
    if (s.spotId !== undefined && !context.spotIds.includes(String(s.spotId))) fail(where, `未知地点 ${s.spotId}`)
    const blocks = Array.isArray(s.blocks) ? s.blocks : []
    if (!blocks.length || blocks.length > 50) fail(where, '需要 1–50 个内容块')
    const blockIds = new Set<string>()
    for (const b of blocks) {
      if (!object(b)) { fail(where, '内容块须为对象'); continue }
      if (!identifier(b.id) || blockIds.has(b.id)) fail(where, `内容块 ID 无效或重复 ${b.id}`)
      else blockIds.add(b.id)
      if (!['narration', 'caption', 'image', 'audio'].includes(String(b.type))) fail(where, `未知内容块类型 ${b.type}`)
      if (b.type === 'narration' || b.type === 'caption') {
        if (!text(b.text)) fail(where, `${b.id} 缺少文本`)
        if (b.fictional !== undefined && typeof b.fictional !== 'boolean') fail(where, `${b.id} fictional 必须是布尔值`)
        if (b.fictional !== true && (!Array.isArray(b.sourceIds) || !b.sourceIds.length)) fail(where, `${b.id} 的事实讲述需关联来源或标记为虚构`)
      }
      if (b.sourceIds !== undefined && (!Array.isArray(b.sourceIds) || b.sourceIds.some(id => typeof id !== 'string' || !sourceIds.has(id)))) fail(where, `${b.id} 引用未知来源`)
      if (b.type === 'image' || b.type === 'audio') {
        const resolved = typeof b.assetRef === 'string' ? context.assets?.[b.assetRef] ?? b.assetRef : undefined
        if (!safeAssetUrl(resolved, b.type)) fail(where, `${b.id} 媒体引用无法安全解析`)
      }
    }
    const targets: string[] = []
    const checkActions = (actions: unknown, path: string) => {
      if (!Array.isArray(actions)) { fail(path, 'actions 须为数组'); return }
      if (actions.filter(a => object(a) && a.type === 'goTo').length !== 1) fail(path, '必须恰有一个 goTo')
      for (const a of actions) {
        if (!object(a)) { fail(path, '动作须为对象'); continue }
        const allowed: Record<string, string[]> = { setVar: ['type', 'key', 'value'], revealMemory: ['type', 'memoryId'], goTo: ['type', 'sceneId'] }
        if (!Object.hasOwn(allowed, String(a.type))) { fail(path, `未知动作 ${a.type}`); continue }
        if (Object.keys(a).some(k => !allowed[String(a.type)].includes(k))) fail(path, '动作包含非契约字段')
        if (a.type === 'goTo') targets.push(String(a.sceneId))
        if (a.type === 'revealMemory' && !identifier(a.memoryId)) fail(path, '回忆 ID 无效')
        if (a.type === 'setVar' && (!Object.hasOwn(variables, String(a.key)) || !value(a.value) || typeof variables[String(a.key)] !== typeof a.value)) fail(path, `setVar 的变量或值类型无效 ${a.key}`)
      }
    }
    if (s.interaction !== undefined) {
      if (!object(s.interaction)) fail(where, 'interaction 须为对象')
      else {
        const it = s.interaction
        if (!identifier(it.id) || interactions.has(it.id)) fail(where, '互动 ID 无效或重复')
        else interactions.add(it.id)
        if (s.transitions !== undefined) fail(where, '互动与 transitions 不能同时定义')
        if (it.type === 'single_choice') {
          const options = Array.isArray(it.options) ? it.options : []
          if (options.length < 2 || options.length > 10) fail(where, '选择题需要 2–10 个选项')
          const optionIds = new Set<string>()
          for (const o of options) {
            if (!object(o)) { fail(where, '选项须为对象'); continue }
            if (!identifier(o.id) || optionIds.has(o.id)) fail(where, '选项 ID 无效或重复')
            else optionIds.add(o.id)
            if (!text(o.label)) fail(where, '选项缺少标题')
            if (o.description !== undefined && (!text(o.description) || o.description.length > 240)) fail(where, '选项说明需为 1–240 字文本')
            checkActions(o.actions, `${where}/option:${o.id}`)
          }
        } else if (it.type === 'photo_or_tap') {
          if (it.prompt !== undefined && (!text(it.prompt) || it.prompt.length > 240)) fail(where, '观察主提示需为 1–240 字文本')
          if (it.hints !== undefined) {
            if (!Array.isArray(it.hints) || it.hints.length > 3) fail(where, '观察轻提示须为最多 3 条文本')
            else if (it.hints.some(hint => !text(hint) || hint.length > 80)) fail(where, '每条轻提示需为 1–80 字文本')
          }
          if (it.fallback !== 'manual_confirm') fail(where, '观察任务必须允许人工确认')
          checkActions(it.actionsOnComplete, `${where}/observation`)
        } else fail(where, `未知互动类型 ${it.type}`)
      }
    } else {
      const ts = Array.isArray(s.transitions) ? s.transitions : []
      if (s.transitions !== undefined && !Array.isArray(s.transitions)) fail(where, 'transitions 须为数组')
      if (s.mode !== 'ending' && !ts.length) fail(where, '非终幕需要后续转移')
      if (ts.length && (object(ts.at(-1)) && ts.at(-1).when !== undefined)) fail(where, '最后一项转移必须是无条件兜底')
      for (const [i, t] of ts.entries()) {
        if (!object(t)) { fail(where, '转移须为对象'); continue }
        targets.push(String(t.to))
        if (t.when === undefined) {
          if (i !== ts.length - 1) fail(where, '无条件转移只能放在最后')
        } else if (!object(t.when) || !Object.hasOwn(variables, String(t.when.var)) || !['eq', 'neq', 'in'].includes(String(t.when.op))) fail(where, '转移条件无效')
        else {
          const c = t.when
          const vals = c.op === 'in' ? c.value : [c.value]
          if (!Array.isArray(vals) || !vals.length || vals.some(v => !value(v) || typeof v !== typeof variables[String(c.var)])) fail(where, '转移条件值类型无效')
        }
      }
    }
    if (s.mode === 'ending' && (targets.length || s.interaction)) fail(where, '终幕不可有互动或出边')
    graph.set(String(s.id), targets)
  }
  if (!ids.has(String(raw.initialSceneId))) fail('experience.initialSceneId', '首幕不存在')
  for (const [id, targets] of graph) for (const target of targets) if (!ids.has(target)) fail(`scene:${id}`, `未知目标 ${target}`)
  const visited = new Set<string>()
  const active = new Set<string>()
  const walk = (id: string) => {
    if (active.has(id)) { fail(`scene:${id}`, 'V1 不支持循环故事，请提供可终止分支'); return }
    if (visited.has(id) || !ids.has(id)) return
    visited.add(id); active.add(id)
    for (const to of graph.get(id) ?? []) walk(to)
    active.delete(id)
  }
  walk(String(raw.initialSceneId))
  for (const id of ids) if (!visited.has(id)) fail(`scene:${id}`, '场景从首幕不可达')
  if (!scenes.some(s => object(s) && s.mode === 'ending' && visited.has(String(s.id)))) fail('experience', '缺少可达终幕')
  if (issues.length) throw new ExperienceValidationError(issues)
  return raw as unknown as ExperienceDefinitionV1
}
