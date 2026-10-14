import { fileURLToPath } from 'node:url'
import { createGateway } from './gateway.ts'

const port = 8787
const server = createGateway({
  publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
  apiKey: process.env.DEEPSEEK_API_KEY,
  tavilyApiKey: process.env.TAVILY_API_KEY,
  baseUrl: process.env.DEEPSEEK_BASE_URL,
  model: process.env.DEEPSEEK_MODEL,
  ...(process.env.WEB_ORIGIN ? { allowedOrigins: process.env.WEB_ORIGIN.split(',').map(s => s.trim()) } : {}),
})
server.listen(port, '127.0.0.1', () => console.log(`Trip model gateway listening on port ${port}; model ${process.env.DEEPSEEK_API_KEY ? 'configured' : 'not configured'}`))
server.on('error', () => { console.error(`Model gateway could not start on port ${port}. Check whether another task service is already running.`); process.exitCode = 1 })
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.closeAllConnections(); server.close(() => process.exit(0)) })
