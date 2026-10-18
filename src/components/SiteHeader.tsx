import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionLink, Button } from './ui/Button'

export type HeaderCta =
  | { label: string; to: string }
  | { label: string; onClick: () => void }

type HeaderBack = { label: string; to: string }

export function SiteHeader({ back, cta }: { back?: HeaderBack; cta?: HeaderCta }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--tw-color-divider)] bg-[color:var(--tw-color-overlay)] backdrop-blur-[var(--tw-blur-overlay)]">
      <div className="mx-auto flex h-[76px] w-full max-w-[var(--tw-page-max)] items-center justify-between gap-4 px-[var(--tw-page-gutter)]">
        <Link to="/" className="flex min-w-0 items-center" title="返回首页">
          <img
            src="/timewalker-logo.png"
            alt="时空漫游者 SPACETIME WANDERER"
            className="h-10 w-auto max-w-[min(60vw,250px)] object-contain"
          />
        </Link>

        <div className="flex shrink-0 items-center gap-1.5">
          {back ? (
            <Link
              to={back.to}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--tw-radius-control)] px-3 text-sm text-tw-muted transition-colors hover:bg-[var(--tw-color-surface-muted)] hover:text-tw-ink"
            >
              <ArrowLeft size={15} />
              <span className="hidden sm:inline">{back.label}</span>
            </Link>
          ) : null}
          {cta ? (
            'to' in cta ? (
              <ActionLink to={cta.to} size="sm">
                <Compass size={15} />
                {cta.label}
              </ActionLink>
            ) : (
              <Button onClick={cta.onClick} size="sm">
                <Compass size={15} />
                {cta.label}
              </Button>
            )
          ) : null}
        </div>
      </div>
    </header>
  )
}
