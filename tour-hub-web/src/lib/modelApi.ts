export async function requestModel<T>(path: '/api/builder/draft' | '/api/draft/spots' | '/api/scene/ask', body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)]) })
  let data
  try { data = await response.json() }
  catch { throw new Error('模型服务尚未启动或响应无效；可先使用模板起稿。') }
  if (!response.ok) throw new Error(`${data.error?.message ?? '请求失败'}${data.requestId ? `（请求 ${data.requestId}）` : ''}`)
  return data as T
}
