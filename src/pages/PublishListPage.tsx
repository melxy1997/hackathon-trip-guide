import { Link, useNavigate } from 'react-router-dom'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import bookmarkRibbon from '../assets/brand/bookmark-ribbon.svg'
import mountainHorizon from '../assets/brand/mountain-horizon.svg'
import orbitalGrid from '../assets/brand/orbital-grid.svg'
import { ModeTag } from '../components/ModeTag'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { loadCatalog, loadPublishedAttraction } from '../lib/catalog'
import { createDraft, deleteDraft, isSpotPlaceholder, listLocalDrafts } from '../lib/draftStore'
import { listTrashedSpots, restoreSpotViaServer, trashSpotViaServer, type TrashedSpot } from '../lib/exportTarget'
import { storyBranchOutline } from '../lib/storyTour'
import type { CatalogItem, StoryGraph, TourMode } from '../lib/tourPackage'
import type { DraftAttraction, Spot } from '../types/attraction'

type ListRow = {
  id: string
  name: string
  description: string
  coverImage: string
  status: 'draft' | 'published'
  localOnly: boolean
  mode?: TourMode
  /** 当前节点（本地草稿优先，其次读发布包；读不到就是空数组） */
  spots: Spot[]
  /** 故事分支表，同样是草稿优先；打卡包没有 */
  story?: StoryGraph
}

function base(
  id: string,
  name: string,
  description: string,
  coverImage: string,
): Omit<ListRow, 'status' | 'localOnly' | 'mode' | 'spots' | 'story'> {
  return {
    id,
    name: name || '未命名景点',
    description: description || '暂无简介',
    coverImage,
  }
}

/** 节点统计：与编辑器同一口径（空要点 / 待完善 / 只剩地址行 = 未编辑） */
function nodeSummary(spots: Spot[]): { total: number; edited: number; names: string } {
  const edited = spots.filter((s) => !isSpotPlaceholder(s)).length
  return {
    total: spots.length,
    edited,
    names: spots.map((s) => s.name || '未命名节点').join(' → '),
  }
}

/** 发布包里是否有这个景点；有就顺带把节点与分支表读出来给列表用 */
async function loadPackageNodes(id: string): Promise<{ spots: Spot[]; story?: StoryGraph }> {
  try {
    const pkg = await loadPublishedAttraction(id)
    return { spots: pkg.spots, story: pkg.story }
  } catch {
    return { spots: [] }
  }
}

/** 与前台同一数据源 public/spots；本地未发布草稿附加在后 */
async function buildRows(catalog: CatalogItem[], drafts: DraftAttraction[]): Promise<ListRow[]> {
  const draftById = new Map(drafts.map((d) => [d.id, d]))
  const publishedIds = new Set(catalog.map((c) => c.id))

  const published = await Promise.all(
    catalog.map(async (c): Promise<ListRow> => {
      const local = draftById.get(c.id)
      const nodes = local ? { spots: local.spots, story: local.story } : await loadPackageNodes(c.id)
      return {
        ...base(c.id, c.name, c.description, c.coverImage),
        status: 'published',
        localOnly: false,
        mode: c.mode,
        spots: nodes.spots,
        story: nodes.story,
      }
    }),
  )

  const localOnly = drafts
    .filter((d) => !publishedIds.has(d.id))
    .map(
      (d): ListRow => ({
        ...base(d.id, d.name, d.description, d.coverImage || d.spots[0]?.image || ''),
        status: d.status,
        localOnly: true,
        mode: d.mode,
        spots: d.spots,
        story: d.story,
      }),
    )

  return [...published, ...localOnly]
}

export function PublishListPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ListRow[]>([])
  const [trashed, setTrashed] = useState<TrashedSpot[]>([])
  const [trashError, setTrashError] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [pendingDelete, setPendingDelete] = useState('')
  const [busy, setBusy] = useState('')
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => {
    void listTrashedSpots()
      .then((trash) => {
        setTrashed(trash)
        setTrashError('')
      })
      .catch((e) => {
        setTrashed([])
        setTrashError(e instanceof Error ? e.message : '回收站加载失败')
      })
    void listLocalDrafts()
      .then((drafts) =>
        loadCatalog()
          .then((catalog) => {
            setError('')
            return buildRows(catalog, drafts)
          })
          .catch(() => {
            setError('目录加载失败，只列出草稿')
            return buildRows([], drafts)
          }),
      )
      .then(setRows)
      .catch((e) => {
        setError(e instanceof Error ? e.message : '草稿加载失败')
        setRows([])
      })
  }, [])

  useEffect(() => {
    reload()
  }, [reload, tick])

  const onCreate = async () => {
    try {
      const item = await createDraft({
        name: '',
        description: '',
      })
      navigate(`/publish/${item.id}`)
    } catch (e) {
      setToast(e instanceof Error ? e.message : '新建草稿失败')
    }
  }

  const onDelete = async (row: ListRow) => {
    setPendingDelete('')
    if (row.localOnly) {
      try {
        await deleteDraft(row.id)
        setToast('已删除草稿')
        setTick((t) => t + 1)
      } catch (e) {
        setToast(e instanceof Error ? e.message : '删除草稿失败')
      }
      return
    }
    setBusy(row.id)
    try {
      const result = await trashSpotViaServer(row.id)
      await deleteDraft(row.id)
      setToast(`已移入回收站（${result.trashed.join('、')}），可在页面底部恢复`)
      setTick((t) => t + 1)
    } catch (e) {
      setToast(e instanceof Error ? e.message : '删除失败')
    } finally {
      setBusy('')
    }
  }

  const onRestore = async (entry: TrashedSpot) => {
    setBusy(entry.folder)
    try {
      await restoreSpotViaServer(entry.folder)
      setToast(`已恢复「${entry.name}」，前台与列表都回来了`)
      setTick((t) => t + 1)
    } catch (e) {
      setToast(e instanceof Error ? e.message : '恢复失败')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--tw-color-canvas)] text-[var(--tw-color-ink)]">
      <SiteHeader back={{ label: '返回前台', to: '/' }} cta={{ label: '新建景点', onClick: onCreate }} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <section className="mb-10 grid gap-6 border-b border-[var(--tw-color-divider)] pb-9 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
          <div>
            <p className="tw-ui-orbit-rule">Creator studio · 01</p>
            <h1 className="mt-5 font-tw-editorial text-3xl font-semibold tracking-[0.06em] sm:text-5xl">漫游创作台</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--tw-color-ink-secondary)]">
              从一处真实地点出发，编排时间、路径与叙事。你的每个草稿，都是一段尚待开启的旅程。
            </p>
          </div>
          <div className="relative grid grid-cols-3 overflow-hidden border-y border-[var(--tw-color-divider)] py-4 text-center">
            <img
              src={orbitalGrid}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-[0.18] lg:block"
            />
            <div className="relative"><strong className="block font-tw-editorial text-2xl">{rows.length}</strong><span className="text-[10px] tracking-[0.14em] text-[var(--tw-color-ink-secondary)]">全部作品</span></div>
            <div className="relative border-x border-[var(--tw-color-divider)]"><strong className="block font-tw-editorial text-2xl">{rows.filter((row) => row.status === 'draft').length}</strong><span className="text-[10px] tracking-[0.14em] text-[var(--tw-color-ink-secondary)]">创作中</span></div>
            <div className="relative"><strong className="block font-tw-editorial text-2xl">{rows.filter((row) => row.status === 'published').length}</strong><span className="text-[10px] tracking-[0.14em] text-[var(--tw-color-ink-secondary)]">已发布</span></div>
          </div>
        </section>

        <div className="space-y-6">

        {error ? (
          <div role="alert" data-kind="error" className="tw-feedback rounded-[8px] border border-[var(--tw-color-border)] bg-[var(--tw-color-surface)] px-6 py-5 text-sm">{error}</div>
        ) : null}

        {rows.length === 0 ? (
          <button
            type="button"
            onClick={onCreate}
            className="tw-ui-surface w-full border-dashed px-6 py-16 text-center hover:border-[var(--tw-color-focus)] hover:bg-[var(--tw-color-surface-muted)]"
          >
            <p className="text-base font-medium">创建第一个景点</p>
            <p className="mt-1 text-sm text-[var(--tw-color-ink-secondary)]">定范围 · AI+高德生成 · 发布</p>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--tw-color-ink-secondary)]">全部景点</h3>
              <span className="text-xs text-[var(--tw-color-ink-secondary)]">{rows.length} 个</span>
            </div>

            {rows.map((row) => {
              const summary = nodeSummary(row.spots)
              // 故事包优先列分叉；没有分叉（或没有分支表）就还是那条线性链条
              const branches = row.mode === 'story' ? storyBranchOutline(row) : []
              return (
                <div
                  key={row.id}
                  className="group grid gap-4 overflow-hidden tw-ui-surface p-3 transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--tw-shadow-card)] sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center"
                >
                  <Link to={`/publish/${row.id}`} className="contents">
                    <div className="relative h-full min-h-28 w-full overflow-hidden bg-[var(--tw-color-surface-muted)]">
                      {row.coverImage ? (
                        <img
                          src={row.coverImage}
                          alt=""
                          className="aspect-[16/9] h-full w-full object-cover sm:aspect-[4/3]"
                        />
                      ) : (
                        <img
                          src={mountainHorizon}
                          alt=""
                          aria-hidden="true"
                          className="pointer-events-none aspect-[16/9] h-full w-full object-contain p-4 opacity-60 sm:aspect-[4/3]"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <h4 className="truncate text-[15px] font-medium">{row.name}</h4>
                        <ModeTag mode={row.mode} />
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 border-l-2 pl-1.5 text-[11px] font-medium ${
                            row.status === 'published'
                              ? 'border-[var(--tw-success-700)] text-[var(--tw-success-700)]'
                              : 'border-[var(--tw-color-decorative)] text-[var(--tw-color-accent-text)]'
                          }`}
                        >
                          {row.status === 'published' && (
                            <img
                              src={bookmarkRibbon}
                              alt=""
                              aria-hidden="true"
                              className="pointer-events-none h-4 w-2.5 shrink-0"
                            />
                          )}
                          {row.status === 'published' ? '已发布' : '草稿'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-[var(--tw-color-ink-secondary)]">{row.description}</p>
                      {summary.total === 0 ? (
                        <p className="mt-1.5 text-[11px] text-[var(--tw-color-ink-secondary)]">暂无节点</p>
                      ) : (
                        <p className="mt-1.5 line-clamp-3 text-[11px] text-[var(--tw-color-ink-secondary)]">
                          {summary.total} 个节点 · 已编辑 {summary.edited} / 未编辑{' '}
                          {summary.total - summary.edited} ·{' '}
                          {branches.length > 0 ? branches.join(' · ') : summary.names}
                        </p>
                      )}
                    </div>
                  </Link>

                  <div className="flex shrink-0 items-center justify-end gap-1 border-t border-[var(--tw-color-divider)] pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                    {pendingDelete === row.id ? (
                      <>
                        <button
                          type="button"
                          data-variant="quiet"
                          data-size="sm"
                          className="tw-ui-button min-h-0 px-2 py-1.5 text-xs text-[var(--tw-color-ink-secondary)]"
                          onClick={() => setPendingDelete('')}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          data-variant="danger"
                          data-size="sm"
                          className="tw-ui-button min-h-0 px-2.5 py-1.5 text-xs"
                          onClick={() => onDelete(row)}
                        >
                          确认删除
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        data-variant="quiet"
                        data-size="sm"
                        className="tw-ui-button min-h-0 p-2 text-[var(--tw-color-ink-secondary)] hover:text-[var(--tw-danger-700)]"
                        title={row.localOnly ? '删除草稿' : '移入回收站（可恢复）'}
                        disabled={busy === row.id}
                        onClick={() => setPendingDelete(row.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {trashError ? (
          <div role="alert" data-kind="warning" className="tw-feedback rounded-[8px] border border-[var(--tw-color-border)] bg-[var(--tw-color-surface)] px-6 py-4 text-sm">{trashError}</div>
        ) : null}

        {trashed.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-[var(--tw-color-ink-secondary)]">已删除</h3>
            {trashed.map((entry) => (
              <div
                key={entry.folder}
                className="tw-ui-surface flex items-center gap-4 border-dashed px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <h4 className="truncate text-sm font-medium text-[var(--tw-color-ink-secondary)]">{entry.name}</h4>
                    <ModeTag mode={entry.mode} />
                    <span className="truncate text-[11px] text-[var(--tw-color-ink-secondary)]">{entry.id}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--tw-color-ink-secondary)]">
                    删除于 {new Date(entry.trashedAt).toLocaleString('zh-CN', { hour12: false })}
                  </p>
                </div>
                <button
                  type="button"
                  data-variant="secondary"
                  data-size="sm"
                  className="tw-ui-button shrink-0"
                  disabled={busy === entry.folder}
                  onClick={() => onRestore(entry)}
                >
                  <RotateCcw size={13} />
                  恢复
                </button>
              </div>
            ))}
          </div>
        )}
        </div>
      </main>

      <SiteFooter />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-kind="success"
          className="tw-feedback fixed bottom-3 left-3 right-3 z-40 flex min-h-11 items-center gap-3 rounded-[8px] border border-[var(--tw-color-border)] bg-[var(--tw-color-surface)] px-4 py-2.5 text-sm text-[var(--tw-color-ink)] shadow-[var(--tw-shadow-dialog)] sm:bottom-6 sm:left-1/2 sm:right-auto sm:max-w-[90vw] sm:-translate-x-1/2"
        >
          <span className="min-w-0 flex-1">{toast}</span>
          <button type="button" className="shrink-0 text-[var(--tw-color-link)] hover:underline" onClick={() => setToast('')}>
            关闭
          </button>
        </div>
      )}
    </div>
  )
}
