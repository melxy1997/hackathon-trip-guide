/**
 * AI 生成时的底部 toast：`progress` 非空就先显示「进度条 + 3/4」，
 * 跑完只剩一句话与关闭；忙时不给关闭，免得把进度从眼前关掉。
 */
export function GenProgressToast({
  text,
  progress,
  busy,
  onClose,
}: {
  text: string
  progress: { label?: string; done: number; total: number } | null
  busy: boolean
  onClose: () => void
}) {
  if (!text) return null
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-kind={busy ? 'info' : 'success'}
      className="tw-feedback fixed bottom-3 left-3 right-3 z-50 flex min-h-11 items-center gap-3 rounded-[8px] border border-[var(--tw-color-border)] bg-[var(--tw-color-surface)] px-4 py-2 text-sm text-[var(--tw-color-ink)] shadow-[var(--tw-shadow-dialog)] sm:bottom-6 sm:left-1/2 sm:right-auto sm:max-w-[90vw] sm:-translate-x-1/2"
    >
      {progress && (
        <>
          {/* 实心＝已跑完的段，浅色＝正在跑的这段（所以最后一段跑完时进度条才是满的） */}
          <span
            role="progressbar"
            aria-label={progress.label || 'AI 生成进度'}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={Math.max(0, progress.done - 1)}
            className="flex h-1.5 w-20 shrink-0 overflow-hidden rounded-[4px] bg-current/20 lg:w-28"
          >
            <span
              className="h-full bg-current transition-[width] duration-300"
              style={{ width: `${((progress.done - 1) / progress.total) * 100}%` }}
            />
            <span
              className="h-full bg-current/45 transition-[width] duration-300"
              style={{ width: `${(1 / progress.total) * 100}%` }}
            />
          </span>
          <span className="shrink-0 text-[11px] tabular-nums opacity-70">
            {progress.done}/{progress.total}
          </span>
        </>
      )}
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {!busy && (
        <button type="button" className="shrink-0 text-[var(--tw-color-link)] hover:underline" onClick={onClose}>
          关闭
        </button>
      )}
    </div>
  )
}
