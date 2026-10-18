import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { briefSchema, idSchema, type BuilderJob } from '../../src/agent/contracts.ts'
import type { DraftAttraction } from '../../src/types/attraction.ts'
import { fingerprint, validateSource } from './compiler.ts'
import { JobStore } from './jobs.ts'
import { probe, researchAndConcepts, compileSelected, type RunContext } from './pipeline.ts'
import { tavilyServices, type ResearchServices } from './research.ts'
import { ProviderError, type ModelConfig } from './model.ts'

interface Options {
  storageRoot: string; privateRoot?: string
  drafts: { readDraft: (id: string) => DraftAttraction | null; createDraft: (draft: DraftAttraction) => DraftAttraction }
  getConfig: () => ModelConfig; readEnv: (name: string) => string
  research?: ResearchServices
}
const limit = (raw: string, fallback: number, min: number, max: number) => Number.isFinite(Number(raw)) && raw.trim() ? Math.max(min, Math.min(max, Math.floor(Number(raw)))) : fallback
export function createBuilderApi(options: Options) {
  const store = new JobStore(options.privateRoot ?? path.join(options.storageRoot, 'agent-jobs'))
  const active = new Map<string, AbortController>()
  const send = (res: ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
  const start = (job: BuilderJob, selected = false) => {
    const controller = new AbortController(); active.set(job.id, controller)
    const timer = setTimeout(() => controller.abort(), limit(options.readEnv('BUILDER_JOB_TIMEOUT_MS'), 240_000, 10_000, 300_000)); timer.unref()
    const ctx: RunContext = { source: store.snapshot(job.id), brief: job.brief, config: options.getConfig(), signal: controller.signal,
      research: options.research ?? tavilyServices(options.readEnv('TAVILY_API_KEY')), budget: job.budget,
      event(tool, status) { if (controller.signal.aborted) return; const at = Date.now(); job.events.push({ at, tool, status, durationMs: at - (job.events.at(-1)?.at ?? job.createdAt) }); job.events = job.events.slice(-80); store.save(job) },
    }
    const stage = (name: string, progress: number) => { controller.signal.throwIfAborted(); job.status = 'running'; job.stage = name; job.progress = progress; store.save(job) }
    void (async () => {
      try {
        if (!selected) {
          stage('验证模型工具调用', 5); await probe(ctx)
          stage('研究地点与构思双方案', 20)
          const result = await researchAndConcepts(ctx); controller.signal.throwIfAborted()
          job.research = result.research; job.concepts = result.concepts; job.status = 'awaiting-selection'; job.stage = '请选择故事概念'; job.progress = 50; store.save(job)
        } else {
          stage('设计结构并逐站编剧', 60)
          const concept = job.concepts!.find(concept => concept.conceptId === job.selectedConceptId)!
          const result = await compileSelected(ctx, job.research!, concept); controller.signal.throwIfAborted()
          store.write(job.id, `plan-v${job.version}.json`, result.plan); store.write(job.id, `narrative-v${job.version}.json`, result.narrative)
          store.write(job.id, `candidate-v${job.version}.json`, result.draft)
          job.candidateHash = fingerprint(result.draft); job.status = 'completed'; job.stage = '候选已完成，等待作者采纳'; job.progress = 100; store.save(job)
        }
      } catch (error) {
        if (store.read(job.id)?.status !== 'cancelled') { job.status = 'failed'; job.stage = controller.signal.aborted ? '任务已超时' : '当前阶段未完成'; job.error = controller.signal.aborted ? '任务超时，已保留之前的成果。' : error instanceof ProviderError ? error.message : '本阶段生成未完成；保留已有概念，可重新选择或调整需求新建任务。'; store.save(job) }
      } finally { clearTimeout(timer); active.delete(job.id) }
    })()
  }
  async function body(req: IncomingMessage) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('请发送 JSON')
    const chunks: Buffer[] = []; let bytes = 0
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 16_000) throw new Error('输入过长'); chunks.push(Buffer.from(chunk)) }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  }
  return {
    store,
    close() { for (const controller of active.values()) controller.abort() },
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const url = new URL(req.url || '/', 'http://localhost')
      if (!url.pathname.startsWith('/api/builder/')) return false
      try {
        if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { send(res, 403, { error: '仅允许当前站点操作' }); return true }
        if (url.pathname === '/api/builder/health' && req.method === 'GET') {
          const config = options.getConfig()
          send(res, 200, { ok: true, modelConfigured: !!config.apiKey && !!config.baseUrl, researchConfigured: !!options.readEnv('TAVILY_API_KEY'), model: config.model, engine: 'bounded-tool-pipeline', deepAgentsIntegrated: false }); return true
        }
        if (url.pathname === '/api/builder/jobs' && req.method === 'POST') {
          const brief = briefSchema.parse(await body(req)); const config = options.getConfig()
          if (!config.apiKey || !config.baseUrl || !options.readEnv('TAVILY_API_KEY')) { send(res, 503, { error: '请在服务端配置模型和 TAVILY_API_KEY 后重启；未创建任务或调用收费服务。' }); return true }
          if (active.size >= 2) { send(res, 429, { error: '已有两项任务执行，请稍后再试' }); return true }
          const source = options.drafts.readDraft(brief.sourceDraftId)
          if (!source) { send(res, 404, { error: '先打开并保存已有地点草稿，再开始创作' }); return true }
          validateSource(source)
          const now = Date.now()
          const job: BuilderJob = { id: `job-${randomUUID()}`, version: 0, sourceDraftId: source.id, sourceUpdatedAt: source.updatedAt, sourceFingerprint: fingerprint(source), brief, status: 'queued', stage: '已创建', progress: 0, createdAt: now, updatedAt: now, model: config.model, events: [], budget: { calls: 0, searches: 0, extracts: 0, maxCalls: limit(options.readEnv('BUILDER_MAX_MODEL_CALLS'), 12, 6, 24), maxSearches: limit(options.readEnv('BUILDER_MAX_WEB_SEARCHES'), 4, 1, 6) } }
          store.write(job.id, 'source.json', source); store.save(job); start(job)
          send(res, 202, { ok: true, job }); return true
        }
        const match = /^\/api\/builder\/jobs\/([a-zA-Z0-9_-]+)(?:\/(select-concept|candidate|artifacts|adopt|cancel))?$/.exec(url.pathname)
        if (!match) { send(res, 404, { error: '接口不存在' }); return true }
        idSchema.parse(match[1]); const job = store.read(match[1])
        if (!job) { send(res, 404, { error: '任务不存在' }); return true }
        const action = match[2]
        if (req.method === 'GET' && (!action || action === 'artifacts')) { send(res, 200, { ok: true, job }); return true }
        if (req.method === 'GET' && action === 'candidate') {
          if (!job.candidateHash) { send(res, 409, { error: '候选尚未完成' }); return true }
          send(res, 200, { ok: true, draft: store.candidate(job), version: job.version, hash: job.candidateHash }); return true
        }
        if (req.method === 'POST' && action === 'cancel') {
          if (!['queued', 'running'].includes(job.status)) { send(res, 409, { error: '任务当前没有运行' }); return true }
          active.get(job.id)?.abort(); job.status = 'cancelled'; job.stage = '已取消；阶段成果保留'; store.save(job); send(res, 200, { ok: true, job }); return true
        }
        if (req.method === 'POST' && action === 'select-concept') {
          const input = z.strictObject({ conceptId: idSchema }).parse(await body(req))
          if (!job.concepts?.some(concept => concept.conceptId === input.conceptId) || !job.research || active.has(job.id) || active.size >= 2) { send(res, 409, { error: '概念不可用或任务仍在执行，请稍后再试' }); return true }
          job.selectedConceptId = input.conceptId; job.version++; job.error = undefined; job.candidateHash = undefined
          // Each new compile has a fresh bounded budget; previous versions remain on disk.
          job.budget = { ...job.budget, calls: 0, searches: 0, extracts: 0 }; store.save(job); start(job, true)
          send(res, 202, { ok: true, job }); return true
        }
        if (req.method === 'POST' && action === 'adopt') {
          const input = z.strictObject({ version: z.number().int(), hash: z.string().length(64) }).parse(await body(req))
          if (job.status !== 'completed' || input.version !== job.version || input.hash !== job.candidateHash) { send(res, 409, { error: '候选版本已变化，请重新读取' }); return true }
          if (job.adoptedDraftId && job.adoptedVersion === job.version) { const existing = options.drafts.readDraft(job.adoptedDraftId); if (existing) { send(res, 200, { ok: true, draft: existing }); return true } }
          const current = options.drafts.readDraft(job.sourceDraftId)
          if (!current || fingerprint(current) !== job.sourceFingerprint) { send(res, 409, { error: '原草稿已修改或移除；请基于最新草稿重新创作，当前候选仍保留。' }); return true }
          const draft = store.candidate(job); const now = Date.now()
          const created = options.drafts.createDraft({ ...draft, id: `attr-agent-${randomUUID()}`, status: 'draft', createdAt: now, updatedAt: now })
          job.adoptedDraftId = created.id; job.adoptedVersion = job.version; store.save(job)
          send(res, 201, { ok: true, draft: created }); return true
        }
        send(res, 405, { error: '请求方法不支持' })
      } catch (error) {
        send(res, 400, { error: error instanceof z.ZodError ? error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('；').slice(0, 1000) : '请求未完成，请检查草稿内容和服务端目录。' })
      }
      return true
    },
  }
}
