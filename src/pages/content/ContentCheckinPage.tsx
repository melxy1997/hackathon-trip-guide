import { BuilderEntry } from '../../agent/BuilderEntry'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { GenProgressToast } from '../../components/GenProgressToast'
import { SpotContentPanel } from '../../components/SpotContentPanel'
import { VisitorAvatarPicker } from '../../components/VisitorAvatarPicker'
import { fillCheckinIntro, fillCheckinNode } from '../../lib/aiDraft'
import type { CheckinFields } from '../../lib/aiDraft'
import { isSpotPlaceholder } from '../../lib/draftStore'
import { attachSpotImage, attachVisitorAvatar } from '../../lib/imageUpload'
import type { DraftAttraction, Spot } from '../../types/attraction'

export interface ContentPageProps {
  draft: DraftAttraction
  /** 存档并回写上层状态，返回存好的那份 */
  persist: (next: DraftAttraction) => DraftAttraction
  /** 从阶段二带 `?spot=` 进来时选中的节点 */
  initialSpotId: string | null
}

/**
 * 阶段三 · 内容创作（打卡模式）：独立页面，不挂地图，只写文案
 */
export function ContentCheckinPage({ draft, persist, initialSpotId }: ContentPageProps) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(initialSpotId)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(
    null,
  )

  const selected = useMemo(() => {
    return draft.spots.find((s) => s.id === selectedId) || draft.spots[0] || null
  }, [draft, selectedId])

  const updateSpot = (spotId: string, patch: Partial<Spot>) => {
    persist({
      ...draft,
      spots: draft.spots.map((s) => (s.id === spotId ? { ...s, ...patch } : s)),
    })
  }

  const updateDraft = (patch: Partial<DraftAttraction>) => {
    persist({ ...draft, ...patch })
  }

  const updateSlide = (field: 'title' | 'bullets' | 'narration', value: string) => {
    if (!selected) return
    const slides = [...selected.slides]
    const slide = { ...slides[0] }
    if (field === 'bullets') {
      slide.bullets = value
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    } else {
      slide[field] = value
    }
    slides[0] = slide
    updateSpot(selected.id, { slides })
  }

  /**
   * AI 只写文案：简介一段 + 每个节点一段，各发一次请求。
   * 每段一跑完立刻落盘（中途关掉页面，已写完的段不会丢）；这一段没写成就不动原文案。
   */
  const onGenerateContent = async () => {
    if (busy) return
    const fieldsOf = (d: DraftAttraction): CheckinFields => ({
      name: d.name,
      description: d.description,
      city: d.city,
      amapContext: d.amapContext,
      spots: d.spots.map((s) => ({ name: s.name })),
    })

    let working = draft
    /** 一段跑完返回失败原因，null = 这段成了 */
    const steps: Array<{ label: string; run: () => Promise<string | null> }> = []
    let introDone = false
    let nodeDone = 0

    steps.push({
      label: '写景点简介',
      run: async () => {
        const r = await fillCheckinIntro(fieldsOf(working))
        if (!r.description) return r.reason || '没写出来'
        working = persist({ ...working, description: r.description })
        introDone = true
        return null
      },
    })

    draft.spots.forEach((spot, index) => {
      steps.push({
        label: `写「${spot.name}」`,
        run: async () => {
          const r = await fillCheckinNode(fieldsOf(working), index)
          if (r.source === 'mock') return r.reason || '这一段没写出来'
          const content = r.content
          working = persist({
            ...working,
            spots: working.spots.map((s) => {
              if (s.id !== spot.id) return s
              const slides = [...s.slides]
              slides[0] = content.slides[0]
              return { ...s, poetic: content.poetic, slides }
            }),
          })
          nodeDone += 1
          return null
        },
      })
    })

    const failures: string[] = []
    setBusy(true)
    try {
      for (let i = 0; i < steps.length; i++) {
        setProgress({ label: steps[i].label, done: i + 1, total: steps.length })
        setToast(`AI 正在${steps[i].label}`)
        const reason = await steps[i].run()
        if (reason) failures.push(`${steps[i].label}：${reason}`)
      }
    } finally {
      setProgress(null)
      setBusy(false)
    }

    setSelectedId((prev) => prev ?? working.spots[0]?.id ?? null)
    const written = [
      introDone ? '景点简介' : '',
      nodeDone > 0 ? `${nodeDone} 个节点的讲解` : '',
    ].filter(Boolean)
    const summary = written.length > 0 ? `已写入 ${written.join('、')}` : '什么都没写成'
    setToast(
      failures.length === 0
        ? summary
        : failures.length === steps.length
          ? `AI 未接通（${failures[0]}），这一趟什么都没写，原内容没动`
          : `${summary}（${failures.length} 段没写成、沿用了原文案：${failures[0]}）`,
    )
  }

  const onUploadImage = async (file: File) => {
    if (!selected) return
    try {
      persist(await attachSpotImage(draft, selected.id, file))
      setToast('图片已上传')
    } catch (e) {
      setToast(e instanceof Error ? e.message : '图片读取失败')
    }
  }

  const onUploadAvatar = async (file: File) => {
    try {
      persist(await attachVisitorAvatar(draft, file))
      setToast('头像已上传')
    } catch (e) {
      setToast(e instanceof Error ? e.message : '图片读取失败')
    }
  }

  if (!selected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--tw-color-canvas)] text-sm text-[var(--tw-color-ink-secondary)]">
        加载中…
      </div>
    )
  }

  const writtenCount = draft.spots.filter((s) => !isSpotPlaceholder(s)).length

  return (
    <div className="flex h-[100dvh] flex-col bg-[var(--tw-color-canvas)] text-[var(--tw-color-ink)]">
      <header className="z-20 grid min-h-16 shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-[var(--tw-color-divider)] bg-[color:var(--tw-color-overlay)] px-4 py-2 backdrop-blur-[var(--tw-blur-overlay)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6">
        <button
          type="button"
          onClick={() => navigate(`/publish/${draft.id}`)}
          className="inline-flex items-center gap-1 text-sm text-[var(--tw-color-ink-secondary)] hover:text-[var(--tw-color-ink)] shrink-0"
        >
          <ArrowLeft size={16} />
          调整地点
        </button>

        <div className="min-w-0 text-center">
          <p className="truncate text-[15px] font-medium">{draft.name}</p>
          <p className="text-[11px] text-[var(--tw-color-ink-secondary)] tabular-nums">
            {draft.spots.length} 个节点 · 已写 {writtenCount}
          </p>
        </div>

        <div className="col-span-2 grid w-full grid-cols-2 gap-2 sm:col-span-1 sm:flex sm:w-auto sm:shrink-0">
          <button
            type="button"
            onClick={() => void onGenerateContent()}
            disabled={busy}
            data-variant="secondary"
            data-size="sm"
            className="tw-ui-button min-w-0"
          >
            <Sparkles size={14} />
            {busy ? '生成中…' : 'AI 生成讲解'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/publish/${draft.id}/preview?from=content`)}
            data-variant="primary"
            data-size="sm"
            className="tw-ui-button min-w-0"
          >
            预览
          </button>
        </div>
      </header>

      <BuilderEntry draftId={draft.id} disabled={busy} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-6 sm:px-8 grid gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:items-start">
          <aside className="space-y-1 tw-ui-surface p-3 lg:sticky lg:top-6">
            <p className="px-1 pb-1 text-xs font-medium text-[var(--tw-color-ink-secondary)]">漫游节点</p>
            {draft.spots.map((spot, index) => {
              const active = spot.id === selected.id
              return (
                <button
                  key={spot.id}
                  type="button"
                  onClick={() => setSelectedId(spot.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`flex w-full items-center gap-2 rounded-[4px] border-l-2 px-2 py-2 text-left ${
                    active
                      ? 'tw-selected border-[var(--tw-color-ink)] font-medium'
                      : 'border-transparent hover:bg-[var(--tw-color-surface-muted)]'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-[var(--tw-color-action)] text-white text-[11px] flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{spot.name}</span>
                  <span
                    className={`shrink-0 text-[10px] ${
                      isSpotPlaceholder(spot) ? 'font-medium text-[var(--tw-color-accent-text)]' : 'text-[var(--tw-color-ink-secondary)]'
                    }`}
                  >
                    {isSpotPlaceholder(spot) ? '未写' : '已写'}
                  </span>
                </button>
              )
            })}
          </aside>

          <section className="mx-auto w-full max-w-3xl space-y-4">
            <div className="tw-ui-surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">景点简介</p>
                <p className="text-[11px] text-[var(--tw-color-ink-secondary)]">列表与封面用这段字</p>
              </div>
              <VisitorAvatarPicker
                value={draft.visitorAvatar}
                onUpload={(file) => void onUploadAvatar(file)}
                onReset={() => updateDraft({ visitorAvatar: undefined })}
              />
              <textarea
                value={draft.description}
                onChange={(e) => updateDraft({ description: e.target.value })}
                rows={3}
                placeholder="点「AI 生成讲解」会一并写好，也可以自己改"
                className="tw-ui-input min-h-0 resize-none bg-[var(--tw-color-surface-muted)] px-3 py-2 focus:bg-[var(--tw-color-surface)]"
              />
            </div>

            <div className="tw-ui-surface p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">节点内容</p>
                <p className="text-[11px] text-[var(--tw-color-ink-secondary)] tabular-nums">
                  第 {draft.spots.findIndex((s) => s.id === selected.id) + 1} / {draft.spots.length} 站
                </p>
              </div>
              <SpotContentPanel
                spot={selected}
                onPatch={(patch) => updateSpot(selected.id, patch)}
                onSlide={updateSlide}
                onUpload={(file) => void onUploadImage(file)}
              />
            </div>

            <p className="pb-6 text-center text-xs text-[var(--tw-color-ink-secondary)]">
              坐标在「调整地点」里改；这一页只写文案
            </p>
          </section>
        </div>
      </div>

      <GenProgressToast text={toast} progress={progress} busy={busy} onClose={() => setToast('')} />
    </div>
  )
}
