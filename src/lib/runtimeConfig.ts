export type RuntimeConfig = {
  amapKey: string
  amapSecurityCode: string
}

function readRuntimeConfig(): RuntimeConfig {
  const config = window.__RUNTIME_CONFIG__
  if (!config) {
    throw new Error('运行时配置未加载，请确认 /runtime-config.js 可访问')
  }
  return config
}

export function getAmapKey(): string {
  return readRuntimeConfig().amapKey
}

export function getAmapSecurityCode(): string {
  return readRuntimeConfig().amapSecurityCode
}
