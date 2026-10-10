import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { loadPublishedAttraction } from '../lib/catalog'
import { assertPublishedAttraction, type PublishedAttraction } from '../lib/tourPackage'
import { getDraft, toPublishedPackage } from '../lib/draftStore'
import { ExperiencePlayer } from '../experience/components/ExperiencePlayer'
import '../experience/experience.css'

export function ExperiencePage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const preview = params.get('preview') === '1'
  const director = params.get('director') === '1'
  const [result, setResult] = useState<{ id: string; preview: boolean; pkg?: PublishedAttraction; error?: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        let pkg: PublishedAttraction
        if (preview) {
          const draft = getDraft(id)
          if (!draft) throw new Error('本机没有这份草稿，请先在编辑器保存。')
          pkg = await toPublishedPackage(draft)
        } else pkg = await loadPublishedAttraction(id)
        assertPublishedAttraction(pkg)
        if (!cancelled) setResult({ id, preview, pkg })
      } catch (e) {
        if (!cancelled) setResult({ id, preview, error: e instanceof Error ? e.message : '故事加载失败' })
      }
    })()
    return () => { cancelled = true }
  }, [id, preview])
  if (!result || result.id !== id || result.preview !== preview) return <div className="tw-empty" role="status">正在启封故事…</div>
  if (result.error) return <div className="tw-empty"><h1>故事暂时无法打开</h1><p role="alert">{result.error}</p><Link to={preview ? `/publish/${id}` : '/'}>返回{preview ? '编辑器' : '发现页'}</Link></div>
  const pkg = result.pkg!
  if (!pkg.experience) return <div className="tw-empty"><h1>这里还没有主题故事</h1><p>这份景点包可以使用原版导览。</p><Link to={`/tour/${pkg.id}`}>打开景点导览</Link></div>
  return <ExperiencePlayer key={`${id}:${preview}:${pkg.publishedAt}`} pkg={{ ...pkg, experience: pkg.experience }} preview={preview} director={director} />
}
