#!/usr/bin/env node
/* Real-provider preflight for Timewalker Builder Agent. Node 24+, no npm dependencies.
   Explicit commands avoid unexpected billed image requests.
   Run from tour-hub-web: node --env-file-if-exists=.env.server.local scripts/smoke-providers.mjs search|map|image
*/
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const action = process.argv[2];
const OUTPUT = resolve(process.env.AGENT_PREFLIGHT_OUT || '.agent-preflight');
const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`环境变量 ${k} 未配置`);
  return v;
};
async function jsonRequest(url, { method = 'GET', headers = {}, body, ms = 35_000 } = {}) {
  const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(ms), redirect: 'error' });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`上游非 JSON，HTTP ${response.status}: ${raw.slice(0,240)}`); }
  if (!response.ok) throw new Error(`上游 HTTP ${response.status}: ${JSON.stringify(data).slice(0,400)}`);
  return data;
}
async function save(name, value) {
  await mkdir(OUTPUT, { recursive: true });
  const path = resolve(OUTPUT, name);
  await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  console.log(`产物: ${path}`);
}
async function search() {
  const key = env('TAVILY_API_KEY');
  const query = process.env.BUILDER_TEST_QUERY || '豫园 潘允端 营建 历史 上海 官方';
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const found = await jsonRequest('https://api.tavily.com/search', {
    method: 'POST', headers,
    body: { query, search_depth: 'basic', max_results: 6, include_answer: false, include_raw_content: false },
  });
  const urls = (found.results || []).map(x => x.url).filter(u => {
    try { const o = new URL(u); return o.protocol === 'https:' && !o.username && !o.password; } catch { return false; }
  }).slice(0, 3);
  if (!urls.length) throw new Error('没有可用 HTTPS 结果；尝试不同查询或检查检索覆盖');
  // Tavily Extract returns both results and failed_results, including HTTP 200 with all failures.
  const extracted = await jsonRequest('https://api.tavily.com/extract', {
    method: 'POST', headers, body: { urls, extract_depth: 'basic', format: 'markdown' }, ms: 45_000,
  });
  const succeeded = (extracted.results || []).filter(r => typeof r.raw_content === 'string' && r.raw_content.trim().length > 200);
  await save('search.json', { query, found: found.results, extraction: extracted.results, failed: extracted.failed_results || [], usage: found.usage });
  console.log(`搜索 ${found.results?.length || 0} 条，提取有效正文 ${succeeded.length}/${urls.length} 条。`);
  if (!succeeded.length) throw new Error('正文抽取失败；不能将搜索摘要伪装成事实证据');
}
async function map() {
  const key = env('AMAP_SERVER_KEY');
  const q = new URL('https://restapi.amap.com/v5/place/text');
  q.search = new URLSearchParams({ key, keywords: '上海 豫园', region: '上海', page_size: '10' }).toString();
  const pois = await jsonRequest(q);
  if (pois.status !== '1') throw new Error(`高德 POI 返回失败: ${pois.info} (${pois.infocode})`);
  const origin = process.env.BUILDER_MAP_ORIGIN || '121.49185,31.22732';
  const destination = process.env.BUILDER_MAP_DESTINATION || '121.49205,31.22755';
  const walking = new URL('https://restapi.amap.com/v5/direction/walking');
  walking.search = new URLSearchParams({ key, origin, destination }).toString();
  const routes = await jsonRequest(walking);
  if (routes.status !== '1') throw new Error(`高德步行返回失败: ${routes.info} (${routes.infocode})`);
  await save('map.json', { locations: pois.pois || [], route: routes.route || null, origin, destination });
  console.log(`POI 数量 ${(pois.pois || []).length}，路径数量 ${(routes.route?.paths || []).length}。景区内部可达性仍需现场核验。`);
}
async function image() {
  if (!process.argv.includes('--accept-billing')) throw new Error('生成图片会计费。请明确追加 --accept-billing');
  const key = env('ARK_API_KEY'), model = env('ARK_IMAGE_MODEL');
  const prompt = process.env.BUILDER_IMAGE_PROMPT || '用于历史文化旅行故事的竖版艺术插画，明代江南古典园林，淡雅水墨与电影光影结合，建筑细节有中国园林风貌，无文字，无水印，不声称是史料照片。竖版9:16。';
  const result = await jsonRequest('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
    method: 'POST', ms: 180_000,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: { model, prompt, size: '2K', response_format: 'url', watermark: true },
  });
  const candidate = result.data?.find(item => item?.url || item?.b64_json);
  if (!candidate) throw new Error('生图成功响应中未找到 image url/base64，检查模型能力与返回格式');
  let imageBytes;
  if (candidate.b64_json) imageBytes = Buffer.from(candidate.b64_json, 'base64');
  else {
    const u = new URL(candidate.url);
    if (u.protocol !== 'https:' || u.username || u.password) throw new Error('生图链接不是安全 HTTPS 地址');
    const r = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(45_000) });
    if (!r.ok) throw new Error(`图片下载失败 HTTP ${r.status}`);
    const contentType = r.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) throw new Error(`无效图片媒体类型: ${contentType}`);
    imageBytes = Buffer.from(await r.arrayBuffer());
  }
  if (imageBytes.length > 12 * 1024 * 1024) throw new Error('图片大于 12MiB，请压缩后再入库');
  await mkdir(OUTPUT, { recursive: true });
  const magic = imageBytes.subarray(0, 16);
  const ext = magic[0] === 0xff && magic[1] === 0xd8 ? '.jpg'
    : magic.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? '.png'
    : magic.toString('ascii', 0, 4) === 'RIFF' && magic.toString('ascii', 8, 12) === 'WEBP' ? '.webp' : null;
  if (!ext) throw new Error('图片格式无法识别；不会直接发布未知格式');
  const imageFile = resolve(OUTPUT, `generated-image${ext}`);
  await writeFile(imageFile, imageBytes);
  await save('image-provenance.json', { model, prompt, generatedAt: new Date().toISOString(), bytes: imageBytes.length,
    provider: 'volcengine-ark', outputFile: imageFile, responseModel: result.model, reviewStatus: 'pending', aiDisclosure: true });
  console.log(`真实生成图已保存 ${imageFile}，${imageBytes.length} 字节。请检查实际编码并转换后发布。`);
}
try {
  if (action === 'search') await search();
  else if (action === 'map') await map();
  else if (action === 'image') await image();
  else throw new Error('用法: node scripts/smoke-providers.mjs search|map|image [--accept-billing]');
} catch (e) {
  console.error(`接入失败：${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
