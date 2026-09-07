import {relayBoundary} from './core.mjs';
let running=false;
const copy=value=>structuredClone(value);

export function validateNativePreset(preset) {
  if(!preset||!Array.isArray(preset.prompts)||!Array.isArray(preset.prompt_order))throw new Error('请导入酒馆聊天补全预设 JSON（须包含 prompts 和 prompt_order）');
  return preset;
}

// Use ST's own settings map. Connection fields remain independent of the writing preset.
export function presetSettings(preset,mapping) {
  validateNativePreset(preset);
  const updates={};
  for(const [key,entry] of Object.entries(mapping)) {
    const setting=Array.isArray(entry)?entry[1]:entry.oai_setting;
    const connection=Array.isArray(entry)?entry[3]:false;
    if(setting&&!connection&&Object.hasOwn(preset,key))updates[setting]=copy(preset[key]);
  }
  updates.prompts=copy(preset.prompts);updates.prompt_order=copy(preset.prompt_order);
  updates.extensions=copy(preset.extensions||{});
  return updates;
}

export function temporaryFields(target,updates) {
  const originals=new Map();
  for(const [key,value] of Object.entries(updates)){originals.set(key,{exists:Object.hasOwn(target,key),value:target[key]});target[key]=value;}
  let restored=false;
  return ()=>{if(restored)return;restored=true;for(const [key,old] of originals){
    if(target[key]!==updates[key])continue; // Do not undo changes made by another extension/user.
    if(old.exists)target[key]=old.value;else delete target[key];
  }};
}

export function nativeOptions(d,{previous='',generationId,customApi,regex,userName}) {
  const history=previous?[{role:'assistant',content:regex(previous,'ai_output','prompt',1)}]:[];
  const overrides={chat_history:{prompts:history,with_depth_entries:d.readWorldbook}};
  if(!d.readCharacter)Object.assign(overrides,{char_description:'',char_personality:'',scenario:'',persona_description:'',dialogue_examples:''});
  if(!d.readWorldbook)Object.assign(overrides,{world_info_before:'',world_info_after:'',dialogue_examples:''});
  const direction=`本次是 AI 接力写作任务，使用预设的编排和写作规则，生成用户角色 ${userName} 准备发送的下一步动作与对白，而不是替 NPC 继续整轮回应。叙述人称：${d.perspective}；目标：${d.options.join('、')}；亲密描写强度：${d.intensity}/3。作者要求：${d.note||'无'}。${d.useCustom?`\n自定义要求：${d.customPrompt}`:''}`;
  return {generation_id:generationId,should_stream:false,should_silence:false,user_input:regex(d.text,'user_input','stored',0),max_chat_history:0,overrides,
    injects:[{role:'system',content:direction,position:'in_chat',depth:0,should_scan:false}],
    custom_api:{...customApi,source:'openai',max_tokens:'same_as_preset',temperature:'same_as_preset',top_p:'same_as_preset',frequency_penalty:'same_as_preset',presence_penalty:'same_as_preset'}};
}

export async function generateNative({d,helper,context,request,scope,extraInstructions=()=>[],load=path=>import(path)}) {
  if(running)throw new Error('已有原生接力正在生成');
  if(typeof helper?.generate!=='function')throw new Error('原生预设接力需要酒馆助手 TavernHelper，请启用或更新；不会退回拼接预设文本');
  running=true;
  let session,restore=()=>{},restoreOutput=()=>{};
  let removeListener=()=>{},removeChatListener=()=>{};
  const start=scope();
  try {
    const api=await load('/scripts/openai.js');
    const script=await load('/script.js');
    const engine=await load('/scripts/extensions/regex/engine.js');
    const extensions=await load('/scripts/extensions.js');
    if(script.main_api!=='openai'||!api.promptManager||!api.settingsToUpdate||!engine.SCRIPT_TYPES?.PRESET)throw new Error('请切换到酒馆聊天补全模式，并更新到支持预设正则的酒馆版本');
    if(script.isGenerating?.()||script.is_send_press)throw new Error('请等酒馆本轮回复完成后再使用接力');
    let raw;
    if(d.presetSource==='imported')raw=validateNativePreset(d.importedPreset);
    else if(d.presetSource!=='current') {
      const name=d.presetSource.replace(/^saved:/,'');
      raw=api.openai_settings?.[api.openai_setting_names?.[name]];
      if(typeof raw==='string')raw=JSON.parse(raw);
      if(!raw)throw new Error(`酒馆中找不到预设：${name}`);
    }
    session=await request('/native-session',{});
    if(scope()!==start)throw new Error('聊天已切换，已取消接力');
    if(script.isGenerating?.()||script.is_send_press)throw new Error('酒馆正在生成，请稍后重试');
    const settings=api.oai_settings;
    const updates=raw?presetSettings(raw,api.settingsToUpdate):{};
    const selectedExtensions=copy(raw?.extensions??settings.extensions??{});
    updates.extensions=selectedExtensions;
    const restores=[temporaryFields(settings,updates)];
    if(context().chatMetadata)restores.push(temporaryFields(context().chatMetadata,{variables:copy(context().chatMetadata.variables||{})}));
    if(extensions.extension_settings.variables)restores.push(temporaryFields(extensions.extension_settings.variables,{global:copy(extensions.extension_settings.variables.global||{})}));
    // Preset regex consent is request-local; never change persisted allow-lists.
    const allowed=copy(extensions.extension_settings.preset_allowed_regex||{});
    allowed.openai=[...new Set([...(allowed.openai||[]),settings.preset_settings_openai])];
    restores.push(temporaryFields(extensions.extension_settings,{preset_allowed_regex:allowed}));
    restore=()=>{for(const undo of restores.slice().reverse())undo();};
    const regex=(text,source,destination,depth)=>engine.getRegexedString(text,source==='user_input'?engine.regex_placement.USER_INPUT:engine.regex_placement.AI_OUTPUT,{depth,isPrompt:destination==='prompt',isMarkdown:destination==='display'});
    const previous=d.readPrevious?[...context().chat].reverse().find(r=>!r.is_user&&!r.is_system&&String(r.mes||r.message||'').trim()):null;
    const generationId=`writer-relay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const options=nativeOptions(d,{previous:previous?.mes||previous?.message||'',generationId,customApi:{apiurl:session.apiurl,key:session.key,model:session.model},regex,userName:context().name1});
    options.injects.push(...extraInstructions().map(row=>({role:row.role||'system',content:row.content,position:'in_chat',depth:0,should_scan:false})));
    options.injects.push({role:'system',content:relayBoundary(d,context().name1),position:'in_chat',depth:0,should_scan:false});
    const event=context().event_types?.CHAT_COMPLETION_SETTINGS_READY||'chat_completion_settings_ready';
    // Capture output regexes while the selected preset is active, then restore settings before the network wait.
    const outputRules=copy(engine.getRegexScripts({allowedOnly:true}));
    const ready=data=>{if(data.reverse_proxy!==session.apiurl&&data.proxy_password!==session.key)return;restore();};
    context().eventSource.on(event,ready);
    removeListener=()=>context().eventSource.removeListener(event,ready);
    const chatEvent=context().event_types?.CHAT_CHANGED||'chat_id_changed';
    const cancel=()=>helper.stopGenerationById?.(generationId);
    context().eventSource.on(chatEvent,cancel);
    removeChatListener=()=>context().eventSource.removeListener(chatEvent,cancel);
    const response=await helper.generate(options);
    if(scope()!==start)throw new Error('聊天已切换，接力结果未写入其他聊天');
    restore();
    // Reuse the native regex engine with a request-local snapshot, exactly once for stored output and once for display.
    restoreOutput=temporaryFields(extensions.extension_settings,{regex:outputRules,character_allowed_regex:[],preset_allowed_regex:{}});
    const content=typeof response==='string'?response:response?.content;
    if(!content)throw new Error('预设生成未返回文本');
    const draft=regex(content,'ai_output','stored',0);
    const display=regex(draft,'ai_output','display',0);
    return {draft,display,regexCount:outputRules.filter(r=>!r.disabled).length};
  } catch(error) {
    if(session){
      const status=await request('/native-session/status',{key:session.key}).catch(()=>null);
      if(status?.phase==='failed'&&status.error)throw new Error(`原生预设已进入转发：${status.error}`);
      if(status?.phase==='waiting'&&/gateway|fetch|network|502|503|504/i.test(error.message))throw new Error(`${error.message}；本机转发尚未收到请求，请检查酒馆请求代理或私有地址过滤配置，不是预设未启用`);
    }
    throw error;
  } finally {
    restoreOutput();restore();removeListener();removeChatListener();
    running=false;
    if(session)await request('/native-session/close',{key:session.key}).catch(()=>{});
  }
}
