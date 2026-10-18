import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MapPin } from 'lucide-react'
import orbitArc from '../assets/brand/orbit-arc.svg'
import minuteTicks from '../assets/brand/minute-ticks.svg'
import starCompass from '../assets/brand/star-compass.svg'
import { ModeTag } from '../components/ModeTag'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { ActionLink } from '../components/ui/Button'
import { Surface } from '../components/ui/Surface'
import { loadCatalog } from '../lib/catalog'
import type { CatalogItem, TourMode } from '../lib/tourPackage'

const MODE_LEGEND: Array<{ mode: TourMode; text: string }> = [
  { mode: 'checkin', text: '循着路线，完成一段城市行走' },
  { mode: 'story', text: '在分岔处，为故事选择下一页' },
]

const BANNER_INTERVAL_MS = 7000

export function HomePage() {
  const [list, setList] = useState<CatalogItem[]>([])
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    loadCatalog()
      .then(setList)
      .catch((reason) => setError(reason instanceof Error ? reason.message : '目录加载失败'))
  }, [])

  useEffect(() => {
    if (paused || list.length < 2) return
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % list.length), BANNER_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [paused, list.length])

  const active = list.length > 0 ? Math.min(index, list.length - 1) : 0

  return (
    <div className="tw-home flex min-h-screen flex-col bg-tw-canvas text-tw-ink">
      <SiteHeader cta={{ label: '发布后台', to: '/publish' }} />

      <main className="flex-1">
        <div className="tw-home-shell">
          <section className="tw-home-hero" aria-labelledby="home-title">
            <div className="tw-home-intro">
              <img src={orbitArc} alt="" className="tw-home-orbit" aria-hidden="true" />
              <p className="tw-ui-orbit-rule">City narratives · 城市叙事</p>
              <h1 id="home-title" className="tw-home-title">走进城市，读一段正在发生的时间。</h1>
              <p className="tw-home-deck">沿着一处地点的记忆、声音与街巷漫游。每一次抵达，都是一次与城市重新相识。</p>
              <p className="tw-home-intro-meta">以脚步为刻度，以街巷为书页</p>
            </div>

            <div
              className="tw-home-feature"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              onFocusCapture={() => setPaused(true)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
              }}
              aria-label="本期漫游"
            >
              {error ? (
                <Surface role="alert" className="tw-home-state text-[var(--tw-color-error)]">{error}</Surface>
              ) : list.length === 0 ? (
                <Surface role="status" className="tw-home-state">暂无已发布景点</Surface>
              ) : (
                <>
                  <div className="tw-home-feature-track" style={{ transform: `translateX(-${active * 100}%)` }}>
                    {list.map((item, itemIndex) => (
                      <Link key={item.id} to={`/tour/${item.id}`} className="tw-home-feature-slide">
                        <img src={item.coverImage} alt="" className="tw-home-feature-image" />
                        <div className="tw-home-feature-shade" />
                        <div className="tw-home-feature-content">
                          <span className="tw-home-feature-count">
                            <MapPin size={13} aria-hidden="true" /> 本期漫游 · {String(itemIndex + 1).padStart(2, '0')} / {String(list.length).padStart(2, '0')}
                          </span>
                          <div>
                            <ModeTag mode={item.mode} inverse />
                            <h2 className="tw-home-feature-title">{item.name}</h2>
                            {item.storyTitle ? <p className="tw-home-feature-story">{item.storyTitle}</p> : null}
                            <p className="tw-home-feature-description">{item.description}</p>
                            <span className="tw-home-feature-cta">开始这段漫游 <ArrowRight size={16} aria-hidden="true" /></span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                  {list.length > 1 ? (
                    <div className="tw-home-carousel-nav" role="group" aria-label="选择本期漫游">
                      {list.map((item, itemIndex) => (
                        <button
                          key={item.id}
                          type="button"
                          aria-label={`切换到 ${item.name}`}
                          aria-current={itemIndex === active ? 'true' : undefined}
                          onClick={() => setIndex(itemIndex)}
                          className="tw-home-carousel-dot"
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>

          {list.length > 0 && !error ? (
            <aside className="tw-home-legend" aria-label="漫游模式说明">
              <p className="tw-home-legend-count">已收录 {list.length} 段城市故事</p>
              <div className="tw-home-legend-items">
                {MODE_LEGEND.map((entry) => (
                  <div key={entry.mode} className="tw-home-legend-item">
                    <ModeTag mode={entry.mode} />
                    <span>{entry.text}</span>
                  </div>
                ))}
              </div>
            </aside>
          ) : null}

          {!error && list.length > 0 ? (
            <section className="tw-home-section" aria-labelledby="all-heading">
              <div className="tw-home-section-head">
                <div>
                  <p className="tw-home-kicker">Explore the archive · 目的地档案</p>
                  <h2 id="all-heading" className="tw-home-heading">城市漫游志</h2>
                </div>
                <p className="tw-home-section-note">选择一处，以自己的脚步开始阅读</p>
              </div>

              <img src={minuteTicks} alt="" className="tw-home-ticks" aria-hidden="true" />
              <div className="tw-home-collection">
                {list.map((item, itemIndex) => (
                  <article key={item.id} className="tw-home-card">
                    <Link to={`/tour/${item.id}`} aria-label={`进入${item.name}漫游`} className="tw-home-card-link">
                      <div className="tw-home-card-media">
                        <img src={item.coverImage} alt="" className="tw-home-card-image" />
                        <span className="tw-home-card-index">{String(itemIndex + 1).padStart(2, '0')}</span>
                      </div>
                      <div className="tw-home-card-body">
                        <div className="tw-home-card-topline">
                          <ModeTag mode={item.mode} />
                          <span>城市档案</span>
                        </div>
                        <h3 className="tw-home-card-title">{item.name}</h3>
                        {item.storyTitle ? <p className="tw-home-card-story">{item.storyTitle}</p> : null}
                        <p className="tw-home-card-description">{item.description}</p>
                        <span className="tw-home-card-cta">进入漫游 <ArrowRight size={15} aria-hidden="true" /></span>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="tw-home-editorial">
            <div className="tw-home-editorial-copy">
              <p className="tw-ui-orbit-rule">For city editors</p>
              <h2 className="tw-home-heading">把你熟悉的城市，写成一段可以行走的故事。</h2>
              <p>编辑景点、铺陈路线，让每一位到访者用自己的脚步完成阅读。</p>
              <ActionLink to="/publish" variant="secondary">进入发布后台 <ArrowRight size={16} aria-hidden="true" /></ActionLink>
            </div>
            <img src={starCompass} alt="" className="tw-home-compass" aria-hidden="true" />
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
