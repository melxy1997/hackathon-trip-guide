type ApiResponse = {
  ok?: boolean
  error?: string
  message?: string
}

export type ApiRequestContext = {
  method?: string
  url: string
  failureMessage: string
}

/** Resolve management endpoints beneath the injected deployment path or Vite base. */
export function managementUrl(path: string): string {
  const configuredBase = window.SERVERLESS_INJECT_PUBLIC_PATH || import.meta.env.BASE_URL || '/'
  const baseWithSlash = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`
  const baseUrl = new URL(baseWithSlash, window.location.href)
  return new URL(path.replace(/^\/+/, ''), baseUrl).toString()
}

function serverText(text: string): string {
  const normalized = text.trim()
  return normalized || '<empty response>'
}

function responseStatus(response: Response): string {
  return `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
}

/** Parse an API envelope without leaking JSON syntax errors for HTML/text responses. */
export async function readApiJson<T>(response: Response, context: ApiRequestContext): Promise<T> {
  const method = (context.method || 'GET').toUpperCase()
  const url = response.url || context.url
  const text = await response.text()
  let data: (T & ApiResponse) | undefined

  try {
    data = JSON.parse(text) as T & ApiResponse
  } catch {
    throw new Error(
      `${context.failureMessage}: ${method} ${url} -> ${responseStatus(response)}; expected JSON; server response: ${serverText(text)}`,
    )
  }

  if (!response.ok || !data || data.ok !== true) {
    const detail = data?.error || data?.message
    throw new Error(
      `${context.failureMessage}: ${method} ${url} -> ${responseStatus(response)}${detail ? `; ${detail}` : ''}; server response: ${serverText(text)}`,
    )
  }

  return data
}
