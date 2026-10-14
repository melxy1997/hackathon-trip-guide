import type { ExperiencePresentation } from '../experience/presentation.ts'

export function usesExhibitionOrder(presentation?: ExperiencePresentation): boolean {
  return presentation?.locationMode === 'indoor'
}

export function shouldResolveMapLocations(presentation?: ExperiencePresentation): boolean {
  return !usesExhibitionOrder(presentation)
}
