import { materializeMediaReference } from '../../lib/draftStore.ts'
import type { PublishedAttraction } from '../../lib/tourPackage.ts'
import { safeAssetUrl } from '../experienceSchema.ts'
import type { AgentCandidate } from './contracts.ts'
import { assertAgentCandidate } from './validators.ts'

/** Embed added media in the export copy; leave the working candidate and base package untouched. */
export async function portableAgentCandidate(candidate: AgentCandidate, pkg: PublishedAttraction,
  read = materializeMediaReference): Promise<AgentCandidate> {
  const result = structuredClone(assertAgentCandidate(candidate, pkg))
  const aliases = new Map<string, string>()
  const loaded = new Map<string, string>()
  for (const resource of result.resourceManifest.resources) {
    const original = resource.value
    let dataUrl = loaded.get(original)
    if (!dataUrl) { dataUrl = (await read(original)).dataUrl; loaded.set(original, dataUrl) }
    if (!dataUrl.startsWith('data:') || !safeAssetUrl(dataUrl, resource.kind)) throw new Error('新增素材无法携带导出，请压缩或替换该素材后重试。')
    resource.value = dataUrl
    aliases.set(original, resource.assetRef)
  }
  for (const scene of result.experience.scenes) for (const block of scene.blocks) {
    if (block.assetRef && aliases.has(block.assetRef)) block.assetRef = aliases.get(block.assetRef)!
  }
  for (const media of result.locationNotes.media) if (aliases.has(media.assetRef)) media.assetRef = aliases.get(media.assetRef)!
  return assertAgentCandidate(result, pkg)
}
