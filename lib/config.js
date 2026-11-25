export function validate(c) {
  if (!c || c.enabled !== true) return null;
  if (!c.model || !c.key) throw new Error('Magpie 连接缺少选定模型或调用密钥');
  const url=new URL(c.gateway);
  if (url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('Magpie gateway must be a local HTTP address');
  if (!Array.isArray(c.models) || !c.models.length || !c.models.some(m=>m.id===c.model)) throw new Error('selected model missing from catalogue');
  const ids=new Set();
  for (const m of c.models) {
    if (typeof m.id!=='string' || !m.id.trim() || ids.has(m.id)) throw new Error('invalid or duplicate model id');
    ids.add(m.id);
  }
  return c;
}
export async function gatewayModels(c) {
  const response=await fetch(c.gateway.replace(/\/$/,'')+'/models',{headers:{Authorization:`Bearer ${c.key}`,'User-Agent':'cursor-magpie-bridge/0.1.0'},signal:AbortSignal.timeout(5000),redirect:'error'});
  if (!response.ok) throw new Error(`Magpie gateway HTTP ${response.status}`);
  const body=await response.json();
  if (!Array.isArray(body.data)) throw new Error('invalid Magpie model response');
  const models=body.data.map(m=>({id:m.id,name:m.magpie_label||m.display_name||m.name||m.id,context:m.max_input_tokens??m.context_window??m.context_length??null}));
  return validate({...c,models});
}
