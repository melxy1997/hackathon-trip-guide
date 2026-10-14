import { useEffect, useRef, useState } from 'react'
import { OfflinePreparationError, offlineRequest, type OfflineProgress, type OfflineStatus } from './offlineClient'
import './offline.css'

export function OfflineDemoPanel() {
  const [status, setStatus] = useState<OfflineStatus>()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<OfflineProgress>()
  const [message, setMessage] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const check = () => {
      setOnline(navigator.onLine)
      if (import.meta.env.PROD) void offlineRequest('STATUS').then(value => { if (mounted.current) setStatus(value) }).catch(error => { if (mounted.current) setMessage(error.message) })
    }
    check()
    window.addEventListener('online', check)
    window.addEventListener('offline', check)
    navigator.serviceWorker?.addEventListener('controllerchange', check)
    return () => { mounted.current = false; window.removeEventListener('online', check); window.removeEventListener('offline', check); navigator.serviceWorker?.removeEventListener('controllerchange', check) }
  }, [])
  async function action(type: 'PREPARE' | 'CLEAR') {
    setBusy(true); setMessage(''); setProgress(undefined)
    try {
      const result = await offlineRequest(type, value => { if (mounted.current) setProgress(value) })
      if (mounted.current) { setStatus(result); setMessage(type === 'CLEAR' ? '离线素材已清除，你的故事进度与手账记录仍保留。' : '准备完成。现在可以关闭网络，刷新后继续故事。') }
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof Error ? error.message : '离线准备失败，请重试。')
        if (error instanceof OfflinePreparationError && error.status) setStatus(error.status)
      }
    } finally { if (mounted.current) setBusy(false) }
  }
  return <section className="tw-offline" aria-label="离线故事包">
    <div className="tw-offline-heading"><span>把这段故事装进口袋</span><b>{status?.ready ? '离线已准备' : '尚未准备'}</b></div>
    <p>豫园家书与天文馆讯号：两份样例的分支、画面与旅途记录，可提前保存在当前浏览器。</p>
    <p className="tw-offline-state" role="status">{online ? '浏览器报告网络可用' : '浏览器报告已断网'}{status?.ready ? ' · 可离线继续本故事' : ' · 请先联网准备'}</p>
    {progress && busy && <div><progress aria-label="离线准备进度" max={progress.total} value={progress.done} /><small>{progress.done} / {progress.total} 份素材</small></div>}
    <div className="tw-offline-actions"><button disabled={busy || !import.meta.env.PROD || !online} onClick={() => void action('PREPARE')}>{busy ? '正在处理…' : status?.ready ? '重新检查并准备' : '准备离线故事'}</button>{status && <button disabled={busy} onClick={() => void action('CLEAR')}>清除离线素材</button>}</div>
    {status && <small>完整包约 {(status.bytes / 1024 / 1024).toFixed(1)} MB · 构建 {status.version.slice(0, 8)}</small>}
    {message && <p role="status">{message}</p>}
    <small>{import.meta.env.PROD ? '仅保证已准备的两份固定样例。地图、在线 AI、外部来源页面仍需联网。浏览器清理存储或新版本发布后，请重新检查准备状态。' : '开发模式可直接试玩；离线准备请使用 npm run build 与 npm run preview。'}</small>
  </section>
}
