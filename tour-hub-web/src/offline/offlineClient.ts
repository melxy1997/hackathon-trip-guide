export interface OfflineStatus { ready: boolean; version: string; bytes: number; title: string; files: number }
export interface OfflineProgress { done: number; total: number }
export class OfflinePreparationError extends Error {
  status?: OfflineStatus
  constructor(message: string, status?: OfflineStatus) { super(message); this.status = status }
}

let registration: Promise<ServiceWorkerRegistration> | undefined
async function worker() {
  if (!import.meta.env.PROD) throw new Error('离线包在正式构建中可准备；开发模式仍可直接试玩。')
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)) throw new Error('此浏览器暂不支持离线准备。请使用 HTTPS 页面和支持离线存储的浏览器。')
  registration ??= navigator.serviceWorker.register('/offline-worker.js', { scope: '/', updateViaCache: 'none' }).catch(error => { registration = undefined; throw error })
  const registered = await registration
  if (!registered.active || !navigator.serviceWorker.controller) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(new Error('离线服务尚未启动，请刷新后重试。')) }, 15000)
      const check = () => { if (navigator.serviceWorker.controller) { cleanup(); resolve() } }
      const cleanup = () => { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', check) }
      navigator.serviceWorker.addEventListener('controllerchange', check)
      check()
    })
  }
  return navigator.serviceWorker.controller!
}

export async function offlineRequest(type: 'STATUS' | 'PREPARE' | 'CLEAR', onProgress?: (value: OfflineProgress) => void): Promise<OfflineStatus> {
  const target = await worker()
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = window.setTimeout(() => { channel.port1.close(); reject(new Error('离线服务响应较慢，请稍后检查准备状态。')) }, 120000)
    channel.port1.onmessage = event => {
      if (event.data.type === 'progress') { onProgress?.(event.data); return }
      clearTimeout(timer)
      channel.port1.close()
      if (navigator.serviceWorker.controller !== target) { reject(new Error('离线服务已更新，请重新检查准备状态后重试。')); return }
      if (event.data.type === 'result') resolve(event.data)
      else reject(new OfflinePreparationError(event.data.message, event.data))
    }
    target.postMessage({ type }, [channel.port2])
  })
}
