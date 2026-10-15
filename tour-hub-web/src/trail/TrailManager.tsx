import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadPublishedAttraction } from '../lib/catalog'
import { loadTrail, loadTrailCatalog } from './trailCatalog'
import { importTrailDraft, listTrailDrafts, removeTrailDraft, sameTrailContent } from './trailDrafts'
import { assertTrail, type TrailCatalogItem, type TrailDefinitionV1 } from './trailSchema'

export function TrailManager() {
  const navigate = useNavigate()
  const importInput = useRef<HTMLInputElement>(null)
  const operation = useRef(false)
  const [published, setPublished] = useState<TrailCatalogItem[]>([])
  const [snapshots, setSnapshots] = useState<Record<string, TrailDefinitionV1>>({})
  const [checked, setChecked] = useState(false)
  const [drafts, setDrafts] = useState(listTrailDrafts)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState('')
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const catalog = await loadTrailCatalog()
        if (cancelled) return
        setPublished(catalog); setChecked(true)
        const results = await Promise.allSettled(listTrailDrafts().filter(draft => catalog.some(row => row.id === draft.id)).map(draft => loadTrail(draft.id)))
        if (!cancelled) setSnapshots(Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [[result.value.trail.id, result.value.trail]] : [])))
      } catch { if (!cancelled) setError('已发布路线目录暂不可用；发布状态未核实，仍可编辑本机草稿。') }
    })()
    return () => { cancelled = true }
  }, [])
  const importFile = async (file: File) => {
    if (operation.current) return
    operation.current = true; setBusy(true); setError('')
    try {
      if (file.size > 64_000) throw new Error('路线 JSON 需小于 64 KB；图片仍引用基础景点资源，不嵌入文件。')
      let raw: unknown
      try { raw = JSON.parse(await file.text()) } catch { throw new Error('文件不是有效的路线 JSON；原有草稿未更改。') }
      const candidate = assertTrail(raw)
      const pkg = await loadPublishedAttraction(candidate.baseAttractionId).catch(() => { throw new Error(`基础景点 ${candidate.baseAttractionId} 不存在或无法读取。请先迁移对应的景点包，再导入路线。`) })
      const draft = importTrailDraft(candidate, pkg)
      navigate(`/publish/trails/${draft.id}`)
    } catch (e) { setError(e instanceof Error ? e.message : '导入失败，原有路线未更改。') }
    finally { operation.current = false; setBusy(false) }
  }
  const duplicate = async (id: string) => {
    if (operation.current) return
    operation.current = true; setBusy(true); setError('')
    try {
      const { trail, pkg } = await loadTrail(id)
      const draft = importTrailDraft({ ...trail, title: `${trail.title.slice(0, 95)} · 副本` }, pkg)
      navigate(`/publish/trails/${draft.id}`)
    } catch (e) { setError(e instanceof Error ? e.message : '复制失败；原有路线未更改。') }
    finally { operation.current = false; setBusy(false) }
  }
  const rows = [...drafts, ...published.filter(item => !drafts.some(draft => draft.id === item.id))]
  const filtered = rows.filter(item => `${item.title} ${item.id} ${item.baseAttractionId}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const status = (id: string) => {
    const draft = drafts.find(item => item.id === id)
    if (!draft) return '已发布'
    if (!checked) return '本机草稿 · 发布状态未核实'
    if (!published.some(item => item.id === id)) return '本机未发布'
    if (!snapshots[id]) return '本机草稿 · 发布内容待核实'
    return sameTrailContent(draft, snapshots[id]) ? '已发布 · 本机与线上一致' : '本机有未发布修改'
  }
  return <section className="rounded-2xl border border-emerald-200 bg-[#f3f5ed] p-5 sm:p-7 text-[#193d32]" aria-label="运营路线管理">
    <p className="text-xs tracking-widest">TRAIL · 运营路线</p><h2 className="mt-2 text-xl font-medium">把目的地编排成一条探索路线</h2>
    <p className="mt-2 text-sm text-gray-600">选择已有地点、调整顺序、配置可选推荐，再交付游客可打开的路线。</p>
    <div className="mt-4 flex flex-wrap gap-3"><Link to="/publish/trails/new" className="inline-flex min-h-11 items-center rounded-lg bg-[#245d48] px-4 text-sm text-white">新建探索路线</Link><button type="button" disabled={busy} onClick={() => importInput.current?.click()} className="min-h-11 rounded-lg border border-emerald-700 px-4 text-sm disabled:opacity-50">{busy ? '正在处理路线…' : '导入路线 JSON'}</button></div>
    <input ref={importInput} type="file" accept=".json,application/json" aria-label="选择路线 JSON 文件" hidden disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file) }} />
    <p className="mt-3 text-xs leading-relaxed text-gray-600">导入和复制都会创建新 ID 的本机草稿，不覆盖原路线。跨环境请同时保留对应的基础景点包；导入后仍需预览和发布。</p>
    {error && <p className="mt-3 text-sm" role="alert">{error}</p>}
    <label className="mt-4 block text-sm">查找路线<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="标题、路线 ID 或景点 ID" className="mt-2 block min-h-11 w-full rounded-lg border border-emerald-900/20 bg-white px-3" /></label>
    <p className="mt-2 text-xs text-gray-600" role="status">显示 {filtered.length} / {rows.length} 条路线</p>
    <ul className="mt-4 space-y-3">{filtered.map(item => {
      const isPublished = published.some(row => row.id === item.id)
      const hasDraft = drafts.some(row => row.id === item.id)
      return <li key={item.id} className="rounded-lg border border-black/10 bg-white p-3" aria-label={`路线 ${item.id}`}>
        <strong className="block break-words text-sm">{item.title || '未命名路线'}</strong><span className="mt-1 block text-xs text-gray-600">{status(item.id)}</span><code className="mt-1 block break-all text-xs text-gray-500">{item.id}</code>
        <div className="mt-2 flex flex-wrap gap-x-4 text-sm"><Link className="inline-flex min-h-11 items-center underline" to={`/publish/trails/${item.id}`}>编辑路线</Link>{isPublished && <><Link className="inline-flex min-h-11 items-center underline" to={`/trail/${item.id}`}>打开游客路线</Link><button type="button" className="min-h-11 underline disabled:opacity-50" disabled={busy} onClick={() => void duplicate(item.id)}>复制已发布版本</button></>}{hasDraft && <button type="button" className="min-h-11 underline disabled:opacity-50" disabled={busy} onClick={() => setRemoving(item.id)}>移除本机草稿</button>}</div>
        {removing === item.id && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm" role="group" aria-label="移除路线草稿确认"><p>仅移除本浏览器草稿，未发布修改会丢失，请先导出留存。已发布文件、游客进度与事件均会保留。</p><div className="mt-2 flex flex-wrap gap-4"><button type="button" className="min-h-11 underline" onClick={() => setRemoving('')}>保留草稿</button><button type="button" className="min-h-11 underline" onClick={() => { if (removeTrailDraft(item.id)) { setDrafts(current => current.filter(row => row.id !== item.id)); setRemoving('') } else setError('本机草稿移除失败，请检查浏览器存储。') }}>确认移除本机草稿</button></div></div>}
      </li>
    })}</ul>{!filtered.length && <p className="mt-4 text-sm">{query ? '没有匹配的路线，试试其他标题或 ID。' : '暂时没有路线，可以新建或导入一份。'}</p>}
  </section>
}
