import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { loadTrail } from '../trail/trailCatalog'
import { TrailPlayer } from '../trail/TrailPlayer'
import { trailFingerprint } from '../trail/trailSchema'

export function TrailPage() {
  const { id = '' } = useParams()
  const [result, setResult] = useState<{ id: string; data?: Awaited<ReturnType<typeof loadTrail>>; error?: string }>()
  useEffect(() => { let cancelled = false; loadTrail(id).then(data => { if (!cancelled) setResult({ id, data }) }).catch(error => { if (!cancelled) setResult({ id, error: error instanceof Error ? error.message : '路线加载失败。' }) }); return () => { cancelled = true } }, [id])
  if (!result || result.id !== id) return <div className="tr-empty" role="status">正在展开探索路线…</div>
  if (!result.data) return <div className="tr-empty"><h1>路线暂时无法打开</h1><p role="alert">{result.error}</p><Link to="/">返回体验列表</Link></div>
  return <TrailPlayer key={`${id}:${trailFingerprint(result.data.trail)}`} {...result.data} />
}
