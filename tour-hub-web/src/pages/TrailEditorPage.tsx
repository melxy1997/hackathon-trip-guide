import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadCatalog, loadPublishedAttraction } from '../lib/catalog'
import type { CatalogItem, PublishedAttraction } from '../lib/tourPackage'
import { loadTrail, loadTrailCatalog } from '../trail/trailCatalog'
import { getTrailDraft, newTrail, sameTrailContent, saveTrailDraft } from '../trail/trailDrafts'
import { assertTrail, trailFingerprint, type TrailDefinitionV1 } from '../trail/trailSchema'
import { TrailPlayer } from '../trail/TrailPlayer'
import '../trail/trail.css'

interface Editing { routeId: string; trail: TrailDefinitionV1; pkg: PublishedAttraction; catalog: CatalogItem[] }
export function TrailEditorPage() {
  const { id = 'new' } = useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Editing>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [publishedPath, setPublishedPath] = useState('')
  const [publication, setPublication] = useState<{ checked: boolean; trail?: TrailDefinitionV1 }>({ checked: false })
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [catalog, routeCatalog] = await Promise.all([loadCatalog(), loadTrailCatalog().catch(() => null)])
        if (id === 'new') {
          const preferred = catalog.find(item => item.id === 'yuyuan') ?? catalog[0]
          if (!preferred) throw new Error('先发布一个含地点的景点包，再创建路线。')
          const trail = newTrail(await loadPublishedAttraction(preferred.id))
          if (!cancelled) {
            if (!saveTrailDraft(trail)) throw new Error('浏览器无法保存新路线，请启用本机存储后重试。')
            navigate(`/publish/trails/${trail.id}`, { replace: true })
          }
          return
        }
        const draft = getTrailDraft(id)
        const data = draft ? { trail: draft, pkg: await loadPublishedAttraction(draft.baseAttractionId) } : await loadTrail(id)
        const existing = !draft ? data : routeCatalog?.some(item => item.id === id) ? await loadTrail(id).catch(() => null) : null
        if (!cancelled) {
          setEditing({ routeId: id, ...data, catalog }); setError(''); setShowPreview(false); setMessage('')
          setPublication({ checked: !!existing || (routeCatalog !== null && !routeCatalog.some(item => item.id === id)), trail: existing?.trail })
          setPublishedPath(existing && sameTrailContent(data.trail, existing.trail) ? `/trail/${id}` : '')
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '路线编辑器无法打开。') }
    })()
    return () => { cancelled = true }
  }, [id, navigate])
  const update = (trail: TrailDefinitionV1) => {
    if (!editing) return
    const inSync = publication.trail && sameTrailContent(trail, publication.trail)
    setEditing({ ...editing, trail }); setPublishedPath(inSync ? `/trail/${trail.id}` : ''); setShowPreview(false)
    setMessage(saveTrailDraft(trail) ? inSync ? '本机已保存，与已发布内容一致。' : '更改已保存在本机，尚未发布。' : '本机保存失败，请及时导出；当前更改仍在页面中。')
  }
  if (!editing || editing.routeId !== id) return <div className="tr-page"><div className="tr-empty">{error ? <><h1>路线编辑器暂时无法打开</h1><p role="alert">{error}</p><Link to="/publish">返回创作与运营工作台</Link></> : <p role="status">正在准备路线编辑器…</p>}</div></div>
  const { trail, pkg, catalog } = editing
  let valid: TrailDefinitionV1 | undefined; let validation = ''
  try { valid = assertTrail(trail, pkg) } catch (e) { validation = e instanceof Error ? e.message : '路线格式无效。' }
  const reorder = (index: number, delta: number) => { const checkpoints = [...trail.checkpoints]; const target = index + delta; if (target < 0 || target >= checkpoints.length) return; [checkpoints[index], checkpoints[target]] = [checkpoints[target], checkpoints[index]]; update({ ...trail, checkpoints }) }
  const toggleSpot = (spotId: string, selected: boolean) => {
    const spot = pkg.spots.find(spot => spot.id === spotId)!
    let checkpoints = trail.checkpoints.filter(cp => cp.spotId !== spotId)
    if (selected && checkpoints.length < 6) checkpoints = [...checkpoints, { id: `stop-${spot.id.slice(0, 60)}-${pkg.spots.indexOf(spot)}`, spotId, heading: spot.name, instruction: `在${spot.name}留意一处喜欢的细节，再亲手确认完成探索。`, stampLabel: spot.name.slice(0, 20) }]
    const recommendations = trail.recommendations?.map(rec => ({ ...rec, afterCheckpointId: checkpoints.some(cp => cp.id === rec.afterCheckpointId) ? rec.afterCheckpointId : checkpoints[0]?.id ?? '' }))
    update({ ...trail, checkpoints, ...(recommendations ? { recommendations } : {}) })
  }
  const changeBase = async (baseId: string) => {
    setBusy(true); setError('')
    try { const base = await loadPublishedAttraction(baseId); const next = newTrail(base, trail.id); setEditing({ ...editing, trail: next, pkg: base }); const saved = saveTrailDraft(next); setPublishedPath(''); setShowPreview(false); setMessage(saved ? '已从新的景点重建站点；尚未发布。' : '站点已重建，但本机保存失败，请及时导出。') }
    catch { setError('景点加载失败，原路线已保留。') } finally { setBusy(false) }
  }
  const publish = async () => {
    if (!valid) return
    setBusy(true); setError(''); setPublishedPath('')
    try {
      const response = await fetch('/__trip_guide/trails/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trail: valid }) })
      let data
      try { data = await response.json() } catch { throw new Error('当前站点没有开发态发布服务。请导出 JSON，加入静态站点后重新构建；本次尚未发布。') }
      if (!response.ok || !data.ok) throw new Error(data.error ?? '发布失败；本机草稿仍保留。')
      const published = await loadTrail(valid.id)
      const expected = assertTrail(data.trail, pkg)
      if (trailFingerprint(published.trail) !== trailFingerprint(expected)) throw new Error('发布内容尚未通过读取校验，请重试；暂不提供分享链接。')
      setEditing({ ...editing, trail: published.trail }); saveTrailDraft(published.trail)
      setPublication({ checked: true, trail: published.trail })
      setPublishedPath(`/trail/${published.trail.id}`); setMessage('已发布并重新读取校验。现在可将游客链接交给另一个浏览器。')
    } catch (e) { setError(e instanceof Error ? e.message : '发布失败；可先导出 JSON。') } finally { setBusy(false) }
  }
  const download = () => {
    if (!valid) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(valid, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `${valid.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('已导出路线 JSON。下载不等于发布；静态托管需加入数据文件和目录索引后重新构建。')
  }
  const recommendation = trail.recommendations?.[0]
  const editRecommendation = (patch: Partial<NonNullable<TrailDefinitionV1['recommendations']>[number]>) => { if (recommendation) update({ ...trail, recommendations: [{ ...recommendation, ...patch }] }) }
  const publicationLabel = !publication.checked ? '发布状态未核实' : !publication.trail ? '本机未发布' : sameTrailContent(trail, publication.trail) ? '已发布 · 本机与线上一致' : '本机有未发布修改'
  return <div className="tr-page"><header className="tr-header"><Link to="/publish">← 创作与运营工作台</Link><span>路线配置</span></header><main className="tr-editor"><small>TIMEWALKER · TRAIL EDITOR</small><h1>编排你的探索路线</h1><p>选择 3–6 个已有地点，调整顺序与引导语。预览只在本机；发布成功后才提供游客链接。</p><p className="tr-notice" aria-label="路线保存与发布状态">{publicationLabel}</p>
    <fieldset disabled={busy}><legend>路线主题</legend><label>基础景点（切换会重建站点）<select value={trail.baseAttractionId} onChange={event => void changeBase(event.target.value)}>{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>路线标题<input maxLength={100} value={trail.title} onChange={event => update({ ...trail, title: event.target.value })} /></label><label>路线简介<textarea maxLength={1000} value={trail.description} onChange={event => update({ ...trail, description: event.target.value })} /></label><div className="tr-row"><label>参考时长（分钟）<input type="number" min={1} max={480} value={trail.estimatedMinutes ?? ''} onChange={event => update({ ...trail, estimatedMinutes: event.target.value ? Number(event.target.value) : undefined })} /></label><label>关联故事（可选）<select value={trail.relatedExperienceId ?? ''} onChange={event => { const next = { ...trail }; if (event.target.value) next.relatedExperienceId = event.target.value; else delete next.relatedExperienceId; update(next) }}><option value="">不关联</option>{catalog.filter(item => item.experience).map(item => <option key={item.id} value={item.id}>{item.experience?.title}</option>)}</select></label></div></fieldset>
    <fieldset disabled={busy}><legend>选择已有地点（{trail.checkpoints.length} / 6）</legend><div className="tr-stop-options" style={{ flexWrap: 'wrap' }}>{pkg.spots.map(spot => <label key={spot.id}><input type="checkbox" checked={trail.checkpoints.some(cp => cp.spotId === spot.id)} disabled={trail.checkpoints.length >= 6 && !trail.checkpoints.some(cp => cp.spotId === spot.id)} onChange={event => toggleSpot(spot.id, event.target.checked)} />{spot.name}</label>)}</div></fieldset>
    <h2>站点顺序与内容</h2>{trail.checkpoints.map((cp, index) => <fieldset key={cp.id} disabled={busy} aria-label={`编辑站点 ${index + 1}`}><legend>{index + 1}. {pkg.spots.find(spot => spot.id === cp.spotId)?.name ?? cp.spotId}</legend><button className="tr-button" disabled={index === 0} onClick={() => reorder(index, -1)} aria-label={`上移第 ${index + 1} 站`}>↑ 上移</button><button className="tr-button" disabled={index === trail.checkpoints.length - 1} onClick={() => reorder(index, 1)} aria-label={`下移第 ${index + 1} 站`}>↓ 下移</button>{(['heading', 'instruction', 'stampLabel'] as const).map(key => <label key={key}>{({ heading: '站点标题', instruction: '探索引导语', stampLabel: '印章文案' })[key]}{key === 'instruction' ? <textarea maxLength={600} value={cp[key]} onChange={event => update({ ...trail, checkpoints: trail.checkpoints.map(item => item.id === cp.id ? { ...item, [key]: event.target.value } : item) })} /> : <input maxLength={key === 'heading' ? 100 : 20} value={cp[key]} onChange={event => update({ ...trail, checkpoints: trail.checkpoints.map(item => item.id === cp.id ? { ...item, [key]: event.target.value } : item) })} />}</label>)}</fieldset>)}
    <fieldset disabled={busy}><legend>可选运营推荐</legend><label className="tr-stop-options"><input type="checkbox" checked={!!recommendation} onChange={event => update({ ...trail, recommendations: event.target.checked ? [{ id: 'optional-recommendation', afterCheckpointId: trail.checkpoints[1]?.id ?? trail.checkpoints[0]?.id ?? '', title: '附近还有一段体验', description: '演示推荐，可自由选择，不影响完成路线。', label: 'demo_promotion' }] : [] })} />启用一个推荐位</label>{recommendation && <><label>展示在打卡之后<select value={recommendation.afterCheckpointId} onChange={event => editRecommendation({ afterCheckpointId: event.target.value })}>{trail.checkpoints.map(cp => <option key={cp.id} value={cp.id}>{cp.heading}</option>)}</select></label><label>推荐标记<select value={recommendation.label} onChange={event => editRecommendation({ label: event.target.value as typeof recommendation.label })}><option value="demo_promotion">运营推荐 · 演示</option><option value="editorial">编辑推荐</option><option value="sponsored">合作推广</option></select></label><label>推荐标题<input maxLength={100} value={recommendation.title} onChange={event => editRecommendation({ title: event.target.value })} /></label><label>推荐说明<textarea maxLength={600} value={recommendation.description} onChange={event => editRecommendation({ description: event.target.value })} /></label><label>推荐链接（可选，HTTPS 或本站详情）<input value={recommendation.href ?? ''} onChange={event => { const next = { ...recommendation }; if (event.target.value) next.href = event.target.value; else delete next.href; update({ ...trail, recommendations: [next] }) }} /></label></>}</fieldset>
    {validation && <p className="tr-notice" role="alert">{validation}</p>}{error && <p className="tr-notice" role="alert">{error}</p>}{message && <p className="tr-notice" role="status">{message}</p>}
    <div className="tr-actions"><button className="tr-button" disabled={!valid || busy} onClick={() => setShowPreview(!showPreview)}>{showPreview ? '收起草稿预览' : '预览本机路线'}</button><button className="tr-button" disabled={!valid || busy} onClick={download}>导出路线 JSON</button><button className="tr-button tr-primary" disabled={!valid || busy} onClick={() => void publish()}>{busy ? '正在处理…' : '发布演示路线'}</button></div>
    {publishedPath && <section className="tr-notice" aria-label="已发布游客链接"><Link className="tr-link" to={publishedPath}>打开已发布游客路线</Link><label>可分享的游客链接<input readOnly value={new URL(publishedPath, location.origin).href} onFocus={event => event.target.select()} /></label><button className="tr-button" onClick={() => { if (!navigator.clipboard?.writeText) { setMessage('请选中链接文字手动复制。'); return } navigator.clipboard.writeText(new URL(publishedPath, location.origin).href).then(() => setMessage('游客链接已复制。')).catch(() => setMessage('请选中链接文字手动复制。')) }}>复制游客链接</button></section>}
    {showPreview && valid && <TrailPlayer key={trailFingerprint(valid)} trail={valid} pkg={pkg} preview />}
  </main></div>
}
