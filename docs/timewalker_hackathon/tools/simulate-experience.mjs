#!/usr/bin/env node
/**
 * 仅为技术方案中的可执行体验包提供命令行路径模拟，非应用运行时。
 * 验证“同一包、同一转移规则、两种分支都能到结局”。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const file=process.argv[2];
const lens=process.argv[3] || 'nature';
if(!file || !['nature','craft'].includes(lens)){
  console.error('用法: node tools/simulate-experience.mjs <package.json> nature|craft');
  process.exit(2);
}
const pkg=JSON.parse(readFileSync(resolve(file),'utf8'));
const x=pkg.experience;
const scenes=new Map(x.scenes.map(s=>[s.id,s]));
let sceneId=x.initialSceneId;
const vars={...x.initialVariables};
const visits=[];
const memories=new Set();
function runActions(actions){
  let target=null;
  for(const a of actions){
    if(a.type==='setVar') vars[a.key]=a.value;
    else if(a.type==='revealMemory') memories.add(a.memoryId);
    else if(a.type==='goTo') target=a.sceneId;
    else throw new Error(`未知动作 ${a.type}`);
  }
  if(!target) throw new Error('互动未指定下一幕');
  return target;
}
for(let steps=0;steps<30;steps++){
  const scene=scenes.get(sceneId);
  if(!scene) throw new Error(`无法读取场景 ${sceneId}`);
  visits.push(sceneId);
  console.log(`${visits.length}. ${scene.title} [${scene.spotId||'虚拟节点'}]`);
  if(scene.mode==='ending'){
    if(vars.aestheticLens!==lens || vars.observedJade!==true) throw new Error('结局状态不符合预期');
    console.log(`完成！路线：${visits.join(' → ')}`);
    console.log('状态：',JSON.stringify(vars),'回忆：',[...memories].join(','));
    process.exit(0);
  }
  if(scene.interaction){
    const it=scene.interaction;
    if(it.type==='single_choice') {
      const option=it.options.find(o=>o.id===lens);
      if(!option) throw new Error(`没有选项 ${lens}`);
      sceneId=runActions(option.actions);
    } else if(it.type==='photo_or_tap'){
      // 此处明确模拟“用户手动确认”完成观察事件，不代表模型识别或实地定位。
      sceneId=runActions(it.actionsOnComplete);
    } else throw new Error(`不支持交互 ${it.type}`);
  }else{
    const tr=scene.transitions?.find(t=>!t.when || (
      t.when.op==='eq' && vars[t.when.var]===t.when.value
    ));
    if(!tr) throw new Error(`场景 ${scene.id} 找不到出口`);
    sceneId=tr.to;
  }
}
throw new Error('超过30幕仍未结束，可能发生循环');
