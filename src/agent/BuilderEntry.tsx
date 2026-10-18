import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { waitForDraftSave } from '../lib/draftStore'
export function BuilderEntry({ draftId, disabled }: { draftId: string; disabled: boolean }) {
  const navigate = useNavigate(); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  return <div className="shrink-0 border-b border-indigo-100 bg-indigo-50 px-4 py-2"><div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 text-xs text-indigo-900"><span>从已有地点，创作一个新的完整体验</span><button type="button" disabled={busy || disabled} className="min-h-11 rounded-lg border border-indigo-300 bg-white px-3 text-sm disabled:opacity-50" onClick={async () => { setBusy(true); setError(''); try { await waitForDraftSave(draftId); navigate(`/publish/${draftId}/agent`) } catch { setError('原稿保存尚未成功，请先保存后再开始。'); setBusy(false) } }}>{busy ? '正在保存原稿…' : 'AI 完整创作'}</button></div>{error && <p role="alert" className="text-xs text-red-600">{error}</p>}</div>
}
