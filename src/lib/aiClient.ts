export type AiMessage = {
  role: 'system' | 'user'
  content: string
}

type AiResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

function runtimeUrl(path: string): string {
  const base = window.SERVERLESS_INJECT_PUBLIC_PATH || '/'
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export async function requestAiChat(options: {
  messages: AiMessage[]
  maxTokens?: number
  temperature?: number
}): Promise<string> {
  const res = await fetch(runtimeUrl('/api/ai/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    }),
  })
  if (!res.ok) throw new Error(`AI HTTP ${res.status}`)
  const data = (await res.json()) as AiResponse
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('AI 无内容')
  return text
}
