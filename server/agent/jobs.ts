import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { idSchema, type BuilderJob } from '../../src/agent/contracts.ts'
import type { DraftAttraction } from '../../src/types/attraction.ts'
import { fingerprint } from './compiler.ts'

export class JobStore {
  directory: string
  constructor(directory: string) {
    this.directory = directory; fs.mkdirSync(directory, { recursive: true })
    for (const id of fs.readdirSync(directory).filter(id => /^job-[a-f0-9-]{36}$/.test(id))) {
      const job = this.read(id)
      if (job && ['queued', 'running'].includes(job.status)) { job.status = 'failed'; job.error = '服务重启中断了此任务；已保留阶段成果，可重新选择概念或新建任务。'; this.save(job) }
    }
  }
  file(id: string, name: string) { idSchema.parse(id); return path.join(this.directory, id, name) }
  write(id: string, name: string, value: unknown) {
    const file = this.file(id, name); fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2)); fs.renameSync(temporary, file) } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
  }
  read(id: string): BuilderJob | null {
    try { return JSON.parse(fs.readFileSync(this.file(id, 'job.json'), 'utf8')) as BuilderJob } catch { return null }
  }
  save(job: BuilderJob) { job.updatedAt = Date.now(); this.write(job.id, 'job.json', job) }
  snapshot(id: string) { return JSON.parse(fs.readFileSync(this.file(id, 'source.json'), 'utf8')) as DraftAttraction }
  candidate(job: BuilderJob) {
    const draft = JSON.parse(fs.readFileSync(this.file(job.id, `candidate-v${job.version}.json`), 'utf8')) as DraftAttraction
    if (!job.candidateHash || fingerprint(draft) !== job.candidateHash) throw new Error('候选文件校验失败，请重新生成')
    return draft
  }
}
