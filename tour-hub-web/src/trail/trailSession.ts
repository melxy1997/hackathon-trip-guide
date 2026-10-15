import { trailFingerprint, type TrailDefinitionV1 } from './trailSchema.ts'

export interface TrailSession { schemaVersion: 1; trailId: string; fingerprint: string; sessionId: string; completedCheckpointIds: string[]; startedAt: number; updatedAt: number }
export type TrailEventName = 'trail_open' | 'checkpoint_confirm' | 'checkpoint_undo' | 'trail_complete' | 'trail_restart' | 'promotion_view' | 'promotion_click'
export interface TrailEvent { type: TrailEventName; trailId: string; sessionId: string; at: number; targetId?: string }
export const sessionKey = (id: string) => `timewalker:trail:v1:${id}`
export const eventKey = (id: string) => `timewalker:trail-events:v1:${id}`
export function freshTrailSession(trail: TrailDefinitionV1): TrailSession {
  return { schemaVersion: 1, trailId: trail.id, fingerprint: trailFingerprint(trail), sessionId: crypto.randomUUID(), completedCheckpointIds: [], startedAt: Date.now(), updatedAt: Date.now() }
}
export function restoreTrailSession(raw: string | null, trail: TrailDefinitionV1): TrailSession {
  const fresh = freshTrailSession(trail)
  try {
    const saved = JSON.parse(raw ?? 'null') as TrailSession | null
    if (!saved || saved.schemaVersion !== 1 || saved.trailId !== trail.id || saved.fingerprint !== fresh.fingerprint || !/^[a-zA-Z0-9-]{1,80}$/.test(saved.sessionId)
      || !Number.isSafeInteger(saved.startedAt) || !Number.isSafeInteger(saved.updatedAt) || saved.startedAt < 0 || saved.updatedAt < saved.startedAt
      || !Array.isArray(saved.completedCheckpointIds) || saved.completedCheckpointIds.length > trail.checkpoints.length
      || saved.completedCheckpointIds.some((id, index) => id !== trail.checkpoints[index].id)) return fresh
    return { ...fresh, sessionId: saved.sessionId, completedCheckpointIds: [...saved.completedCheckpointIds], startedAt: saved.startedAt, updatedAt: saved.updatedAt }
  } catch { return fresh }
}
export function confirmCheckpoint(session: TrailSession, trail: TrailDefinitionV1, checkpointId: string): TrailSession {
  if (session.fingerprint !== trailFingerprint(trail) || trail.checkpoints[session.completedCheckpointIds.length]?.id !== checkpointId) return session
  return { ...session, completedCheckpointIds: [...session.completedCheckpointIds, checkpointId], updatedAt: Date.now() }
}
export function undoCheckpoint(session: TrailSession): TrailSession {
  return session.completedCheckpointIds.length ? { ...session, completedCheckpointIds: session.completedCheckpointIds.slice(0, -1), updatedAt: Date.now() } : session
}
export function trailCardSvg(trail: TrailDefinitionV1, session: TrailSession): string {
  const plain = (text: string) => Array.from(text, char => {
    const code = char.codePointAt(0)!
    if (code < 32) return [9, 10, 13].includes(code) ? ' ' : ''
    if (code === 0xfffe || code === 0xffff) return ''
    return code >= 0xd800 && code <= 0xdfff ? '�' : char
  }).join('')
  const escape = (text: string) => plain(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
  // Wrap complete graphemes instead of slicing UTF-16; preserve the entire operator title.
  const lines: string[] = []; let line = ''; let columns = 0
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(plain(trail.title))) {
    if (columns === 16) { lines.push(line); line = ''; columns = 0 }
    line += segment; columns++
  }
  lines.push(line)
  const offset = (lines.length - 1) * 38
  const height = 920 + offset
  const stamps = trail.checkpoints.filter(cp => session.completedCheckpointIds.includes(cp.id))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}"><rect width="720" height="${height}" fill="#f7f1e4"/><rect x="24" y="24" width="672" height="${height - 48}" rx="24" fill="none" stroke="#b9915b" stroke-width="2"/><text x="56" y="100" fill="#245344" font-family="serif" font-size="20">TIMEWALKER · 主题探索纪念卡</text><text fill="#173e32" font-size="28">${lines.map((line, index) => `<tspan x="56" y="${166 + index * 38}">${escape(line)}</tspan>`).join('')}</text><text x="56" y="${210 + offset}" fill="#637367" font-size="18">已收集 ${stamps.length} / ${trail.checkpoints.length} 枚印章 · 手动确认</text>${stamps.map((cp, index) => `<circle cx="96" cy="${290 + offset + index * 80}" r="27" fill="#245344"/><text x="96" y="${297 + offset + index * 80}" text-anchor="middle" fill="#fff" font-size="20">${index + 1}</text><text x="146" y="${297 + offset + index * 80}" fill="#245344" font-size="23">${escape(cp.stampLabel)}</text>`).join('')}<text x="56" y="${835 + offset}" fill="#637367" font-size="17">由本次浏览器探索记录生成 · 非实地到站核验</text></svg>`
}
