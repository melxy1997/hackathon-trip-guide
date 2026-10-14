/** Actual gateway rehearsal, not a fixture generator. Requires a configured running API. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCreativeBrief } from '../src/experience/agent/validators.ts'
import { assertPublishedAttraction } from '../src/lib/tourPackage.ts'
import { parseStudioSession, sameBrief, validateStudioSession } from '../src/experience/agent/studioSession.ts'

const samples = {
  'yuyuan-timewalker': { theme: '寻找一封被园林保存至今的回信', style: 'heritage' },
  'shanghai-planetarium': { theme: '解码一段来自未来的深空讯号', style: 'cosmos' },
}
async function main() {
  const args = process.argv.slice(2)
  let apiBase = 'http://127.0.0.1:8787'
  let output = resolve('.agent-jobs', 'rehearsals', new Date().toISOString().replace(/[:.]/g, '-'))
  let ids = Object.keys(samples)
  let conceptIndex = 0
  let useResearch = false
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]
    if (flag === '--help') {
      console.log('npm run agent:rehearse -- [--attraction yuyuan-timewalker|shanghai-planetarium] [--concept 1|2] [--research] [--base-url http://127.0.0.1:8787] [--output directory]')
      return
    }
    if (flag === '--research') { useResearch = true; continue }
    const value = args[++index]
    if (!value) throw new Error('命令参数缺少值；使用 --help 查看用法。')
    if (flag === '--base-url') apiBase = value
    else if (flag === '--output') output = resolve(value)
    else if (flag === '--concept' && ['1', '2'].includes(value)) conceptIndex = Number(value) - 1
    else if (flag === '--attraction' && Object.hasOwn(samples, value)) ids = [value]
    else throw new Error('未知参数或样板 ID；使用 --help 查看用法。')
  }
  const base = new URL(apiBase)
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/'
    || !(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) throw new Error('网关地址需为无凭据 HTTPS origin 或本机 HTTP origin。')
  const request = async (path, body) => {
    let response
    try {
      response = await fetch(`${base.origin}${path}`, { ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(path.endsWith('/compile') ? 65_000 : 35_000), redirect: 'error' })
    } catch { throw new Error('网关不可达或请求超时；请检查 dev:api 和模型配置。') }
    let data
    try { data = await response.json() } catch { throw new Error('网关返回无效 JSON。') }
    if (!response.ok) throw new Error(`阶段失败：${data.error?.code ?? response.status}；请求 ${data.requestId ?? '未记录'}`)
    return data
  }
  const health = await request('/api/health')
  if (!health.modelConfigured || (useResearch && !health.researchConfigured)) {
    console.error('未执行生成：请先在服务端配置 DEEPSEEK_*；使用 --research 还需 TAVILY_API_KEY，并重启 API。')
    process.exitCode = 2
    return
  }
  const save = async (name, data) => {
    const target = resolve(output, name)
    await writeFile(`${target}.tmp`, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
    await rename(`${target}.tmp`, target)
  }
  const loadPackage = async id => assertPublishedAttraction(JSON.parse(await readFile(fileURLToPath(new URL(`../public/data/attractions/${id}.json`, import.meta.url)), 'utf8')))
  await mkdir(output, { recursive: true })
  const run = { schemaVersion: 1, startedAt: Date.now(), status: 'running', research: useResearch, samples: [] }
  await save('run.json', run)
  try {
    for (const id of ids) {
      const brief = assertCreativeBrief({ attractionId: id, ...samples[id], audience: 'general', targetMinutes: 5 })
      let researchId
      let researchPages = 0
      if (useResearch) {
        const result = await request('/api/agent/research', brief)
        researchId = result.dossier.id
        researchPages = result.dossier.pages.length
        await save(`${id}.research.json`, result)
      }
      const concepts = await request('/api/agent/concepts', { ...brief, ...(researchId ? { researchId } : {}) })
      await save(`${id}.concepts.json`, concepts)
      const selectedConcept = concepts.concepts?.[conceptIndex]
      if (!selectedConcept) throw new Error('构想响应缺少所选方案。')
      const result = await request('/api/agent/compile', { brief, basePackage: concepts.basePackage, selectedConcept, ...(researchId ? { researchId } : {}) })
      const session = await validateStudioSession(parseStudioSession(JSON.stringify({
        schemaVersion: 1, savedAt: Date.now(), brief, concepts: concepts.concepts, conceptBrief: brief,
        basePackage: concepts.basePackage, selection: selectedConcept.id,
        compiled: { candidate: result.candidate, provenance: { requestId: result.requestId, artifactId: result.artifact.id, artifactVersion: result.artifact.version, artifactHash: result.artifact.hash },
          evidence: { requestId: result.requestId, model: result.model, durationMs: result.durationMs, attempts: result.attempts } },
      })), loadPackage)
      if (!sameBrief(session.compiled.candidate.brief, brief) || session.compiled.candidate.selectedConcept.id !== selectedConcept.id) throw new Error('编译结果与本次简报/选择不一致。')
      await save(`${id}.studio.json`, session)
      run.samples.push({ attractionId: id, requestId: result.requestId, model: result.model, durationMs: result.durationMs, attempts: result.attempts,
        artifact: result.artifact, researchPages, studioFile: `${id}.studio.json` })
      await save('run.json', run)
      console.log(`完成 ${id}：${result.artifact.id}，${result.durationMs}ms；可在 /publish 导入 ${id}.studio.json`)
    }
    run.status = 'completed'
  } catch (error) {
    run.status = 'failed'
    run.error = error instanceof Error ? error.message : '彩排失败'
    throw error
  } finally { run.finishedAt = Date.now(); await save('run.json', run) }
  console.log(`成果目录：${output}`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : '彩排失败'); process.exitCode = 1 })
