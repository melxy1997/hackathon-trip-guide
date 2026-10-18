import { z } from 'zod'

const text = (max: number) => z.string().trim().min(1).max(max)
export const idSchema = text(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).refine(id => !['constructor', 'prototype'].includes(id))
export const briefSchema = z.strictObject({
  sourceDraftId: idSchema, mode: z.enum(['story', 'checkin']), prompt: text(2000),
  audience: text(100).default('自由行游客'), storyStyle: text(100).default('沉浸、轻互动'),
  targetMinutes: z.number().int().min(3).max(180).default(20),
  rewritePolicy: z.enum(['redesign', 'keep-world']).default('redesign'),
})
export const conceptSchema = z.strictObject({
  conceptId: idSchema, title: text(100), logline: text(400), visitorRole: text(200),
  conflict: text(400), hook: text(400), climax: text(400), ending: text(400), visualStyle: text(300),
})
export const conceptsSchema = z.array(conceptSchema).length(2).superRefine((items, ctx) => {
  if (items[0].conceptId === items[1].conceptId || ['logline', 'conflict', 'hook'].some(key => items[0][key as keyof typeof items[0]] === items[1][key as keyof typeof items[0]])) ctx.addIssue({ code: 'custom', message: '两个构想的 ID、主线、冲突和开场须实质不同' })
})
export const researchSchema = z.strictObject({
  placeFacts: z.array(z.strictObject({ spotId: idSchema, detail: text(1000) })).max(20),
  motifs: z.array(text(200)).max(8), hooks: z.array(text(400)).max(6),
  sourceUrls: z.array(z.url().startsWith('https://')).max(6),
})
export const planSchema = z.strictObject({
  entrySpotId: idSchema,
  nodes: z.array(z.strictObject({ spotId: idSchema, toSpotIds: z.array(idSchema).max(3), role: text(100), dramaticBeat: text(600) })).min(2).max(20),
})
export const slideSchema = z.strictObject({ title: text(100), bullets: z.array(text(250)).min(1).max(5), narration: text(1500) })
export const narrativeSchema = z.strictObject({
  title: text(100), description: text(2000),
  spots: z.array(z.strictObject({
    spotId: idSchema, poetic: text(200), slides: z.array(slideSchema).min(1).max(4),
    choices: z.array(z.strictObject({ toSpotId: idSchema, label: text(100), note: text(200) })).max(3),
    endingTitle: text(150).optional(), imagePrompt: text(1500).optional(),
  })).min(2).max(20),
})
export type CreativeBrief = z.infer<typeof briefSchema>
export type StoryConcept = z.infer<typeof conceptSchema>
export type ResearchNotes = z.infer<typeof researchSchema>
export type StoryPlan = z.infer<typeof planSchema>
export type NarrativeDraft = z.infer<typeof narrativeSchema>
