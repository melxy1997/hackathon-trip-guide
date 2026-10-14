/**
 * Run in tour-hub-web (Node 24) after configuring .env.server.local:
 * node --env-file-if-exists=.env.server.local scripts/smoke-model-tools.mjs
 * No paid image calls. Verifies real OpenAI-compatible tool_calls behavior.
 */
const apiKey = process.env.BUILDER_LLM_KEY || process.env.DEEPSEEK_API_KEY;
const base = process.env.BUILDER_LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL;
const model = process.env.BUILDER_LLM_MODEL || process.env.DEEPSEEK_MODEL;
if (!apiKey || !base || !model) { console.error('Missing MODEL key/base/model'); process.exit(2); }
const url = `${base.replace(/\/$/, '')}/chat/completions`;
async function complete(messages) {
  const r = await fetch(url, {
    method: 'POST', headers: {'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`},
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({model,temperature:0,messages,tools:[{
      type:'function',function:{name:'get_time',description:'Return a UTC time string',parameters:{type:'object',properties:{timezone:{type:'string'}},required:['timezone']}}
    }], tool_choice:'auto'}),
  });
  if (!r.ok) throw Error(`HTTP ${r.status}: ${(await r.text()).slice(0,500)}`);
  return await r.json();
}
const firstMessages = [{role:'system',content:'You MUST call get_time once before answering. Never guess the time.'},
  {role:'user',content:'Call get_time with timezone Asia/Shanghai, then report the time returned.'}];
const first = await complete(firstMessages);
const assistant = first.choices?.[0]?.message;
const call = assistant?.tool_calls?.find(t=>t.function?.name==='get_time');
if (!call) throw Error(`Missing tool_calls; model may not support tools. finish_reason=${first.choices?.[0]?.finish_reason}`);
const args = JSON.parse(call.function.arguments);
if (typeof args.timezone !== 'string') throw Error('Tool args are malformed');
const response = await complete([...firstMessages,assistant, {role:'tool',tool_call_id:call.id,content:JSON.stringify({time:'2026-10-15T00:00:00+08:00',timezone:args.timezone})}]);
if (response.choices?.[0]?.message?.role !== 'assistant') throw Error('Model could not complete after tool result');
console.log(JSON.stringify({ok:true,model,tool:'get_time',args,answer:response.choices[0].message.content},null,2));
