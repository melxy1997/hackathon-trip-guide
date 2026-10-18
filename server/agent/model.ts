export interface ModelConfig { apiKey: string; baseUrl: string; model: string }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ModelMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
export interface ModelTool { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export class ProviderError extends Error { kind: string; constructor(kind: string) { super(`模型请求失败（${kind}）；未产生可用候选。请检查服务端配置或稍后重试。`); this.kind = kind } }
export async function boundedJson(response: Response, limit = 2_000_000): Promise<unknown> {
  if (!response.body) throw new Error('empty-response')
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw new Error('response-too-large'); chunks.push(value) }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { await reader.cancel().catch(() => {}) }
}
export async function callModel(config: ModelConfig, messages: ModelMessage[], options: { signal?: AbortSignal; tools?: ModelTool[]; toolChoice?: unknown; maxTokens?: number } = {}): Promise<ModelMessage> {
  if (!config.apiKey || !config.baseUrl) throw new ProviderError('not-configured')
  try {
    const url = new URL(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new ProviderError('invalid-url')
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.any([AbortSignal.timeout(45_000), ...(options.signal ? [options.signal] : [])]), redirect: 'error',
      body: JSON.stringify({ model: config.model, messages, stream: false, temperature: 0.7, max_tokens: options.maxTokens ?? 8000, ...(options.tools ? { tools: options.tools, tool_choice: options.toolChoice ?? 'auto' } : {}) }),
    })
    if (!response.ok) { await response.body?.cancel(); throw new ProviderError(`http-${response.status}`) }
    const body = await boundedJson(response) as { choices?: Array<{ finish_reason?: string; message?: ModelMessage }> }
    const choice = body.choices?.[0]; const message = choice?.message
    if (choice?.finish_reason === 'length' || !message || message.role !== 'assistant' || (message.content !== null && typeof message.content !== 'string') || (message.tool_calls !== undefined && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 4 || message.tool_calls.some(call => !call.id || call.type !== 'function' || !call.function || typeof call.function.arguments !== 'string' || call.function.arguments.length > 100_000 || typeof call.function.name !== 'string')))) throw new ProviderError('invalid-response')
    return { role: 'assistant', content: message.content, ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) }
  } catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError(options.signal?.aborted ? 'cancelled' : 'transport-or-json') }
}
export async function probeToolCalls(config: ModelConfig, signal?: AbortSignal) {
  const nonce = crypto.randomUUID()
  const tools: ModelTool[] = [{ type: 'function', function: { name: 'get_server_nonce', description: 'Read the actual server nonce.', parameters: { type: 'object', properties: {}, additionalProperties: false } } }]
  const messages: ModelMessage[] = [{ role: 'user', content: 'Call get_server_nonce, then return its nonce verbatim in your final answer.' }]
  const first = await callModel(config, messages, { tools, toolChoice: { type: 'function', function: { name: 'get_server_nonce' } }, signal })
  if (first.tool_calls?.length !== 1 || first.tool_calls[0].function.name !== 'get_server_nonce' || Object.keys(JSON.parse(first.tool_calls[0].function.arguments)).length) throw new ProviderError('tool-call-not-supported')
  messages.push(first, { role: 'tool', tool_call_id: first.tool_calls[0].id, content: JSON.stringify({ nonce }) })
  const final = await callModel(config, messages, { tools, toolChoice: 'none', signal })
  if (final.tool_calls?.length || !final.content?.includes(nonce)) throw new ProviderError('tool-result-not-consumed')
  return { ok: true as const, model: config.model, toolExecuted: 'get_server_nonce', roundTrips: 2 }
}
