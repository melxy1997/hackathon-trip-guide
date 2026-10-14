/**
 * Copy to: tour-hub-web/server/agent/pipeline/storyCompiler.ts
 * Example implementation of the V1 compiler boundary.
 * Requires schemas.ts from the implementation plan and current repo types.
 * This file has NOT been compiled against the user's repo dependencies.
 */
import { BeatSheetSchema } from '../schemas.ts'
import {
  assertExperience,
  type ExperienceDefinitionV1,
  type Scene,
  type StoryBlock,
} from '../../../src/experience/experienceSchema.ts'
import type { PublishedAttraction } from '../../../src/lib/tourPackage.ts'

export function compileBeatSheet(
  input: unknown,
  sourcePackage: PublishedAttraction,
  imageRefByBeatId: Record<string, string> = {},
): ExperienceDefinitionV1 {
  const sheet = BeatSheetSchema.parse(input)
  const ids = new Set(sheet.beats.map(b => b.id))
  if (ids.size !== sheet.beats.length) throw new Error('Duplicate beat IDs')
  if (!ids.has(sheet.initialBeatId)) throw new Error('Initial beat missing')
  if (!sheet.concepts.some(c => c.id === sheet.selectedConceptId)) throw new Error('Chosen concept missing')
  const spotIds = new Set(sourcePackage.spots.map(s => s.id))
  const sourceIds = new Set(sheet.sources.map(s => s.id))
  const scenes: Scene[] = sheet.beats.map(beat => {
    if (beat.spotId && !spotIds.has(beat.spotId)) throw new Error(`Unknown spot: ${beat.spotId}`)
    if (beat.sourceIds.some(id => !sourceIds.has(id))) throw new Error(`Unknown source in ${beat.id}`)
    const blocks: StoryBlock[] = []
    const image = imageRefByBeatId[beat.id]
    if (image) blocks.push({ id: `${beat.id}-image`, type: 'image', assetRef: image })
    blocks.push({
      id: `${beat.id}-narration`, type: 'narration', text: beat.narration,
      ...(beat.fictional ? { fictional: true } : { fictional: false, sourceIds: beat.sourceIds }),
    })
    const mode: Scene['mode'] = beat.kind === 'choice' ? 'walk'
      : beat.kind === 'observation' ? 'observation' : beat.kind
    const base: Scene = { id: beat.id, title: beat.title, mode, blocks,
      ...(beat.spotId ? { spotId: beat.spotId } : {}) }
    if (beat.kind === 'ending') {
      if (beat.nextBeatId || beat.options) throw new Error(`Ending must not have exit: ${beat.id}`)
      return base
    }
    if (beat.kind === 'choice') {
      if (!beat.options || beat.options.length < 2) throw new Error(`Choice needs 2 options: ${beat.id}`)
      if (beat.options.some(o => !ids.has(o.targetBeatId))) throw new Error(`Invalid choice target: ${beat.id}`)
      return { ...base, interaction: {
        id: `${beat.id}-choice`, type: 'single_choice',
        options: beat.options.map(o => ({ id: o.id, label: o.label,
          actions: [{ type: 'goTo' as const, sceneId: o.targetBeatId }] })),
      } }
    }
    if (!beat.nextBeatId || !ids.has(beat.nextBeatId)) throw new Error(`Missing nextBeatId: ${beat.id}`)
    if (beat.kind === 'observation') return { ...base, interaction: {
      id: `${beat.id}-observation`, type: 'photo_or_tap',
      prompt: (beat.observationPrompt || '留意你眼前最感兴趣的细节。').slice(0,240),
      fallback: 'manual_confirm', actionsOnComplete: [{ type: 'goTo', sceneId: beat.nextBeatId }],
    } }
    return { ...base, transitions: [{ to: beat.nextBeatId }] }
  })
  const output: ExperienceDefinitionV1 = {
    schemaVersion: 1, id: sheet.experienceId, title: sheet.title, premise: sheet.premise,
    initialSceneId: sheet.initialBeatId, estimatedMinutes: sheet.estimatedMinutes,
    initialVariables: {}, scenes, sources: sheet.sources,
  }
  return assertExperience(output, { spotIds: [...spotIds], assets: sourcePackage.assets })
}
