import { presentationForPreset, resolvePresentation, type ExperiencePresentation } from '../presentation'

export function PresentationEditor({ value, onChange }: { value?: ExperiencePresentation; onChange: (next: ExperiencePresentation) => void }) {
  const p = resolvePresentation(value)
  const field = 'mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm'
  const labels: Array<[keyof ExperiencePresentation['labels'], string]> = [['start', '开始按钮'], ['next', '下一幕按钮'], ['finish', '完成按钮'], ['journal', '记录标题'], ['stage', '地点单位']]
  return <details className="mb-5 rounded-xl border border-black/10 bg-white p-5"><summary className="cursor-pointer text-sm font-medium">展示主题与开场</summary>
    <p className="mt-3 text-xs text-gray-500">预设会填入一套开场和标签，之后可逐项修改。展示改动也需要重新审核。室内模式不使用 GPS 或精确路线。</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      <label className="text-sm">主题预设<select aria-label="主题预设" className={field} value={p.preset} onChange={e => onChange(presentationForPreset(e.target.value as ExperiencePresentation['preset']))}><option value="heritage">暖金书信</option><option value="cosmos">深空讯号</option></select></label>
      <label className="text-sm">叙事媒介<select className={field} value={p.motif} onChange={e => onChange({ ...p, motif: e.target.value as ExperiencePresentation['motif'] })}><option value="letter">书信</option><option value="transmission">讯号</option></select></label>
      <label className="text-sm">地点模式<select className={field} value={p.locationMode} onChange={e => onChange({ ...p, locationMode: e.target.value as ExperiencePresentation['locationMode'] })}><option value="outdoor">室外模拟到站</option><option value="indoor">室内手动进入展区</option></select></label>
    </div>
    <label className="mt-4 block text-sm">开场媒介标题<input className={field} maxLength={100} value={p.openingTitle} onChange={e => onChange({ ...p, openingTitle: e.target.value })} /></label>
    <label className="mt-4 block text-sm">开场媒介正文<textarea className={field} maxLength={1000} rows={3} value={p.openingText} onChange={e => onChange({ ...p, openingText: e.target.value })} /></label>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{labels.map(([key, label]) => <label className="text-sm" key={key}>{label}<input className={field} maxLength={80} value={p.labels[key]} onChange={e => onChange({ ...p, labels: { ...p.labels, [key]: e.target.value } })} /></label>)}</div>
  </details>
}
