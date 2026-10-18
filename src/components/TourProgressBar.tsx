import { useEffect, useRef } from 'react'
import chapterNode from '../assets/brand/chapter-node.svg'
import minuteTicks from '../assets/brand/minute-ticks.svg'

export interface TourChapter {
  id: string
  title: string
  stepCount: number
}

interface TourProgressBarProps {
  chapters: TourChapter[]
  cursor: { chapter: number; step: number }
  visible: boolean
  onJumpChapter: (chapterIndex: number) => void
}

/** 对齐 presentation ProgressBar：章=节点，点=slide */
export function TourProgressBar({ chapters, cursor, visible, onJumpChapter }: TourProgressBarProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!visible) return
    activeRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [cursor.chapter, visible])

  if (!visible) return null

  return (
    <div className="absolute bottom-[max(.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 max-w-[min(94vw,760px)] -translate-x-1/2 pointer-events-auto">
      <div className="relative overflow-hidden rounded-md border border-[#79552f]/30 bg-[#f8f6f0]/95 px-2 py-2 text-[#181f27] shadow-[0_12px_36px_rgba(24,31,39,.18)] backdrop-blur-md">
        <img
          src={minuteTicks}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-2 bottom-0 h-4 w-[calc(100%-1rem)] opacity-35"
        />
        <div className="relative flex gap-1 overflow-x-auto pb-1">
        {chapters.map((c, i) => {
          const isActive = i === cursor.chapter
          return (
            <button
              key={c.id}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onJumpChapter(i)}
              aria-current={isActive ? 'step' : undefined}
              className={`min-h-11 shrink-0 cursor-pointer rounded px-2.5 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79552f] ${
                isActive
                  ? 'border border-[#79552f] bg-[#f2ecdf] text-[#181f27]'
                  : 'border border-transparent text-[#354b46] hover:bg-[#eee8dc]'
              }`}
            >
              <span className="flex items-start gap-1.5">
                <img
                  src={chapterNode}
                  alt=""
                  aria-hidden="true"
                  className={`pointer-events-none h-7 w-7 shrink-0 ${isActive ? 'opacity-100' : 'opacity-55'}`}
                />
                <span className="min-w-0">
                  <span className="block text-[10px] text-[#79552f]">{i + 1}</span>
                  <span className="block text-xs whitespace-nowrap">{c.title}</span>
                </span>
              </span>
              {isActive && (
                <span className="mt-1 flex gap-1">
                  {Array.from({ length: c.stepCount }, (_, s) => (
                    <span
                      key={s}
                      className={`h-1.5 w-1.5 rounded-full ${
                        s <= cursor.step ? 'bg-[#79552f]' : 'bg-[#181f27]/20'
                      }`}
                    />
                  ))}
                </span>
              )}
            </button>
          )
        })}
        </div>
      </div>
    </div>
  )
}
