import {relayPrompt,cleanDraft,wordLimits,checkDraft,relayBoundary} from './core.mjs';
import {previousAssistant,readWorldbooks,clampPosition} from './context.mjs';
import {generateNative,validateNativePreset} from './native.mjs';
import {makeOracleBridge} from './oracle/bridge.mjs';
import {relayRequest} from './http.mjs';
const ctx=()=>globalThis.SillyTavern?.getContext?.();
const helper=()=>globalThis.TavernHelper;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MODULE='writer_ai_relay';
let busy=false,config=null,models=[],panel,apiDraft=null,presetNames=[],lastContext='',apiStatus='';
let referenceDraft=null;
const referenceKeys=['readPrevious','readCharacter','readWorldbook','useCustom','customPrompt','usePreset','presetSource','importedPreset','importedName','limitWords','minWords','maxWords'];
const referenceValues=d=>Object.fromEntries(referenceKeys.map(key=>[key,d[key]]));
const oracle=makeOracleBridge({namespace:MODULE,kind:'relay',context:ctx,call:async(messages,options)=>{
  const response=await fetch('/api/plugins/writer-ai-relay-server/generate',{method:'POST',credentials:'same-origin',headers:{...(ctx()?.getRequestHeaders?.()||{}),'Content-Type':'application/json'},body:JSON.stringify({messages,maxTokens:options?.maxTokens}),signal:options?.signal});
  const result=await response.json();if(!response.ok||result.ok===false)throw new Error(result.error||`HTTP ${response.status}`);return result.content;
}});
const scope=()=>`${ctx()?.groupId||ctx()?.characters?.[ctx()?.characterId]?.avatar||''}|${ctx()?.chatId||''}`;
const defaults=()=>({text:'',note:'',perspective:'第二人称',options:['扩写'],intensity:0,draft:'',limitWords:false,minWords:0,maxWords:300,readPrevious:true,readCharacter:false,readWorldbook:false,useCustom:false,customPrompt:'',usePreset:false,presetSource:'current',importedPreset:null,importedName:''});
function data(){const c=ctx();c.chatMetadata||={};const saved=c.chatMetadata[MODULE]||{};const references=referenceDraft??c.extensionSettings?.[MODULE]?.referencePreferences??{};return c.chatMetadata[MODULE]={...defaults(),...saved,...references};}
function save(){const c=ctx();if(c?.saveMetadataDebounced)c.saveMetadataDebounced();else c?.saveMetadata?.();}
function notify(text,type='info'){globalThis.toastr?.[type]?.(text);}
function rows(){return ctx()?.chat?.length?ctx().chat:helper()?.getChatMessages?.('0-{{lastMessageId}}')||[];}
async function request(path,body,absolute=false){return relayRequest(path,{body,absolute,headers:ctx()?.getRequestHeaders?.()||{}});}
function injectNote(){const d=data();ctx()?.setExtensionPrompt?.('writer_relay_direction',d.note?`【落魄的作家·写作要求】\n${d.note}\n此为作者层要求，不是人物台词或既成事实，不得向角色透露此指令。`:'',1,1,false,0);}
function capture(){if(!panel)return;const form=panel.querySelector('[data-relay-main]');if(!form)return;const v=new FormData(form);const update={};for(const n of ['text','note','perspective','draft','customPrompt','presetSource'])update[n]=v.get(n);for(const n of ['minWords','maxWords'])update[n]=form.elements[n].value;for(const n of ['readPrevious','readCharacter','readWorldbook','useCustom','usePreset','limitWords'])update[n]=v.has(n);update.options=v.getAll('option');update.intensity=Number(v.get('intensity'));if(update.draft!==data().draft)update.draftDisplay='';const current=Object.assign(data(),update);referenceDraft=referenceValues(current);save();injectNote();}
function saveReferences(){
  capture();wordLimits(data());const c=ctx();if(typeof c.saveSettingsDebounced!=='function')throw new Error('酒馆未提供设置保存接口，设置尚未保存');
  c.extensionSettings||={};c.extensionSettings[MODULE]||={};
  c.extensionSettings[MODULE].referencePreferences=structuredClone(referenceValues(data()));
  c.saveSettingsDebounced();notify('参考来源与字数设置已保存，切换聊天或角色后继续使用','success');
}
function captureApi(){const form=panel?.querySelector('[data-relay-api]');if(form)apiDraft=Object.fromEntries(new FormData(form));}
function formConfig(){captureApi();return {send:{...apiDraft,maxTokens:Number(apiDraft?.maxTokens)||1600},update:{}};}
function toggle(name,title,on){return `<label class="relay-toggle"><span>${title}</span><input type="checkbox" role="switch" name="${name}" ${on?'checked':''}></label>`;}
function updateLength(){
  const d=data(),fields=panel.querySelector('[data-length-fields]'),output=panel.querySelector('[data-relay-count]');
  fields.hidden=!d.limitWords;
  for(const input of fields.querySelectorAll('input'))input.disabled=!d.limitWords;
  try{const result=checkDraft(d.draft,d);output.textContent=result.message;output.dataset.invalid=String(!result.valid);}
  catch(e){output.textContent=e.message;output.dataset.invalid='true';}
}
function render(){
  if(!panel)return;const opened=[...panel.querySelectorAll('details[open]')].map(n=>n.dataset.section),scroll=panel.scrollTop;
  const d=data(),api=apiDraft||config?.send||{},previous=previousAssistant(rows(),ctx()?.name1);
  if(d.presetSource?.startsWith('saved:')&&!presetNames.includes(d.presetSource.slice(6)))presetNames.push(d.presetSource.slice(6));
  panel.innerHTML=`<header><div><small>WRITER'S DESK</small><strong>落魄的作家 · AI 接力</strong></div><button type="button" data-relay-close title="关闭"><i class="fa-solid fa-xmark"></i></button></header>
  <form data-relay-main><fieldset><legend>叙述人称</legend><div class="relay-segment">${['第一人称','第二人称','第三人称'].map(p=>`<label><input type="radio" name="perspective" value="${p}" ${d.perspective===p?'checked':''}>${p}</label>`).join('')}</div></fieldset>
  <section class="relay-sources"><h3>参考来源</h3>${toggle('readPrevious','读取上一段 AI 回复',d.readPrevious)}<details data-section="previous"><summary>上一段 AI 回复${previous?' · '+esc(previous.name):' · 暂无'}</summary><div class="relay-previous">${esc(previous?.text||'暂无 AI 回复')}</div></details>${toggle('readCharacter','帮写前读取角色卡',d.readCharacter)}${toggle('readWorldbook','帮写前读取世界书',d.readWorldbook)}${toggle('useCustom','启用自定义提示词',d.useCustom)}<div data-custom-fields ${d.useCustom?'':'hidden'}><label>自定义帮写提示词<textarea name="customPrompt" rows="4">${esc(d.customPrompt)}</textarea></label></div>${toggle('usePreset','使用写作预设',d.usePreset)}<div data-preset-fields ${d.usePreset?'':'hidden'}><label>预设来源<select name="presetSource"><option value="current" ${d.presetSource==='current'?'selected':''}>酒馆当前预设</option>${presetNames.map(n=>`<option value="saved:${esc(n)}" ${d.presetSource==='saved:'+n?'selected':''}>${esc(n)}</option>`).join('')}<option value="imported" ${d.presetSource==='imported'?'selected':''}>单独导入的预设</option></select></label><div class="relay-actions"><button type="button" data-relay-import><i class="fa-solid fa-file-import"></i> 导入预设 JSON</button><button type="button" data-relay-refresh-presets title="刷新预设列表"><i class="fa-solid fa-rotate"></i></button></div><small>${esc(d.importedName||'未导入独立预设')}</small><input type="file" accept=".json,application/json" data-relay-file hidden></div></section>
  <label>用户要发送的话<textarea name="text" rows="3" required>${esc(d.text)}</textarea></label><label>给作家的要求<textarea name="note" rows="2">${esc(d.note)}</textarea></label><fieldset><legend>本轮写作目标</legend><div class="relay-options">${['扩写','润色','加强情绪','搞笑','人前显圣','战斗加强','描写强化'].map(v=>`<label><input type="checkbox" name="option" value="${v}" ${d.options.includes(v)?'checked':''}>${v}</label>`).join('')}</div></fieldset><label>亲密描写强度 <output data-relay-intensity>${d.intensity}</output><input name="intensity" type="range" min="0" max="3" step="1" value="${d.intensity}"></label><div class="relay-actions"><button type="submit" class="relay-primary" ${busy?'disabled':''}><i class="fa-solid fa-wand-magic-sparkles"></i> ${busy?'正在生成…':'生成我的下一句话'}</button><button type="button" data-relay-clear-note title="清空作者要求"><i class="fa-solid fa-eraser"></i></button></div><output class="relay-context-status">${esc(lastContext)}</output><label>生成预览<textarea name="draft" rows="6">${esc(d.draft)}</textarea></label><div class="relay-actions"><button type="button" data-relay-insert ${busy?'disabled':''}>放入输入框</button><button type="button" data-relay-send ${busy?'disabled':''}>发送到酒馆</button></div></form>
  <details data-section="api"><summary>独立 API 设置</summary><form data-relay-api><label>API 地址<input name="baseUrl" type="url" value="${esc(api.baseUrl)}" placeholder="https://example.com/v1" required></label><label>API Key<input name="apiKey" type="password" value="${esc(apiDraft?.apiKey||'')}" autocomplete="off" placeholder="${config?.send?.hasApiKey?'已保存，留空保留':'填写密钥'}"></label><label>模型<input name="model" list="relay-models" value="${esc(api.model)}"><datalist id="relay-models">${models.map(m=>`<option value="${esc(m)}">`).join('')}</datalist></label><label>最大输出长度<input name="maxTokens" type="number" min="128" max="16000" value="${api.maxTokens||1600}"></label><div class="relay-actions"><button>保存配置</button><button type="button" data-relay-models>拉取模型</button><button type="button" data-relay-test>测试连接</button></div><output id="relay-api-status">${esc(apiStatus)}</output></form></details>`;
  const lengthFields=document.createElement('fieldset');
  lengthFields.innerHTML=`<legend>输出字数</legend>${toggle('limitWords','限制字数',d.limitWords)}<div class="relay-length-fields" data-length-fields><label>最少字数<input name="minWords" type="number" min="0" step="1" value="${esc(d.minWords)}" required></label><label>最多字数<input name="maxWords" type="number" min="1" step="1" value="${esc(d.maxWords)}" required></label></div>`;
  panel.querySelector('.relay-options').closest('fieldset').after(lengthFields);
  const counter=document.createElement('output');counter.dataset.relayCount='';counter.className='relay-word-count';counter.setAttribute('aria-live','polite');counter.title='非空白字符计字，含标点，不含空格和换行';
  panel.querySelector('[name=draft]').closest('label').after(counter);updateLength();
  const tokenLabel=panel.querySelector('[name=maxTokens]').parentElement;tokenLabel.firstChild.textContent='最大输出 tokens';
  const oracleButton=document.createElement('button');oracleButton.type='button';oracleButton.dataset.relayOracle='';oracleButton.innerHTML='<i class="fa-solid fa-masks-theater"></i> 人格与提示词';panel.querySelector('.relay-sources').append(oracleButton);
  const saveButton=document.createElement('button');saveButton.type='button';saveButton.dataset.relaySaveReferences='';saveButton.innerHTML='<i class="fa-solid fa-floppy-disk"></i> 保存设置';panel.querySelector('.relay-sources').append(saveButton);
  if(d.draftDisplay&&globalThis.DOMPurify){
    const preview=document.createElement('details');preview.dataset.section='regex-preview';
    preview.innerHTML='<summary>预设正则显示</summary>';
    const frame=document.createElement('iframe');frame.title='预设正则显示';frame.setAttribute('sandbox','');
    const html=globalThis.DOMPurify.sanitize(d.draftDisplay,{FORBID_TAGS:['script','iframe','object','embed','form','meta','base','link'],FORBID_ATTR:['href','srcset','action']});
    frame.srcdoc=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><style>body{font:14px/1.6 system-ui;overflow-wrap:anywhere;margin:12px}img{max-width:100%}</style>${html}`;
    preview.append(frame);panel.querySelector('[data-relay-main]').append(preview);
  }
  for(const key of opened)panel.querySelector(`[data-section="${key}"]`)?.setAttribute('open','');panel.scrollTop=scroll;
}
async function refreshPresets(){presetNames=await helper()?.getPresetNames?.()||[];}
async function generate(){
  if(busy)return;capture();captureApi();const d=structuredClone(data()),start=scope();busy=true;lastContext='正在准备参考资料';render();
  try{
    wordLimits(d);
    const character=ctx().characters?.[ctx().characterId]||{};const userName=ctx().name1;
    const oraclePreset=oracle.selectedNativePreset();
    if(d.usePreset||oraclePreset){
      lastContext='正在使用酒馆原生预设编排、世界书激活和正则';render();
      const result=await generateNative({d:oraclePreset?{...d,presetSource:'imported',importedPreset:oraclePreset}:d,helper:helper(),context:ctx,request,scope,extraInstructions:()=>oracle.instructions({forNative:true})});
      if(scope()!==start)return;
      if(!result.draft.trim())throw new Error('预设正则处理后没有可用文本，请检查正则作用范围');
      Object.assign(data(),{draft:result.draft,draftDisplay:result.display});
      lastContext=`原生预设已执行 · ${result.regexCount} 条启用正则 · 独立接力 API`;save();if(!checkDraft(result.draft,d).valid)notify(checkDraft(result.draft,d).message,'warning');return;
    }
    const previous=d.readPrevious?previousAssistant(rows(),userName):null;
    const books=d.readWorldbook?await readWorldbooks(helper(),character,(p,b)=>request(p,b,true)):{text:'',count:0};
    if(scope()!==start)return;
    lastContext=[d.readPrevious?`上一段 ${previous?.text.length||0} 字`:'',d.readCharacter?'角色卡已读取':'',d.readWorldbook?`世界书 ${books.count} 条`:'',d.useCustom?'自定义提示词已启用':''].filter(Boolean).join(' · ');
    const messages=relayPrompt({...d,userName,character:d.readCharacter?{name:character.name,description:character.description||character.data?.description,personality:character.personality||character.data?.personality,scenario:character.scenario||character.data?.scenario,persona:ctx().powerUserSettings?.persona_description}: {},previous:previous?.text||'',worldbook:books.text,customPrompt:d.useCustom?d.customPrompt:''});
    const response=await request('/generate',{messages:[...oracle.compose(messages),{role:'system',content:relayBoundary(d,userName)}]});if(scope()!==start)return;
    const draft=cleanDraft(response.content);if(!draft)throw new Error('模型未返回可用正文');Object.assign(data(),{draft,draftDisplay:''});save();if(!checkDraft(draft,d).valid)notify(checkDraft(draft,d).message,'warning');
  }catch(e){if(scope()===start){lastContext=e.message;notify(e.message,'error');}}finally{busy=false;render();}
}
async function insert(send){
  capture();captureApi();const d=data(),draft=d.draft,start=scope();
  if(!draft.trim())throw new Error('请先生成或填写预览内容');
  const checked=checkDraft(draft,d);if(!checked.valid)throw new Error(checked.message);
  const input=document.querySelector('#send_textarea');if(!input)throw new Error('未找到酒馆输入框');
  const button=send?document.querySelector('#send_but'):null;
  if(send&&(!button||button.disabled))throw new Error('酒馆当前不能发送，请稍后再试');
  if(input.value.trim()&&input.value!==draft&&!confirm('输入框已有文字，是否替换为接力预览？'))return;
  input.value=draft;input.dispatchEvent(new Event('input',{bubbles:true}));injectNote();
  if(send)button.click();
  // Clear this turn's inputs after handoff, never the saved writing preferences.
  if(scope()===start&&data().draft===draft){Object.assign(data(),{text:'',note:'',draft:'',draftDisplay:''});lastContext='';save();injectNote();}
  panel.close();render();input.focus();
}
function dragLauncher(button){
  const settings=()=>{const c=ctx();c.extensionSettings||={};return c.extensionSettings[MODULE]||={};};
  const apply=()=>{const p=settings().position;const next=clampPosition(p?p.x*(innerWidth-46):innerWidth-62,p?p.y*(innerHeight-46):innerHeight-206,46,46,innerWidth,innerHeight);Object.assign(button.style,{left:next.x+'px',top:next.y+'px',right:'auto',bottom:'auto'});};
  let drag,suppress=false;apply();addEventListener('resize',apply);
  button.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=button.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:e.clientX-r.left,dy:e.clientY-r.top,moved:false};button.setPointerCapture(e.pointerId);});
  button.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;drag.moved ||= Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6;if(!drag.moved)return;const p=clampPosition(e.clientX-drag.dx,e.clientY-drag.dy,46,46,innerWidth,innerHeight);button.style.left=p.x+'px';button.style.top=p.y+'px';});
  const finish=e=>{if(!drag||drag.id!==e.pointerId)return;if(drag.moved){const r=button.getBoundingClientRect();settings().position={x:r.left/Math.max(1,innerWidth-46),y:r.top/Math.max(1,innerHeight-46)};ctx().saveSettingsDebounced?.();suppress=true;}drag=null;button.releasePointerCapture?.(e.pointerId);};
  button.addEventListener('pointerup',finish);button.addEventListener('pointercancel',finish);button.addEventListener('click',e=>{if(suppress){e.stopImmediatePropagation();suppress=false;}},true);
}
function init(){
  if(!ctx())return;panel=document.createElement('dialog');panel.id='writer-relay-dialog';document.body.append(panel);
  const launcher=document.createElement('button');launcher.id='writer-relay-launcher';launcher.title='AI 接力';launcher.setAttribute('aria-label','AI 接力');launcher.innerHTML='<i class="fa-solid fa-pen-nib"></i>';document.body.append(launcher);dragLauncher(launcher);
  launcher.addEventListener('click',async()=>{if(panel.open)return;const openedScope=scope();render();panel.showModal();try{if(!config)config=(await request('/config')).config;await refreshPresets();if(scope()!==openedScope)return;capture();if(!apiDraft)apiDraft={...config?.send,apiKey:''};render();}catch(e){apiStatus=e.message;notify(e.message,'warning');}});
  panel.addEventListener('input',e=>{if(e.target.closest('[data-relay-api]'))captureApi();if(e.target.closest('[data-relay-main]')){capture();panel.querySelector('[data-custom-fields]').hidden=!data().useCustom;panel.querySelector('[data-preset-fields]').hidden=!data().usePreset;panel.querySelector('[data-relay-intensity]').textContent=data().intensity;updateLength();}});
  panel.addEventListener('change',async e=>{if(!e.target.hasAttribute('data-relay-file'))return;const file=e.target.files?.[0],start=scope();if(!file)return;try{if(file.size>5*1024*1024)throw new Error('预设文件超过5MB');const preset=JSON.parse((await file.text()).replace(/^\uFEFF/,''));validateNativePreset(preset);if(scope()!==start)return;capture();const current=Object.assign(data(),{importedPreset:preset,importedName:file.name,presetSource:'imported',usePreset:true});referenceDraft=referenceValues(current);save();render();}catch(err){notify(err.message,'error');}});
  panel.addEventListener('submit',async e=>{e.preventDefault();try{if(e.target.hasAttribute('data-relay-main'))await generate();else{const payload=formConfig();config=(await request('/config',payload)).config;apiDraft=null;apiStatus='配置已保存';capture();render();}}catch(err){notify(err.message,'error');}});
  panel.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
    if(b.hasAttribute('data-relay-oracle')){capture();oracle.open();}
    if(b.hasAttribute('data-relay-save-references')){saveReferences();b.title='已保存';}
    if(b.hasAttribute('data-relay-close')){capture();captureApi();panel.close();}
    if(b.hasAttribute('data-relay-clear-note')){capture();data().note='';save();injectNote();render();}
    if(b.hasAttribute('data-relay-import'))panel.querySelector('[data-relay-file]').click();
    if(b.hasAttribute('data-relay-refresh-presets')){capture();await refreshPresets();render();}
    if(b.hasAttribute('data-relay-insert'))await insert(false);
    if(b.hasAttribute('data-relay-send'))await insert(true);
    if(b.hasAttribute('data-relay-models')||b.hasAttribute('data-relay-test')){b.disabled=true;const isModels=b.hasAttribute('data-relay-models');config=(await request('/config',formConfig())).config;apiDraft=null;const result=await request(isModels?'/models':'/test',{slot:'send'});if(isModels)models=result.models;apiStatus=isModels?`已拉取 ${models.length} 个模型`:'连接成功';capture();render();panel.querySelector('[data-section=api]').open=true;}
  }catch(err){apiStatus=err.message;notify(err.message,'error');panel.querySelector('#relay-api-status').textContent=apiStatus;}finally{b.disabled=false;}});
  const types=ctx().event_types||{};ctx().eventSource?.on(types.CHAT_CHANGED||'chat_id_changed',()=>{lastContext='';injectNote();if(panel.open)render();});
  injectNote();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
