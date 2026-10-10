import type { LngLat, PublishedSpot, Slide } from '../lib/tourPackage'

import type { ExperienceDefinitionV1 } from '../experience/experienceSchema'

export type { LngLat, Slide }
export type Spot = PublishedSpot & {
  /** AI 给出的地图检索词；仅发布端草稿使用，导出契约前可忽略 */
  searchHint?: string
}

/** 发布端草稿（不进入展示端契约） */
export interface DraftAttraction {
  id: string
  name: string
  description: string
  /** 城市/区域，辅助高德检索与 AI */
  city?: string
  /** 高德检索到的景区与周边地点摘要，供 AI 生成 */
  amapContext?: string
  status: 'draft' | 'published'
  start: LngLat
  zoom: number
  spots: Spot[]
  coverImage: string
  createdAt: number
  updatedAt: number
  experience?: ExperienceDefinitionV1
}
