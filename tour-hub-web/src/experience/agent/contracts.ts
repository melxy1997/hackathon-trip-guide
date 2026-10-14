import type { ExperienceDefinitionV1 } from '../experienceSchema.ts'
import type { ExperiencePresentation } from '../presentation.ts'

export type AgentStyle = 'heritage' | 'cosmos'
export type AgentAudience = 'general' | 'family'

export interface BasePackageIdentity {
  id: string
  version: number
  fingerprint: string
}

export interface CreativeBrief {
  attractionId: string
  theme: string
  audience: AgentAudience
  targetMinutes: number
  style: AgentStyle
}

export interface LocationSource {
  id: string
  url: string
  title: string
  authority: 'official' | 'secondary'
}

export interface LocationMedia {
  id: string
  kind: 'image' | 'audio'
  assetRef: string
  sourceIds: string[]
}

export interface LocationNotes {
  basePackage: BasePackageIdentity
  spots: Array<{ id: string; name: string; summary: string }>
  media: LocationMedia[]
  sources: LocationSource[]
}

export interface StoryConcept {
  id: string
  title: string
  premise: string
  protagonist: string
  desire: string
  suspense: string
  locationRole: string
  resolution: string
}

export interface BeatBranch {
  id: string
  label: string
  summary: string
  spotId: string
  sceneIds: string[]
  rejoinsAtBeatId: string
}

export interface StoryBeat {
  id: string
  type: 'opening' | 'development' | 'choice' | 'observation' | 'ending'
  title: string
  summary: string
  spotId: string
  sceneIds: string[]
  observationTask?: string
  branches?: BeatBranch[]
}

export interface BeatSheet {
  conceptId: string
  beats: StoryBeat[]
}

export interface CandidateResource {
  id: string
  kind: 'image' | 'audio'
  assetRef: string
  value: string
  sourceIds: string[]
}

export interface ResourceManifest {
  resources: CandidateResource[]
  sources: LocationSource[]
}

export interface AgentDiagnostic {
  level: 'info' | 'warning'
  message: string
  beatId?: string
  sceneId?: string
}

export interface AgentCandidate {
  schemaVersion: 1
  basePackage: BasePackageIdentity
  brief: CreativeBrief
  locationNotes: LocationNotes
  selectedConcept: StoryConcept
  beatSheet: BeatSheet
  experience: ExperienceDefinitionV1
  presentation: ExperiencePresentation
  resourceManifest: ResourceManifest
  diagnostics: AgentDiagnostic[]
}
