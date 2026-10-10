import { readFileSync } from 'node:fs'
import type { PublishedAttraction } from '../../lib/tourPackage.ts'
import { assertExperience } from '../experienceSchema.ts'
import type { ExperienceState } from '../storyEngine.ts'

export function fixture() {
  const pkg = JSON.parse(readFileSync(new URL('../../../public/data/attractions/yuyuan-timewalker.json', import.meta.url), 'utf8')) as PublishedAttraction
  const definition = assertExperience(pkg.experience, { spotIds: pkg.spots.map(s => s.id), assets: pkg.assets })
  return { pkg, definition }
}
export function sceneEvent(state: ExperienceState) { return { sceneId: state.currentSceneId!, token: state.playbackToken! } }
