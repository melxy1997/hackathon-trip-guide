import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export type HeaderCta =
  | { label: string; to: string }
  | { label: string; onClick: () => void }

type HeaderBack = { label: string; to: string }

const CTA_CLASS =
  'shrink-0 rounded-[10px] bg-[#111827] px-4 py-2 text-sm font-medium text-white shadow-sm shadow-black/20 transition-colors hover:bg-[#374151]'

const BACK_CLASS =
  'inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-sm text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#111827]'

export function SiteHeader({ back, cta }: { back?: HeaderBack; cta?: HeaderCta }) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/[0.07] bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link to="/" className="group flex min-w-0 items-center" title="返回首页">
          <img
            src="/timewalker-logo.png"
            alt="时空漫游者 SPACETIME WANDERER"
            className="h-10 w-auto max-w-[min(68vw,250px)] object-contain"
          />
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          {back ? (
            <Link to={back.to} className={BACK_CLASS}>
              <ArrowLeft size={15} />
              {back.label}
            </Link>
          ) : null}

          {cta ? (
            'to' in cta ? (
              <Link to={cta.to} className={CTA_CLASS}>
                {cta.label}
              </Link>
            ) : (
              <button type="button" onClick={cta.onClick} className={`cursor-pointer ${CTA_CLASS}`}>
                {cta.label}
              </button>
            )
          ) : null}
        </div>
      </div>
    </header>
  )
}
