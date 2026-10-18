import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { probeToolCalls, ProviderError } from '../.generated/agent/server/agent/model.js'
const { getAiConfig } = createRequire(import.meta.url)('../libs/runtime-config.cjs')
const config = getAiConfig()
if (!config.apiKey || !config.baseUrl) {
  console.error('未配置 DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL；未调用模型，也未验证工具能力。')
  process.exitCode = 2
} else {
  const startedAt = Date.now()
  let report
  try { report = { ...await probeToolCalls(config), at: startedAt, durationMs: Date.now() - startedAt } }
  catch (error) { report = { ok: false, model: config.model, at: startedAt, durationMs: Date.now() - startedAt, error: error instanceof ProviderError ? error.kind : 'invalid-tool-protocol' }; process.exitCode = 1 }
  const directory = path.resolve(process.env.DATA_DIR || '.', process.env.DATA_DIR ? 'agent-jobs/probes' : '.agent-jobs/probes')
  await mkdir(directory, { recursive: true })
  const file = path.join(directory, `${startedAt}.json`)
  await writeFile(file, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ ...report, reportFile: file }, null, 2))
}
