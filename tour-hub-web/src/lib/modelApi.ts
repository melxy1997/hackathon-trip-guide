type ModelPath = '/api/builder/draft' | '/api/agent/research' | '/api/agent/concepts' | '/api/agent/compile' | '/api/draft/spots' | '/api/scene/ask'

export async function requestModel<T>(path: ModelPath, body: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = path === '/api/agent/compile' ? 60_000 : 30_000
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeout)]) })
  let data
  try { data = await response.json() }
  catch { throw new Error('模型服务尚未启动或响应无效；可先使用模板起稿。') }
  if (!response.ok) throw new Error(`${data.error?.message ?? '请求失败'}${data.requestId ? `（请求 ${data.requestId}）` : ''}`)
  return data as T
}
