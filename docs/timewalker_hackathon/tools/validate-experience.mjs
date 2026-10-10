#!/usr/bin/env node
/**
 * 黑客松初始体验包静态检查器：无外部依赖；不替代生产 Zod、史实人工审核、真实路线核对。
 * 用法：node tools/validate-experience.mjs examples/yuyuan-timewalker.package.json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const filename = process.argv[2];
if (!filename) {
  console.error('用法: node tools/validate-experience.mjs <package.json>');
  process.exit(2);
}
let pkg;
try { pkg = JSON.parse(readFileSync(resolve(filename), 'utf8')); }
catch (e) { console.error('JSON 无法解析:', e.message); process.exit(2); }
const errors = [];
const err = (where, message) => errors.push(`${where}: ${message}`);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
if (pkg.schemaVersion !== 1) err('root', 'schemaVersion 必须为 1');
if (!pkg.id || !pkg.name || !pkg.coverImage) err('root', '缺少 id/name/coverImage');
if (!isObj(pkg.start) || !Number.isFinite(pkg.start.lng) || !Number.isFinite(pkg.start.lat)) err('root', 'start 坐标无效');
if (!Array.isArray(pkg.spots) || pkg.spots.length === 0) err('root', 'spots 不可为空');
const spotIds = new Set();
for (const spot of pkg.spots || []) {
  if (!spot.id || spotIds.has(spot.id)) err('spots', `节点 ID 缺失或重复: ${spot.id}`);
  if (!spot.image || !Array.isArray(spot.slides) || spot.slides.length === 0) err(`spot:${spot.id}`, '缺少图片或旧版 slides');
  spotIds.add(spot.id);
}
const x = pkg.experience;
if (!isObj(x) || x.schemaVersion !== 1) err('experience', '缺少 schemaVersion=1 的 experience');
const scenes = Array.isArray(x?.scenes) ? x.scenes : [];
if (!scenes.length) err('experience', 'scenes 为空');
if (!isObj(x?.initialVariables)) err('experience', '缺少 initialVariables');
const ids = new Set(), idToScene = new Map();
for (const s of scenes) {
  if (!s.id || ids.has(s.id)) err('scenes', `场景 ID 缺失或重复: ${s.id}`);
  ids.add(s.id); idToScene.set(s.id,s);
}
const srcIds = new Set((x?.sources || []).map(s=>s.id));
const graph = new Map();
for (const s of scenes) {
  const pos = `scene:${s.id}`;
  if (s.spotId && !spotIds.has(s.spotId)) err(pos, `未找到 spotId ${s.spotId}`);
  if (!Array.isArray(s.blocks) || s.blocks.length === 0) err(pos, 'blocks 不可为空');
  const blockIds = new Set();
  for (const b of s.blocks || []) {
    if (!b.id || blockIds.has(b.id)) err(pos, `block ID 缺失或重复: ${b.id}`);
    blockIds.add(b.id);
    if (b.type === 'image' && !b.assetRef) err(pos, `图片块 ${b.id} 缺少 assetRef`);
    if (b.type === 'narration' && !b.text) err(pos, `旁白块 ${b.id} 缺少 text`);
    for (const sourceId of b.sourceIds || []) if (!srcIds.has(sourceId)) err(pos, `不存在的史实来源 ${sourceId}`);
    if (b.type === 'narration' && !b.fictional && (!b.sourceIds || !b.sourceIds.length)) err(pos, `${b.id} 是事实讲述但未关联史料`);
  }
  const targets = [];
  const validateActions = (actions, context) => {
    if (!Array.isArray(actions)) return err(context,'actions 缺失');
    const gos = actions.filter(a=>a.type==='goTo');
    if (gos.length !== 1) err(context, '一次交互必须恰有一个 goTo');
    for (const a of actions) {
      if (a.type === 'goTo') targets.push(a.sceneId);
      else if (a.type === 'setVar') {
        if (!Object.prototype.hasOwnProperty.call(x.initialVariables || {},a.key)) err(context, `setVar 使用未声明变量 ${a.key}`);
      } else if (a.type !== 'revealMemory') err(context, `不允许的 action: ${a.type}`);
    }
  };
  if (s.interaction) {
    const it = s.interaction;
    if (it.type==='single_choice') {
      if (!Array.isArray(it.options) || it.options.length<2) err(pos,'选择题至少2个选项');
      const optionIds = new Set();
      for (const option of it.options || []) {
        if (!option.id || optionIds.has(option.id)) err(pos,`选项 ID 缺失或重复: ${option.id}`);
        optionIds.add(option.id);
        validateActions(option.actions,`${pos}/option:${option.id}`);
      }
    } else if (it.type==='photo_or_tap') {
      if (it.fallback !== 'manual_confirm') err(pos,'观察互动必须允许手动确认');
      validateActions(it.actionsOnComplete,`${pos}/observation`);
    } else err(pos,`未知交互类型: ${it.type}`);
    if (s.transitions?.length) err(pos,'本版有交互的场景不同时使用 transitions，以免路径冲突');
  } else {
    for (const t of s.transitions || []) {
      if (t.when?.var && !Object.prototype.hasOwnProperty.call(x.initialVariables || {},t.when.var)) err(pos,`条件引用未声明变量 ${t.when.var}`);
      targets.push(t.to);
    }
    if (s.mode!=='ending' && targets.length===0) err(pos,'非终幕必须有后续跳转');
  }
  graph.set(s.id,targets);
}
for (const [id, targets] of graph) for (const target of targets) if (!ids.has(target)) err(`scene:${id}`,`转移目标不存在: ${target}`);
if (!ids.has(x?.initialSceneId)) err('experience',`首幕不存在: ${x?.initialSceneId}`);
const reachable = new Set();
const stack = x?.initialSceneId ? [x.initialSceneId] : [];
while (stack.length) {
  const n = stack.pop(); if (reachable.has(n) || !ids.has(n)) continue;
  reachable.add(n); for (const next of graph.get(n) || []) stack.push(next);
}
for (const id of ids) if (!reachable.has(id)) err('graph',`不可达场景: ${id}`);
const terminalIds = [...ids].filter(id=>(graph.get(id)||[]).length===0);
if (terminalIds.length===0) err('graph','没有终幕');
for (const terminal of terminalIds) if (idToScene.get(terminal)?.mode!=='ending') err('graph',`无出边场景 ${terminal} 不是 ending`);
// 检查每个可达场景是否至少能通往一个结局，拒绝无出口循环。
function canReachTerminal(start) {
  const seen = new Set(), q=[start];
  while(q.length) {
    const id=q.pop(); if(seen.has(id)) continue; seen.add(id);
    if(terminalIds.includes(id)) return true;
    for(const next of graph.get(id)||[]) if(ids.has(next)) q.push(next);
  }
  return false;
}
for (const id of reachable) if(!canReachTerminal(id)) err('graph',`场景 ${id} 无法到达任何终幕`);
if (errors.length) {
  console.error(`校验失败：${errors.length} 项\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`体验包校验通过：${pkg.id}；地点 ${spotIds.size}；场景 ${scenes.length}；可达 ${reachable.size}；结局 ${terminalIds.join(', ')}`);
console.log('提示：本脚本不验证历史内容真假、图片著作权、真实路线可达性、地图坐标参考体系。');
