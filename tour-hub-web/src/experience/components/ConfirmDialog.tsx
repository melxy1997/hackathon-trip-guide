import { useEffect, useRef } from 'react'

export function ConfirmDialog({ title, description, onCancel, onConfirm }: {
  title: string
  description: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
      if (event.key !== 'Tab') return
      const buttons = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button') ?? [])]
      const first = buttons[0]
      const last = buttons.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [onCancel])
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
    <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-xl text-red-700" aria-hidden="true">!</div>
      <h2 id="delete-dialog-title" className="text-lg font-semibold text-gray-950">{title}</h2>
      <p id="delete-dialog-description" className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button ref={cancelRef} type="button" className="min-h-11 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium" onClick={onCancel}>取消</button>
        <button type="button" className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800" onClick={onConfirm}>确认删除</button>
      </div>
    </div>
  </div>
}
