import type { PublishedAttraction } from './tourPackage'
import { managementUrl, readApiJson } from './managementApi'

async function readManagementJson<T>(
  response: Response,
  method: string,
  url: string,
  failureMessage: string,
): Promise<T> {
  return readApiJson<T>(response, { method, url, failureMessage })
}

export type ServerExportResult = {
  ok: true
  publicPath: string
  attractionPath: string
  catalogPath: string
}

/** 待落盘的图片：relPath 相对 public/spots，publicPath 为包内引用 */
export type MediaFile = {
  relPath: string
  publicPath: string
  blob: Blob
}

export type TrashSpotResult = {
  ok: true
  trashed: string[]
}

/** 删除已发布景点：包文件与图片目录移入 .trash（可恢复），并从 catalog 摘掉 */
export async function trashSpotViaServer(id: string): Promise<TrashSpotResult> {
  const url = `${managementUrl('/__trip_guide/spot')}?id=${encodeURIComponent(id)}`
  const data = await readManagementJson<TrashSpotResult>(
    await fetch(url, { method: 'DELETE' }),
    'DELETE',
    url,
    '删除失败',
  )
  return data
}

/** 回收站中的一条记录。 */
export type TrashedSpot = {
  folder: string
  id: string
  name: string
  mode: 'checkin' | 'story'
  publishedAt: number
  trashedAt: number
}

/** 列出回收站条目；调用失败时抛出以便页面显示真实错误。 */
export async function listTrashedSpots(): Promise<TrashedSpot[]> {
  const url = managementUrl('/__trip_guide/trash')
  const data = await readManagementJson<{ ok: true; items?: TrashedSpot[] }>(
    await fetch(url, { cache: 'no-cache' }),
    'GET',
    url,
    '回收站加载失败',
  )
  return Array.isArray(data.items) ? data.items : []
}

export type RestoreSpotResult = { ok: true; id: string; restored: string[] }

/** 恢复：包与图片搬回 public/spots，catalog 补回该条 */
export async function restoreSpotViaServer(folder: string): Promise<RestoreSpotResult> {
  const url = `${managementUrl('/__trip_guide/trash/restore')}?folder=${encodeURIComponent(folder)}`
  const data = await readManagementJson<RestoreSpotResult>(
    await fetch(url, { method: 'POST' }),
    'POST',
    url,
    '恢复失败',
  )
  return data
}

/** 将发布包及媒体写入 Node 持久数据源，与前台同一数据源。 */
export async function exportPackageViaServer(
  pkg: PublishedAttraction,
  media: MediaFile[],
): Promise<ServerExportResult> {
  // 图片二进制逐个落盘，包 JSON 里只留路径
  for (const item of media) {
    const url = `${managementUrl('/__trip_guide/media')}?path=${encodeURIComponent(item.relPath)}`
    await readManagementJson<{ ok: true }>(
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': item.blob.type || 'application/octet-stream' },
        body: item.blob,
      }),
      'POST',
      url,
      `图片写入失败: ${item.relPath}`,
    )
  }

  const url = managementUrl('/__trip_guide/export')
  const data = await readManagementJson<ServerExportResult>(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg }),
    }),
    'POST',
    url,
    '发布失败',
  )
  return data
}
