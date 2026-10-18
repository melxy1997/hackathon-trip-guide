// Explicit automation substitute, never used by the application runtime.
import http from 'node:http'
export async function fixtureModel() {
  const calls = []
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw); calls.push(body)
    let result
    const names = body.tools.map(tool => tool.function.name)
    const tool = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] })
    if (names.includes('get_server_nonce')) {
      const returned = body.messages.find(message => message.role === 'tool')
      result = returned ? { role: 'assistant', content: JSON.parse(returned.content).nonce } : tool('get_server_nonce', {})
    } else {
      const request = JSON.parse(body.messages[1].content)
      if (names.includes('submit_research')) {
        const used = name => body.messages.some(message => message.tool_calls?.some(call => call.function.name === name))
        if (!used('get_attraction_snapshot')) result = tool('get_attraction_snapshot', {})
        else if (!used('web_search')) result = tool('web_search', { query: '豫园 创作线索' })
        else if (!used('read_web_page')) result = tool('read_web_page', { url: 'https://example.org/garden' })
        else {
          const snapshot = JSON.parse(body.messages.find(message => message.tool_call_id === 'call-get_attraction_snapshot').content)
          result = tool('submit_research', { placeFacts: snapshot.spots.map(spot => ({ spotId: spot.id, detail: `${spot.name}的真实地点线索` })), motifs: ['家书'], hooks: ['来信的主人', '未完成的告别'], sourceUrls: ['https://example.org/garden'] })
        }
      } else if (names.includes('submit_story_concepts')) result = tool('submit_story_concepts', { concepts: [
        { conceptId: 'letter', title: '未寄出的家书', logline: '沿家书找到记忆', visitorRole: '送信人', conflict: '时间改变了收信人', hook: '没有署名的来信', climax: '认出熟悉的笔迹', ending: '把回信留给未来', visualStyle: '园林绘本' },
        { conceptId: 'shadow', title: '借来的月光', logline: '追随园林倒影', visitorRole: '寻光人', conflict: '天亮前找回倒影', hook: '月亮少了一角', climax: '发现倒影是自己', ending: '将月光归还湖面', visualStyle: '水墨奇幻' },
      ] })
      else if (names.includes('submit_story_plan')) {
        const ids = request.source.spots.map(spot => spot.id)
        result = tool('submit_story_plan', { entrySpotId: ids[0], nodes: ids.map((id, index) => ({ spotId: id, toSpotIds: request.brief.mode === 'checkin' ? ids[index + 1] ? [ids[index + 1]] : [] : index === 0 && ids.length > 2 ? [ids[1], ids.at(-1)] : index === ids.length - 1 ? [] : [ids[index + 1]], role: '推进', dramaticBeat: '此处的风景改变你对来信的理解' })) })
      } else result = tool('submit_spot_drafts', { title: request.concept.title, description: '一封家书牵起园林记忆，你选择如何将它交还。', spots: request.plan.nodes.map(node => ({ spotId: node.spotId, poetic: '风景里藏着一封信', slides: [{ title: '来信的痕迹', bullets: ['寻找与信中相同的纹理'], narration: '你停在风景前，发现信上的字迹正与眼前重合。选择下一步，让这段记忆找到归处。' }], choices: request.brief.mode === 'story' ? node.toSpotIds.map(toSpotId => ({ toSpotId, label: '循线索走去', note: '观察沿途一处细节' })) : [], ...(request.brief.mode === 'story' && !node.toSpotIds.length ? { endingTitle: '一封信的归处' } : {}) })) })
    }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: result }] }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, calls, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) }
}
export const fixtureResearch = { search: async () => [{ url: 'https://example.org/garden', title: '自动化替身资料', content: '明确为自动化替身，不是真实研究证据。' }], extract: async () => '自动化替身：园林亭台与山石可作为创作意象。' }
