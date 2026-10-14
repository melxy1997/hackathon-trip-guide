import { useEffect, useRef, useState } from 'react'
import { OfflinePreparationError, offlineRequest, type OfflineProgress, type OfflineStatus } from './offlineClient'
import { presentationCopy, type ExperiencePresentation } from '../experience/presentation'
import './offline.css'

export function OfflineDemoPanel({ presentation }: { presentation?: ExperiencePresentation }) {
  const copy = presentationCopy(presentation).offline
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
      if (mounted.current) { setStatus(result); setMessage(type === 'CLEAR' ? copy.cleared : copy.ready) }
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof Error ? error.message : copy.failed)
        if (error instanceof OfflinePreparationError && error.status) setStatus(error.status)
      }
    } finally { if (mounted.current) setBusy(false) }
  }
  return <section className="tw-offline" aria-label={copy.aria}>
    <div className="tw-offline-heading"><span>{copy.title}</span><b>{status?.ready ? copy.prepared : copy.unprepared}</b></div>
    <p>{copy.description}</p>
    <p className="tw-offline-state" role="status">{online ? copy.online : copy.offline}{status?.ready ? ` · ${copy.continue}` : ` · ${copy.connectFirst}`}</p>
    {progress && busy && <div><progress aria-label={copy.progressAria} max={progress.total} value={progress.done} /><small>{progress.done} / {progress.total} {copy.assetUnit}</small></div>}
    <div className="tw-offline-actions"><button disabled={busy || !import.meta.env.PROD || !online} onClick={() => void action('PREPARE')}>{busy ? copy.processing : status?.ready ? copy.retry : copy.prepare}</button>{status && <button disabled={busy} onClick={() => void action('CLEAR')}>{copy.clear}</button>}</div>
    {status && <small>{copy.packageLabel} {(status.bytes / 1024 / 1024).toFixed(1)} MB · {copy.buildLabel} {status.version.slice(0, 8)}</small>}
    {message && <p role="status">{message}</p>}
    <small>{import.meta.env.PROD ? copy.productionNote : copy.developmentNote}</small>
  </section>
}
