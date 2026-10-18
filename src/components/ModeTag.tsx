import type { TourMode } from '../lib/tourPackage'

export function ModeTag({ mode, inverse = false }: { mode?: TourMode; inverse?: boolean }) {
  const story = mode === 'story'
  return (
    <span data-mode={story ? 'story' : 'checkin'} data-inverse={inverse || undefined} className="tw-ui-badge shrink-0">
      {story ? '故事漫游' : '打卡漫游'}
    </span>
  )
}
