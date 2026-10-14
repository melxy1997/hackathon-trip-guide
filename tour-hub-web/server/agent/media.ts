import type { AgentCandidate } from '../../src/experience/agent/contracts.ts'
import { assertAgentCandidate } from '../../src/experience/agent/validators.ts'
import type { PublishedAttraction } from '../../src/lib/tourPackage.ts'
import { assetStore, digest, MediaError, type StoredImage } from './assetStore.ts'
import { generateImage, imageProviderBase, IMAGE_SIZE, type ImageProviderConfig } from './imageProvider.ts'

export interface MediaRequest { candidate: AgentCandidate; sceneId: string; artDirection: string; confirmBilling: true }
export function assertMediaRequest(raw: unknown): MediaRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new MediaError(400, 'INVALID_INPUT', '配图请求无效。')
  const value = raw as Record<string, unknown>
  if (Object.keys(value).some(key => !['candidate', 'sceneId', 'artDirection', 'confirmBilling'].includes(key))
    || typeof value.sceneId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value.sceneId)
    || (value.artDirection !== undefined && (typeof value.artDirection !== 'string' || value.artDirection.length > 600))) throw new MediaError(400, 'INVALID_INPUT', '请选择章节，画面补充要求最多 600 字。')
  if (value.confirmBilling !== true) throw new MediaError(400, 'BILLING_NOT_CONFIRMED', '请先勾选本次生图调用确认；也可继续使用原图。')
  return { candidate: value.candidate as AgentCandidate, sceneId: value.sceneId, artDirection: (value.artDirection as string | undefined)?.trim() ?? '', confirmBilling: true }
}
export function mediaService(directory: string, config: ImageProviderConfig) {
  const store = assetStore(directory, config.maxBytes)
  const pending = new Map<string, Promise<StoredImage>>()
  let active = 0
  return {
    read: store.read,
    async illustrate(raw: unknown, pkg: PublishedAttraction, signal: AbortSignal) {
      const request = assertMediaRequest(raw)
      let candidate: AgentCandidate
      try { candidate = assertAgentCandidate(request.candidate, pkg) } catch { throw new MediaError(422, 'CANDIDATE_INVALID', '候选已失效或引用无效，请重新编译后配图。') }
      const scene = candidate.experience.scenes.find(scene => scene.id === request.sceneId)
      if (!scene) throw new MediaError(400, 'SCENE_NOT_FOUND', '所选章节不存在。')
      const imageBlock = scene.blocks.find(block => block.type === 'image')
      if (!imageBlock) throw new MediaError(400, 'SCENE_IMAGE_MISSING', '所选章节没有图片块，请先在编辑器添加。')
      if (candidate.resourceManifest.resources.length >= 6) throw new MediaError(422, 'IMAGE_BUDGET', '当前候选已包含六份新增素材，请先完成作品或重新编译。')
      if (!config.apiKey || !config.model) throw new MediaError(503, 'IMAGE_NOT_CONFIGURED', '生图尚未配置 ARK_API_KEY / ARK_IMAGE_MODEL；现有图片仍可使用。')
      const spot = pkg.spots.find(spot => spot.id === scene.spotId)?.name ?? pkg.name
      const prompt = [
        'Vertical 9:16 cinematic story illustration. No text, lettering or logos. Original fictional artwork, not a venue photograph.',
        candidate.presentation.preset === 'cosmos' ? 'Deep blue, cold cyan, cosmic scale, science-fiction transmission, modern cinematic lighting.' : 'Warm gold, ink green, poetic Chinese garden, paper and water motifs, atmospheric illustration.',
        `Place: ${pkg.name}, ${spot}. Story: ${candidate.selectedConcept.title}. Chapter: ${scene.title}.`,
        `Narrative: ${scene.blocks.filter(block => block.text).map(block => block.text).join(' ').slice(0, 1800)}`,
        request.artDirection ? `Art direction: ${request.artDirection}` : '',
      ].filter(Boolean).join('\n')
      const requestKey = digest(JSON.stringify({ base: imageProviderBase(config.baseUrl), model: config.model, prompt, size: IMAGE_SIZE }))
      let image = await store.cached(requestKey)
      let cacheHit = !!image
      if (!image) {
        let task = pending.get(requestKey)
        if (task) cacheHit = true
        else {
          if (active >= 1) throw new MediaError(429, 'IMAGE_BUSY', '已有配图任务正在进行，请稍后再试。')
          active++
          task = (async () => {
            const generated = await generateImage(prompt, signal, config)
            return store.put(generated.data, generated.mime, { requestKey, model: config.model!, prompt })
          })()
          pending.set(requestKey, task)
        }
        try { image = await task }
        finally { if (pending.get(requestKey) === task) { pending.delete(requestKey); active-- } }
      }
      const result = structuredClone(candidate)
      const assetRef = `assets/agent/${image.file}`
      if (!result.resourceManifest.resources.some(resource => resource.assetRef === assetRef)) result.resourceManifest.resources.push({ id: `image-${image.hash.slice(0, 24)}`, kind: 'image', assetRef, value: image.url, sourceIds: [] })
      result.experience.scenes.find(scene => scene.id === request.sceneId)!.blocks.find(block => block.id === imageBlock.id)!.assetRef = assetRef
      result.diagnostics.push({ level: 'info', sceneId: scene.id, message: '本章已采用生成插画，图片已保存到本机素材目录；仍可人工编辑。' })
      const validated = assertAgentCandidate(result, pkg)
      return { candidate: validated, media: { assetRef, url: image.url, model: image.model, bytes: image.bytes, cacheHit, prompt: image.prompt } }
    },
  }
}
