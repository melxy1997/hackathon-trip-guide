import { Link } from 'react-router-dom'
import orbitDivider from '../assets/brand/orbit-divider.svg'

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--tw-color-divider)] bg-[var(--tw-color-surface)]">
      <div className="mx-auto w-full max-w-[var(--tw-page-max)] px-[var(--tw-page-gutter)] py-10 sm:py-12">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <Link to="/" className="flex items-center" title="返回首页">
            <img
              src="/timewalker-logo.png"
              alt="时空漫游者 SPACETIME WANDERER"
              className="h-11 w-auto max-w-[min(72vw,270px)] object-contain"
            />
          </Link>
          <div className="text-xs leading-6 text-tw-muted">
            <p>在城市的时间褶皱里，发现另一种抵达。</p>
            <p>TRIP HACKATHON 2026 · 焕新于技 · 第15届</p>
          </div>
        </div>
        <img src={orbitDivider} alt="" aria-hidden="true" className="tw-brand-ornament tw-brand-divider" />
        <p className="text-center text-xs text-tw-muted sm:text-left">© 2026 Trip.com Group · 携程技术</p>
      </div>
    </footer>
  )
}
