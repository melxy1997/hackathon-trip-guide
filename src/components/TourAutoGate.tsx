interface TourAutoGateProps {
  visible: boolean
  onStart: () => void
}

/** 对齐 presentation AutoStartGate：解除浏览器自动播放限制 */
export function TourAutoGate({ visible, onStart }: TourAutoGateProps) {
  if (!visible) return null

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-[#24332d]/65 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md"
      onClick={onStart}
      role="dialog"
      aria-label="开始自动漫游"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-lg border border-[#79552f]/30 bg-[#f8f6f0] px-7 py-8 text-center text-[#181f27] shadow-[0_24px_64px_rgba(24,31,39,.32)] before:pointer-events-none before:absolute before:inset-3 before:rounded-md before:border before:border-[#50635d]/15"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs text-[var(--tw-scene-muted)]">自动漫游</p>
        <p className="mt-2 font-[var(--tw-font-editorial)] text-lg font-medium text-[var(--tw-scene-ink)]">准备开始</p>
        <p className="mt-2 text-sm text-[var(--tw-scene-muted)] leading-relaxed">
          将按路线依次走动，抵达后口播讲解；口播结束自动前往下一站。
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded bg-[#181f27] px-6 py-2.5 text-sm text-[#fffefb] shadow-sm transition-colors hover:bg-[#2d3944] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79552f]"
        >
          按 Space 或点击开始
        </button>
      </div>
    </div>
  )
}
