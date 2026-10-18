import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import fourStar from '../assets/brand/four-star.svg'
import {
  ensureEditableDraft,
  isSpotPlaceholder,
  publishDraft,
  toSelfContainedPackage,
} from '../lib/draftStore'
import { validateStoryGraph } from '../lib/storyTour'
import type { PublishedAttraction } from '../lib/tourPackage'
import type { DraftAttraction } from '../types/attraction'
import { StoryTourPage } from './StoryTourPage'
import { TourPage } from './TourPage'

/**
 * `/publish/:id/preview`：编辑端与前台之间的那一站 —— 按前台本尊的样子跑一遍草稿，发布也从这里出。
 * 草稿图片在内存里拼成自包含包（assets 里是 data URL）喂给前台页，所以预览**不写 public/spots**，
 * 也就能在任何时候进来（文案没写完也看得见），只有「发布」这一步按老规矩门控。
 */
export function PublishPreviewPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  /** 从哪个屏进来的（地图选点 / 内容创作），退出预览回哪儿 */
  const from = searchParams.get('from') === 'content' ? 'content' : 'map'

  const [draft, setDraft] = useState<DraftAttraction | null>(null)
  const [pkg, setPkg] = useState<PublishedAttraction | null>(null)
  const [failed, setFailed] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [published, setPublished] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const item = await ensureEditableDraft(id)
      if (cancelled) return
      if (!item) {
        navigate('/publish', { replace: true })
        return
      }
      if (item.spots.length === 0) {
        navigate(`/publish/${item.id}`, { replace: true })
        return
      }
      setDraft(item)
      try {
        const built = await toSelfContainedPackage(item)
        if (!cancelled) setPkg(built)
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : '预览包构建失败')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  /** 与编辑页同一套门控：节点文案写全 + 故事图没有硬错 */
  const blocked = useMemo(() => {
    if (!draft) return ''
    if (draft.spots.length === 0) return '请先生成或添加漫游节点'
    const written = draft.spots.filter((s) => !isSpotPlaceholder(s)).length
    if (written < draft.spots.length) {
      return `所有节点都写过文案后才能发布（${written}/${draft.spots.length}）`
    }
    if (draft.mode === 'story') {
      const blocker = validateStoryGraph(draft).find((i) => i.level === 'error')
      if (blocker) return blocker.message
    }
    return ''
  }, [draft])

  const exit = () => navigate(from === 'content' ? `/publish/${id}/content` : `/publish/${id}`)

  const onPublish = async () => {
    if (!draft || blocked) {
      if (blocked) setToast(blocked)
      return
    }
    setBusy(true)
    try {
      setToast('正在打包图片…')
      const result = await publishDraft(draft.id, { zoom: draft.zoom, start: draft.start })
      if (!result) {
        setToast('没有可发布的内容')
        return
      }
      setDraft(result.draft)
      setPublished(true)
      setToast(`已发布（${result.imageCount} 张图），前台可立即查看`)
    } catch (e) {
      setToast(e instanceof Error ? e.message : '导出失败')
    } finally {
      setBusy(false)
    }
  }

  if (failed) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--tw-color-canvas)] px-6 text-center">
        <p role="alert" data-kind="error" className="tw-feedback rounded-[8px] border border-[var(--tw-color-border)] bg-[var(--tw-color-surface)] px-5 py-4 text-sm">{failed}</p>
        <button type="button" onClick={exit} className="text-sm font-medium text-[var(--tw-color-link)] hover:underline">
          返回编辑
        </button>
      </div>
    )
  }

  if (!pkg || !draft) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--tw-color-canvas)] text-sm text-[var(--tw-color-ink-secondary)]">
        正在准备预览…
      </div>
    )
  }

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden">
      {pkg.mode === 'story' ? (
        <StoryTourPage key={pkg.id} pkg={pkg} />
      ) : (
        <TourPage key={pkg.id} initialPackage={pkg} />
      )}

      {/* 预览工具条：窄屏贴底铺开，宽屏浮在右下角，不占前台自己的版位 */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[60] sm:bottom-4 sm:left-auto sm:right-3 sm:max-w-[calc(100vw-1.5rem)]">
        <div className="tw-map-float pointer-events-auto grid grid-cols-2 gap-1 rounded-[8px] border border-[var(--tw-color-divider)] bg-[var(--tw-color-surface)]/95 p-1.5 shadow-[var(--tw-shadow-dialog)] backdrop-blur-md sm:flex sm:items-center">
          <span className="col-span-2 inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--tw-color-ink-secondary)] sm:col-auto sm:shrink-0">
            <img
              src={fourStar}
              alt=""
              aria-hidden="true"
              className="pointer-events-none h-3 w-3 shrink-0"
            />
            预览中
          </span>
          <button type="button" onClick={exit} data-variant="quiet" data-size="sm" className="tw-ui-button min-w-0 px-2">
            <ArrowLeft size={12} />
            退出预览
          </button>
          {published && (
            <Link to={`/tour/${draft.id}`} data-variant="secondary" data-size="sm" className="tw-ui-button min-w-0 px-2">
              去前台看
              <ExternalLink size={12} />
            </Link>
          )}
          <button
            type="button"
            onClick={() => void onPublish()}
            disabled={busy || !!blocked}
            title={blocked || undefined}
            data-variant="primary"
            data-size="sm"
            className="tw-ui-button col-span-2 min-w-0 sm:col-auto"
          >
            {busy ? '发布中…' : '发布'}
          </button>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-kind={published ? 'success' : 'info'}
          className="tw-feedback fixed bottom-3 left-3 right-3 z-[70] flex min-h-11 items-center gap-3 rounded-[8px] border border-[var(--tw-color-border)] bg-[var(--tw-color-surface)] px-4 py-2 text-sm text-[var(--tw-color-ink)] shadow-[var(--tw-shadow-dialog)] sm:bottom-6 sm:left-1/2 sm:right-auto sm:max-w-[90vw] sm:-translate-x-1/2"
        >
          <span className="min-w-0 flex-1 truncate">{toast}</span>
          <button type="button" className="shrink-0 text-[var(--tw-color-link)] hover:underline" onClick={() => setToast('')}>
            关闭
          </button>
        </div>
      )}
    </div>
  )
}
