import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { CatalogItem } from '../lib/tourPackage'
import { loadTrailCatalog } from '../trail/trailCatalog'
import type { TrailCatalogItem } from '../trail/trailSchema'
import { loadCatalog } from '../lib/catalog'
import { resolvePresentation, presentationPalette, locationLabel } from '../experience/presentation'
import { OfflineDemoPanel } from '../offline/OfflineDemoPanel'
import { offlineDemoIds } from '../offline/demoStories'

export function HomePage() {
  const [list, setList] = useState<CatalogItem[]>([])
  const [error, setError] = useState('')
  const [trails, setTrails] = useState<TrailCatalogItem[]>([])
  const [trailError, setTrailError] = useState('')
  useEffect(() => { loadTrailCatalog().then(setTrails).catch(() => setTrailError('主题路线暂不可用，仍可体验上方故事。')) }, [])

  useEffect(() => {
    loadCatalog()
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : '目录加载失败'))
  }, [])

  const featured = list.find(item => item.presentation?.locationMode !== 'indoor') || null
  const stories = list.filter(item => item.experience)

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#111827]">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-5 sm:px-8 h-14 bg-white/90 backdrop-blur border-b border-black/5">
        <div className="min-w-0">
          <h1 className="text-[15px] font-medium truncate">时空漫游者</h1>
          <p className="text-xs text-[#9ca3af]">让世界成为你的故事</p>
        </div>
        <Link
          to="/publish"
          className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm hover:bg-[#f3f4f6]"
        >
          发布后台
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-5 sm:px-8 py-6 sm:py-8 space-y-6">
        {error ? (
          <div className="rounded-2xl border border-red-100 bg-white px-6 py-8 text-sm text-red-600">{error}</div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-black/[0.06] bg-white px-6 py-16 text-center text-sm text-[#6b7280]">
            暂无已发布景点
          </div>
        ) : (
          <>
            {stories.map(item => {
              const p = resolvePresentation(item.presentation)
              const palette = presentationPalette(p.preset)
              return (
              <Link key={item.id} to={`/experience/${item.id}`} data-preset={p.preset} style={{ backgroundColor: palette.background }} className="relative block overflow-hidden rounded-2xl bg-[#17251d] text-[#f5ecd9] p-7 sm:p-10 min-h-[300px]">
                <img src={item.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
                <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${palette.background}, ${palette.background}cc, transparent)` }} />
                <div className="relative max-w-xl">
                  <p className="text-xs text-[#dcc497] tracking-widest mb-5">TIMEWALKER · 沉浸故事</p>
                  <h2 className={`text-3xl sm:text-4xl ${p.preset === 'cosmos' ? 'font-sans' : 'font-serif'} leading-relaxed mb-3`}>{item.experience?.title}</h2>
                  <p className="text-sm text-[#e2dac9] leading-relaxed">{item.description}</p>
                  <p className="mt-4 text-xs text-[#c5b897]">{item.experience?.estimatedMinutes} 分钟 · 分支探索 · {locationLabel(p)}</p>
                  <span style={{ backgroundColor: palette.accent }} className="mt-6 inline-flex items-center gap-3 bg-[#dcc497] text-[#15251c] px-5 py-3 rounded-lg text-sm">{p.labels.start} <ArrowRight size={16} /></span>
                </div>
              </Link>
            )})}
            <section aria-label="主题路线打卡"><h2 className="mb-3 text-xl font-medium">换一种方式 · 主题路线</h2><p className="mb-4 text-sm text-gray-500">按自己的节奏探索地点，收集一枚枚风景印章。</p>{trailError && <p className="text-sm text-gray-500">{trailError}</p>}{trails.map(trail => <Link key={trail.id} to={`/trail/${trail.id}`} className="mb-3 block rounded-2xl border border-emerald-900/15 bg-[#eaf0e7] p-6 text-[#193d32]"><p className="text-xs tracking-widest">TIMEWALKER · TRAIL</p><h3 className="my-3 font-serif text-2xl">{trail.title}</h3><p className="text-sm leading-relaxed">{trail.description}</p><p className="mt-4 text-xs">{trail.checkpointCount} 站 · {trail.estimatedMinutes ? `参考 ${trail.estimatedMinutes} 分钟 · ` : ''}手动打卡 · 集章纪念卡</p><span className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium">展开探索路线 <ArrowRight size={16} /></span></Link>)}</section>
            {stories.some(item => offlineDemoIds.includes(item.id)) && <OfflineDemoPanel />}
            {featured && (
              <Link
                to={`/tour/${featured.id}`}
                className="group relative block overflow-hidden rounded-2xl border border-black/[0.06] bg-[#111827] min-h-[220px] sm:min-h-[300px]"
              >
                <img
                  src={featured.coverImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-75 group-hover:scale-[1.02] transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                <div className="relative z-10 flex flex-col justify-end h-full min-h-[220px] sm:min-h-[300px] p-6 sm:p-8">
                  <h2 className="text-2xl sm:text-3xl font-medium text-white tracking-tight">
                    {featured.name}
                  </h2>
                  <p className="mt-2 text-sm text-white/80 max-w-xl line-clamp-2">{featured.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 self-start rounded-lg bg-white text-[#111827] px-3.5 py-2 text-sm font-medium">
                    开始导览
                    <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-[#6b7280]">全部景点</h3>
                <span className="text-xs text-[#9ca3af]">{list.length} 个</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map((item) => (
                  <Link
                    key={item.id}
                    to={item.experience ? `/experience/${item.id}` : `/tour/${item.id}`}
                    className="group rounded-2xl border border-black/[0.06] bg-white overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="aspect-[16/10] bg-[#f3f4f6] overflow-hidden">
                      <img
                        src={item.coverImage}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      />
                    </div>
                    <div className="p-3.5">
                      <h4 className="text-[15px] font-medium truncate">{item.name}</h4>
                      <p className="mt-1.5 text-sm text-[#6b7280] line-clamp-2">{item.description}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm text-[#3b82f6]">
                        开始
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
