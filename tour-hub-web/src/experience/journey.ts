import type { ExperienceDefinitionV1 } from './experienceSchema.ts'
import type { ExperienceState } from './storyEngine.ts'
import type { Discovery } from './events.ts'
import { resolvePresentation, presentationCopy, presentationPalette, locationLabel, type ExperiencePresentation } from './presentation.ts'

export const discoveryLabels: Record<Discovery['category'], string> = { shape: '轮廓与形状', light: '光影与层次', detail: '我的独特发现' }

export function journeyProgress(definition: ExperienceDefinitionV1, state: ExperienceState) {
  const spotIds = [...new Set(definition.scenes.flatMap(s => s.spotId ? [s.spotId] : []))]
  return { spotIds, visited: spotIds.filter(id => state.visitedSpotIds.includes(id)).length, total: spotIds.length }
}

/** Titles describe this playthrough, not an inferred personal identity. */
export function journeyTitle(state: ExperienceState, presentation?: ExperiencePresentation): string {
  if (presentation?.preset === 'cosmos') {
    if (state.choices.length && state.variables.signalView === 'origin') return '起源追寻者'
    if (state.choices.length && state.variables.signalView === 'destination') return '未来领航者'
    return state.choices.length ? '深空探索者' : '讯号接收者'
  }
  const lens = state.variables.aestheticLens ?? state.variables.lens
  if (state.choices.length && lens === 'nature') return '山林寻趣者'
  if (state.choices.length && lens === 'craft') return '匠心寻迹者'
  return state.choices.length ? '故事探索者' : '章节体验者'
}

export function journalText(definition: ExperienceDefinitionV1, state: ExperienceState, presentation?: ExperiencePresentation): string {
  const p = resolvePresentation(presentation)
  const copy = presentationCopy(p).journal
  const scenes = state.visitedSceneIds.map(id => definition.scenes.find(s => s.id === id)?.title).filter(Boolean)
  const observations = state.observations.map(o => {
    const title = definition.scenes.find(s => s.interaction?.id === o.interactionId)?.title ?? copy.discoveryFallback
    return `${title} · 人工确认${o.discovery ? ` · ${discoveryLabels[o.discovery.category]}${o.discovery.note ? `：${o.discovery.note}` : ''}` : ''}`
  })
  return [definition.title, p.labels.journal, `${copy.role}：${journeyTitle(state, presentation)}`, `${copy.choiceHeading}：${state.choices.map(c => c.label).join('；') || copy.noChoices}`,
    `${copy.discoveriesHeading}：${observations.join('；') || copy.noDiscoveries}`, `${copy.chapters}：${scenes.join(' → ')}`,
    state.directorUsed ? `${locationLabel(p)} · 使用过导演跳幕，仅记录实际互动` : `${locationLabel(p)} · 故事情节为文学演绎`].join('\n')
}

const xml = (text: string) => Array.from(text).filter(c => {
  const code = c.codePointAt(0)!
  return [9, 10, 13].includes(code) || (code >= 32 && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff)
}).join('').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

function lines(text: string, width: number, count: number): string[] {
  const chars = Array.from(text.replace(/[\r\n\t]/g, ' '))
  return Array.from({ length: Math.max(1, Math.min(count, Math.ceil(chars.length / width))) }, (_, i) =>
    chars.slice(i * width, (i + 1) * width).join('') + (i === count - 1 && chars.length > width * count ? '…' : ''))
}

/** Self-contained vector keepsake: no scripts, remote media, foreignObject or user-controlled markup. */
export function journalSvg(definition: ExperienceDefinitionV1, state: ExperienceState, presentation?: ExperiencePresentation): string {
  const p = resolvePresentation(presentation)
  const palette = presentationPalette(p.preset)
  const copy = presentationCopy(p).journal
  const observations = state.observations.map(o => o.discovery?.note || (o.discovery ? discoveryLabels[o.discovery.category] : '完成一次人工观察')).join('；') || copy.emptyNote
  const choice = state.choices.map(c => c.label).join('；') || copy.noChoices
  const scenes = state.visitedSceneIds.map(id => definition.scenes.find(s => s.id === id)?.title).filter(Boolean).join(' → ')
  const block = (content: string[], x: number, y: number, size: number, color: string, gap: number) => content.map((line, i) => `<text x="${x}" y="${y + i * gap}" font-size="${size}" fill="${color}">${xml(line)}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1020" viewBox="0 0 720 1020" role="img" aria-labelledby="title">
<title id="title">${xml(definition.title)} · ${xml(p.labels.journal)}</title>
<rect width="720" height="1020" fill="${palette.background}"/><rect x="26" y="26" width="668" height="968" rx="12" fill="none" stroke="${palette.accent}" stroke-opacity=".5"/>
<g font-family="${palette.font}"><text x="64" y="88" fill="${palette.accent}" font-size="16" letter-spacing="3">${xml(copy.eyebrow)}</text>
${block(lines(definition.title, 16, 2), 64, 158, 34, palette.ink, 46)}
<text x="64" y="298" fill="${palette.accent}" font-size="28">${xml(journeyTitle(state, presentation))}</text>
<path d="M64 330H656" stroke="${palette.accent}" stroke-opacity=".3"/>
<text x="64" y="380" fill="${palette.muted}" font-size="17">${xml(copy.choiceHeading)}</text>${block(lines(choice, 26, 3), 64, 421, 21, palette.ink, 32)}
<text x="64" y="549" fill="${palette.muted}" font-size="17">${xml(copy.observationsTitle)}</text>${block(lines(observations, 26, 5), 64, 590, 21, palette.ink, 32)}
<text x="64" y="804" fill="${palette.muted}" font-size="17">${xml(copy.chapters)}</text>${block(lines(scenes, 33, 3), 64, 840, 17, palette.ink, 27)}
<text x="64" y="960" fill="${palette.muted}" font-size="14">${state.directorUsed ? `${locationLabel(p)} · 导演跳幕记录 · 文学演绎` : `${locationLabel(p)} · 人工观察 · 文学演绎`}</text></g></svg>`
}
