import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadTrailCatalog } from './trailCatalog'
import { listTrailDrafts } from './trailDrafts'
import type { TrailCatalogItem } from './trailSchema'

export function TrailManager() {
  const [published, setPublished] = useState<TrailCatalogItem[]>([])
  const [error, setError] = useState('')
  const drafts = listTrailDrafts()
  useEffect(() => { loadTrailCatalog().then(setPublished).catch(() => setError('已发布路线目录暂不可用；仍可新建本机草稿。')) }, [])
  const rows = [...drafts.map(trail => ({ ...trail, draft: true })), ...published.filter(item => !drafts.some(draft => draft.id === item.id)).map(item => ({ ...item, draft: false }))]
  return <section className="rounded-2xl border border-emerald-200 bg-[#f3f5ed] p-5 sm:p-7 text-[#193d32]" aria-label="运营路线管理"><p className="text-xs tracking-widest">TRAIL · 运营路线</p><h2 className="mt-2 text-xl font-medium">把目的地编排成一条探索路线</h2><p className="mt-2 text-sm text-gray-600">选择已有地点、调整顺序、配置可选推荐，再交付游客可打开的路线。</p><Link to="/publish/trails/new" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#245d48] px-4 text-sm text-white">新建探索路线</Link>{error && <p className="mt-3 text-sm">{error}</p>}<ul className="mt-4 space-y-3">{rows.map(item => <li key={item.id} className="rounded-lg border border-black/10 bg-white p-3"><strong className="text-sm">{item.title || '未命名路线'}</strong><span className="ml-2 text-xs text-gray-500">{item.draft ? '本机草稿/修改' : '已发布'}</span><div className="mt-2 flex flex-wrap gap-4 text-sm"><Link className="inline-flex min-h-11 items-center underline" to={`/publish/trails/${item.id}`}>编辑路线</Link>{published.some(row => row.id === item.id) && <Link className="inline-flex min-h-11 items-center underline" to={`/trail/${item.id}`}>打开游客路线</Link>}</div></li>)}</ul></section>
}
