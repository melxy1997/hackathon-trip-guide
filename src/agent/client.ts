import { siteUrl } from '../lib/sitePath'
export async function builderRequest<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try { response = await fetch(siteUrl(`/api/builder/${path}`), { cache: 'no-store', ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }) }
  catch { throw new Error('暂时无法连接创作服务，请保留任务 ID 后重试。') }
  let result
  try { result = await response.json() } catch { throw new Error('此站点未启用 Builder，请使用 Node 服务或 Vite 开发环境。') }
  if (!response.ok) throw new Error(result.error || `请求未完成（${response.status}）`)
  return result as T
}
