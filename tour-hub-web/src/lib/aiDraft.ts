import type { DraftAttraction, Spot } from '../types/attraction'
import type { LngLat } from './tourPackage'

const OFFSETS: LngLat[] = [
  { lng: -0.00035, lat: 0.00012 },
  { lng: -0.00015, lat: 0.00035 },
  { lng: 0.00018, lat: -0.00008 },
  { lng: 0.00005, lat: 0.00048 },
  { lng: 0.00055, lat: -0.00055 },
]

type AiSpotDraft = {
  name: string
  poetic?: string
  searchHint?: string
  slides?: Array<{
    title?: string
    bullets?: string[]
    narration?: string
  }>
}

export type GenerateDraftInput = Pick<
  DraftAttraction,
  'name' | 'description' | 'start' | 'city' | 'amapContext'
>

function mockSpots(attraction: GenerateDraftInput): Spot[] {
  const base = attraction.name.replace(/\s+/g, '') || '景点'
  const fromContext =
    attraction.amapContext
      ?.split('\n')
      .filter((l) => /^\d+\./.test(l.trim()))
      .map((l) => l.replace(/^\d+\.\s*/, '').split(' · ')[0]?.trim())
      .filter(Boolean) || []
  const names =
    fromContext.length >= 3
      ? fromContext.slice(0, 5)
      : [`${base}入口`, `${base}主景`, `${base}庭院`, `${base}碑亭`, `${base}出口`]
  const count = Math.min(5, Math.max(3, names.length))
  const center = attraction.start
  return Array.from({ length: count }, (_, i) => {
    const off = OFFSETS[i % OFFSETS.length]
    const name = names[i]
    return {
      id: `draft-${Date.now().toString(36)}-${i}`,
      name,
      poetic: `${attraction.name} · 第 ${i + 1} 站`,
      lng: center.lng + off.lng,
      lat: center.lat + off.lat,
      triggerRadiusMeters: 38,
      image: '/spots/map-intro.jpg',
      imageCredit: '',
      searchHint: `${attraction.city || ''} ${attraction.name} ${name}`.trim(),
      slides: [
        {
          title: name,
          bullets: [
            attraction.description.slice(0, 36) || `${attraction.name}的重要停驻点`,
            '可结合高德地点信息完善讲解',
            '地图上可拖动校准坐标',
          ],
          narration: `欢迎来到${attraction.name}。我们现在来到${name}，请稍作停留，感受这里的气息。`,
        },
      ],
    }
  })
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] || text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 未返回 JSON')
  return JSON.parse(raw.slice(start, end + 1))
}

function toSpots(attraction: GenerateDraftInput, drafts: AiSpotDraft[]): Spot[] {
  const center = attraction.start
  return drafts.slice(0, 8).map((d, i) => {
    const off = OFFSETS[i % OFFSETS.length]
    const name = (d.name || `节点 ${i + 1}`).trim()
    const slide = d.slides?.[0]
    const hint = (
      d.searchHint ||
      `${attraction.city || ''} ${attraction.name} ${name}`.trim()
    ).trim()
    return {
      id: `draft-${Date.now().toString(36)}-${i}`,
      name,
      poetic: (d.poetic || `${attraction.name} · 第 ${i + 1} 站`).trim(),
      lng: center.lng + off.lng,
      lat: center.lat + off.lat,
      triggerRadiusMeters: 38,
      image: '/spots/map-intro.jpg',
      imageCredit: '',
      searchHint: hint,
      slides: [
        {
          title: (slide?.title || name).trim(),
          bullets:
            Array.isArray(slide?.bullets) && slide!.bullets!.length > 0
              ? slide!.bullets!.map((b) => String(b).trim()).filter(Boolean).slice(0, 5)
              : [`${name}是${attraction.name}的重要停驻点`],
          narration: (
            slide?.narration || `欢迎来到${attraction.name}。这里是${name}，请稍作停留。`
          ).trim(),
        },
      ],
    } as Spot
  })
}

/** 调用 DeepSeek；把高德地点上下文一并输入。失败回落 mock */
export async function generateDraftSpots(attraction: GenerateDraftInput): Promise<Spot[]> {
  const baseUrl = import.meta.env.VITE_DEEPSEEK_BASE_URL
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY
  const model = import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat'

  if (!baseUrl || !apiKey) {
    return mockSpots(attraction)
  }

  const system = `你是文旅导览内容策划。根据景点信息与高德地图检索到的真实地点，生成 4～6 个导览节点。
优先选用高德返回的真实地点名称与游览顺序；可补充必要过渡点，但不要编造不存在的建筑。
只输出一个 JSON 对象，不要其它说明。格式：
{
  "spots": [
    {
      "name": "节点中文名（尽量与高德地点名一致）",
      "poetic": "简短诗意副标题",
      "searchHint": "用于高德地图检索的关键词，含城市与景点名，如：上海 豫园 三穗堂",
      "slides": [
        {
          "title": "讲解标题",
          "bullets": ["要点1", "要点2", "要点3"],
          "narration": "约80～150字口语讲解稿，可融入地点类型/地址信息"
        }
      ]
    }
  ]
}`

  const user = `景点名称：${attraction.name}
城市/区域：${attraction.city || '（未知）'}
简介：${attraction.description || '（无）'}

【高德地图地点信息】
${attraction.amapContext || '（暂无，请按常识规划合理游览顺序）'}

请基于以上高德地点生成实地可走的导览节点；searchHint 要便于再次地图定位。`

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: false,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    })
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`)
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('AI 无内容')
    const parsed = extractJson(content) as { spots?: AiSpotDraft[] }
    if (!Array.isArray(parsed.spots) || parsed.spots.length === 0) {
      throw new Error('AI JSON 无 spots')
    }
    return toSpots(attraction, parsed.spots)
  } catch (e) {
    console.warn('[aiDraft] fallback mock', e)
    return mockSpots(attraction)
  }
}
