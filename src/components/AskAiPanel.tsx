import { useState } from 'react'
import { HelpCircle, MessageCircle, Send } from 'lucide-react'

/**
 * 故事页的"线索"上下文：问答要能答「我该怎么走」就得知道游客站在哪、能去哪。
 * 只喂已按"不回头"过滤过的去向，字面就是选项按钮上的字。
 */
export type AskClue = {
  /** 现在站在哪个节点 */
  here: string
  /** 当前节点的讲解要点，给模型当上下文 */
  detail?: string
  /** 下一步能去哪（`选项按钮上的字（约 N 米）`） */
  choices: string[]
  /** 这一程已走过 / 一共几个节点 */
  visited: number
  total: number
}

function buildSystemPrompt(name: string, clue?: AskClue) {
  const base = `你是${name}的AI导游。回答要简洁、口语化，控制在150字以内。`
  if (!clue) {
    return `${base}只能回答与该景点历史、建筑、文化相关的问题。如果问题无关，请礼貌拒绝。`
  }
  const here = clue.detail ? `「${clue.here}」（${clue.detail}）` : `「${clue.here}」`
  const next =
    clue.choices.length > 0
      ? `从这里可以走向：${clue.choices.join('、')}。`
      : '这里没有别的去向了，这一程到此收尾。'
  return `${base}游客正在按故事线游览：全程 ${clue.total} 个节点，已走过 ${clue.visited} 个，现在站在 ${here}。${next}问到"我该怎么走""下一步去哪"时，就照上面写明的去向给一句建议并说个理由，不要编造不存在的节点或出口；历史、建筑、文化也可以聊。跟这次游览和该景点无关的问题礼貌拒绝。`
}

const MOCK_ANSWERS: Record<string, string> = {
  豫园: '豫园始建于明代嘉靖、万历年间，是上海著名的江南古典园林，至今已有四百余年历史。',
  门票: '豫园需购票入园，可在官方渠道或现场购买，建议提前查询当日开放时间。',
  建筑: '豫园以亭台楼阁、假山池沼见长，玉玲珑、大假山、九曲桥都是标志性景观。',
  历史: '豫园原为四川布政使潘允端为父亲安度晚年所建，后历经战火与修复，成为上海城市名片。',
}

/** 右上角「问线索」按钮 + 展开的线索卡（故事页专用；打卡页是 TourPage 里那份「问 AI」，两处提示词各管各的） */
export function AskAiPanel({ name, clue }: { name: string; clue?: AskClue }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [asking, setAsking] = useState(false)

  const ask = async () => {
    if (!question.trim()) return
    setAsking(true)
    setAnswer('')
    const baseUrl = import.meta.env.VITE_DEEPSEEK_BASE_URL
    const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY
    const model = import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-v4.1-flash'

    try {
      if (!baseUrl || !apiKey) throw new Error('missing env')
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: buildSystemPrompt(name || '景点', clue) },
            { role: 'user', content: question.trim() },
          ],
          stream: false,
          max_tokens: 512,
        }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content?.trim()
      setAnswer(text || 'AI 没有返回内容')
    } catch {
      const q = question.trim()
      const hit = Object.keys(MOCK_ANSWERS).find((k) => q.includes(k))
      setAnswer(
        hit
          ? MOCK_ANSWERS[hit]
          : clue && clue.choices.length > 0
            ? `当前未接入 API，按线索看：从这里可以往${clue.choices.join('、')}走。`
            : `当前未接入 API，我先用本地知识回答：${name || '这里'}值得慢慢逛。`,
      )
    } finally {
      setAsking(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="story-ai-panel"
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded border border-[#d4af67]/35 bg-[rgba(5,8,17,.88)] px-3.5 py-2 text-sm text-[var(--tw-scene-ink)] shadow-[0_10px_35px_rgba(0,0,0,.3)] backdrop-blur-xl transition-colors hover:border-[#d4af67]/60 hover:bg-[rgba(15,20,34,.96)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tw-scene-accent)]"
      >
        <MessageCircle size={15} className="text-[var(--tw-scene-accent)]" />
        {open ? '收起问答' : '问线索'}
      </button>

      {open && (
        <div id="story-ai-panel" className="fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-[60] max-h-[min(52dvh,28rem)] overflow-y-auto rounded-lg border border-[#d4af67]/25 bg-[rgba(7,11,22,.96)] p-4 text-[var(--tw-scene-ink)] shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-xl sm:inset-x-auto sm:right-5 sm:max-h-[calc(100dvh-6rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:w-[min(92vw,380px)]">
          <div className="mb-3 flex items-center gap-2 text-[var(--tw-scene-ink)]">
            <HelpCircle size={15} className="text-[var(--tw-scene-muted)]" />
            <span className="text-sm font-medium">询问线索</span>
          </div>
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void ask()}
              placeholder="例如：我该怎么走？"
              aria-label="输入线索问题"
              className="min-h-11 min-w-0 flex-1 rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-[var(--tw-scene-ink)] outline-none placeholder:text-[var(--tw-scene-muted)] focus:border-[var(--tw-scene-accent)]/70 focus:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tw-scene-accent)]"
            />
            <button
              type="button"
              onClick={() => void ask()}
              disabled={asking || !question.trim()}
              aria-label={asking ? '正在询问' : '发送问题'}
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded bg-[var(--tw-scene-accent)] px-3 py-2 text-[#101820] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tw-scene-accent)] disabled:opacity-45"
            >
              {asking ? (
                <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
          {answer && (
            <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-3 text-sm leading-relaxed text-[var(--tw-scene-muted)]">
              {answer}
            </div>
          )}
        </div>
      )}
    </>
  )
}
