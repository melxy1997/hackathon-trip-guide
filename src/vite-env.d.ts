/// <reference types="vite/client" />

interface Window {
  SERVERLESS_INJECT_PUBLIC_PATH?: string
  __RUNTIME_CONFIG__?: {
    amapKey: string
    amapSecurityCode: string
  }
}
