import { useEffect, useState } from 'react'
import type { StoryBlock } from './experienceSchema'
import type { ExperienceEvent } from './events'

type PlaybackStatus = { token: string; blockId?: string; state: 'idle' | 'playing' | 'failed'; message: string }
export function useNarration(block: StoryBlock | undefined, sceneId: string, token: string, send: (e: ExperienceEvent) => void, resolveAsset: (ref: string) => string) {
  const [enabled, setEnabled] = useState(false)
  const [replay, setReplay] = useState(0)
  const [status, setStatus] = useState<PlaybackStatus>({ token: '', state: 'idle', message: '' })
  useEffect(() => {
    if (!enabled || !block) return
    let cancelled = false
    let settled = false
    let audio: HTMLAudioElement | null = null
    const synth = window.speechSynthesis
    const finish = () => {
      if (cancelled || settled) return
      settled = true
      setStatus({ token, state: 'idle', message: '' })
      send({ type: 'NARRATION_ENDED', sceneId, token, blockId: block.id })
    }
    const fail = () => {
      if (cancelled || settled) return
      settled = true
      audio?.pause()
      synth?.cancel()
      setStatus({ token, blockId: block.id, state: 'failed', message: '旁白暂不可用，阅读后仍可继续故事。' })
    }
    const timer = window.setTimeout(fail, Math.min(180000, Math.max(20000, (block.text?.length ?? 100) * 500 + 10000)))
    queueMicrotask(() => {
      if (!cancelled && !settled) setStatus({ token, blockId: block.id, state: 'playing', message: '' })
    })
    if (block.type === 'audio' && block.assetRef) {
      audio = new Audio(resolveAsset(block.assetRef))
      audio.onended = finish
      audio.onerror = fail
      void audio.play().catch(fail)
    } else if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
      const utterance = new SpeechSynthesisUtterance(block.text ?? '')
      utterance.lang = 'zh-CN'
      utterance.voice = synth.getVoices().find(v => v.lang.startsWith('zh')) ?? null
      utterance.onend = finish
      utterance.onerror = fail
      synth.speak(utterance)
    } else fail()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (audio) { audio.onended = null; audio.onerror = null; audio.pause() }
      synth?.cancel()
      setStatus(current => current.token === token && current.blockId === block.id && current.state === 'playing' ? { token: '', state: 'idle', message: '' } : current)
    }
  }, [block, sceneId, token, enabled, replay, send, resolveAsset])
  const current = status.token === token ? status : undefined
  return {
    enabled,
    toggle: () => setEnabled(v => !v),
    replay: () => { setStatus({ token: '', state: 'idle', message: '' }); setReplay(v => v + 1) },
    message: current?.message ?? '',
    playingBlockId: current?.state === 'playing' ? current.blockId : undefined,
  }
}
