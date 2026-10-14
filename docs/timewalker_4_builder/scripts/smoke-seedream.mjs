/**
 * Node 24, intentionally paid; invoke only with explicit --confirm-billing
 * node --env-file-if-exists=.env.server.local scripts/smoke-seedream.mjs --confirm-billing
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const key = process.env.ARK_API_KEY;
const model = process.env.ARK_IMAGE_MODEL;
const base = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/,'');
if (!process.argv.includes('--confirm-billing')) { console.error('Paid call not authorized: append --confirm-billing'); process.exit(2); }
if (!key || !model) { console.error('Missing ARK_API_KEY / ARK_IMAGE_MODEL'); process.exit(2); }
const prompt = 'Vertical 9:16 cinematic science-fiction illustration for a Shanghai planetarium story: a mysterious far-future radio transmission across a blue-violet nebula; no text or logos';
const generated = await fetch(`${base}/images/generations`,{
  method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({model,prompt,size:'2K',response_format:'url'}),
  signal:AbortSignal.timeout(180000),
});
if (!generated.ok) throw Error(`Generation HTTP ${generated.status}: ${(await generated.text()).slice(0,400)}`);
const result=await generated.json();
const raw=result.data?.[0]?.url;
if (typeof raw !== 'string') throw Error('Provider did not return an image URL');
const parsed = new URL(raw);
if (parsed.protocol !== 'https:') throw Error('Non-HTTPS image URL');
const response=await fetch(parsed,{redirect:'error',signal:AbortSignal.timeout(30000)});
if (!response.ok) throw Error(`Download HTTP ${response.status}`);
const mime=(response.headers.get('content-type')||'').toLowerCase().split(';')[0];
const suffix=({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'})[mime];
if (!suffix) throw Error(`Unexpected media content type: ${mime}`);
const maxBytes=Number(process.env.AGENT_MAX_IMAGE_BYTES||5242880);
if (Number(response.headers.get('content-length'))>maxBytes) throw Error('Image size limit');
const arr=new Uint8Array(await response.arrayBuffer());
if (arr.length>maxBytes) throw Error(`Image too large: ${arr.length}`);
const dir=join(process.cwd(),'.agent-jobs','_provider-smoke');
await mkdir(dir,{recursive:true});
const dest=join(dir,`seedream-sample${suffix}`);
await writeFile(dest,arr);
await writeFile(join(dir,'seedream-sample.meta.json'),JSON.stringify({model,prompt,createdAt:new Date().toISOString(),bytes:arr.length,mime},null,2));
console.log(JSON.stringify({ok:true,output:dest,bytes:arr.length,mime},null,2));
