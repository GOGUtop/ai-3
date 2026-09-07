export function narrativeOnly(value) {
  const text=String(value||'').replace(/<(thinking|think|analysis|reasoning|VVV_ECOT)\b[^>]*>[\s\S]*?(?:<\/\1>|(?=<content\b))/gi,'').replace(/\{\{ANIMA_STATUS::\d+\}\}/g,'');
  return (text.match(/<content\b[^>]*>([\s\S]*?)<\/content>/i)?.[1]||text).trim();
}
export function previousAssistant(rows,userName='') {
  for(const row of [...rows].reverse()) {
    if(row.is_user||row.is_system||row.role==='user'||row.role==='system'||(userName&&row.name===userName))continue;
    const text=narrativeOnly(row.mes??row.message??row.content);
    if(text)return {name:row.name||'',text};
  }
  return null;
}
export function presetText(preset,{userName='',characterName='',characterId}={}) {
  if(!preset||!Array.isArray(preset.prompts))throw new Error('预设需要包含 prompts 提示词列表');
  const rows=preset.prompts;
  const order=preset.prompt_order?.find(o=>String(o.character_id)===String(characterId)) || preset.prompt_order?.find(o=>o.character_id===100001) || preset.prompt_order?.at(-1);
  const ordered=order?.order?order.order.filter(o=>o.enabled!==false).map(o=>rows.find(r=>(r.identifier||r.id)===o.identifier)).filter(Boolean):rows.filter(r=>r.enabled!==false);
  return ordered.filter(r=>!r.marker&&typeof r.content==='string'&&r.content.trim()).map(r=>`【${r.name||r.identifier||r.id||'提示词'}】\n${r.content.replace(/\{\{user\}\}/gi,()=>userName).replace(/\{\{char\}\}/gi,()=>characterName)}`).join('\n\n');
}
export async function readWorldbooks(helper,character,request) {
  const names=new Set();
  if(helper?.getCharWorldbookNames){const bindings=await helper.getCharWorldbookNames('current');if(bindings?.primary)names.add(bindings.primary);for(const n of bindings?.additional||[])names.add(n);}
  const bound=character?.data?.extensions?.world||character?.extensions?.world;
  if(bound)names.add(bound);
  const chat=await helper?.getChatWorldbookName?.('current');if(chat)names.add(chat);
  for(const n of await helper?.getGlobalWorldbookNames?.()||[])names.add(n);
  const results=[];
  for(const name of names){
    const response=helper?.getWorldbook?await helper.getWorldbook(name):await request('/api/worldinfo/get',{name});
    const entries=Array.isArray(response)?response:Array.isArray(response?.entries)?response.entries:Object.values(response?.entries||{});
    for(const entry of entries)if(entry.enabled!==false&&!entry.disable&&!/anima_status|apb_/i.test(entry.name||entry.comment||''))results.push(`[${name} / ${entry.name||entry.comment||'条目'}]\n${entry.content||''}`);
  }
  for(const e of character?.data?.character_book?.entries||[])if(e.enabled!==false&&!e.disable)results.push(`[角色卡内嵌世界书 / ${e.name||e.comment||'条目'}]\n${e.content||''}`);
  return {names:[...names],text:results.join('\n\n'),count:results.length};
}
export function clampPosition(x,y,width,height,viewportWidth,viewportHeight) {
  return {x:Math.max(8,Math.min(viewportWidth-width-8,x)),y:Math.max(8,Math.min(viewportHeight-height-8,y))};
}
