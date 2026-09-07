import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {generateNative,nativeOptions,presetSettings,temporaryFields} from '../native.mjs';
import {createNativeSession} from '../server-plugin/writer-ai-relay-server/native-session.mjs';

const d={text:'我去赴约',perspective:'第一人称',options:['扩写'],intensity:0,readPrevious:true,readCharacter:true,readWorldbook:true,useCustom:true,customPrompt:'写得简练',presetSource:'imported',importedPreset:{prompts:[{identifier:'main',role:'system',content:'PRESET'}],prompt_order:[{character_id:100001,order:[{identifier:'main',enabled:true}]}],temperature:0,openai_max_tokens:7000,extensions:{regex_scripts:[{id:'preset-rule'}]}}};
test('server installer includes the native-session dependency',async()=>{
  const script=await readFile(new URL('../install-server.sh',import.meta.url),'utf8');
  assert.match(script,/cp "\$SOURCE_DIR\/native-session\.mjs" "\$TARGET_DIR\/native-session\.mjs"/);
});
function fixture() {
  const settings={prompts:['original'],prompt_order:['old'],extensions:{regex_scripts:[]},temp_openai:.9,openai_max_tokens:800,preset_settings_openai:'Original'};
  const extensionSettings={regex:[],preset_allowed_regex:{openai:[]},character_allowed_regex:['avatar']};
  const context={name1:'阿遥',chat:[{is_user:false,mes:'PREVIOUS'},{is_user:true,mes:'not this'}],event_types:{},eventSource:new EventEmitter()};
  const script={main_api:'openai',isGenerating:()=>false};
  const api={oai_settings:settings,promptManager:{},settingsToUpdate:{temperature:['','temp_openai',false,false],openai_max_tokens:['','openai_max_tokens',false,false]}};
  const engine={SCRIPT_TYPES:{PRESET:2},regex_placement:{AI_OUTPUT:2,USER_INPUT:1},getRegexScripts:()=>[{id:'preset-rule'}],getRegexedString:(text,placement,params)=>text};
  const modules={'/scripts/openai.js':api,'/script.js':script,'/scripts/extensions/regex/engine.js':engine,'/scripts/extensions.js':{extension_settings:extensionSettings}};
  let chatScope='a';const calls=[];
  return {settings,extensionSettings,context,script,api,engine,calls,setScope:v=>chatScope=v,options:{d,context:()=>context,scope:()=>chatScope,load:async p=>modules[p],request:async(path,body)=>{calls.push({path,body});return {apiurl:'http://127.0.0.1:1/v1',key:'temporary',model:'relay'};}}};
}
test('native preset settings preserve zero temperature, ordering and extensions without replacing connections',()=>{
  const p={...d.importedPreset,reverse_proxy:'evil'};
  assert.equal(presetSettings(p,{temperature:['','temp_openai',false,false],reverse_proxy:['','reverse_proxy',false,true]}).temp_openai,0);
  assert.equal(presetSettings(p,{reverse_proxy:['','reverse_proxy',false,true]}).reverse_proxy,undefined);
});
test('native generator delegates to helper.generate, restores main settings before API wait, and keeps output regex stages separate',async()=>{
  const f=fixture(),before=structuredClone(f.settings),oldExt=structuredClone(f.extensionSettings),regexCalls=[];
  f.engine.getRegexedString=(text,placement,params)=>{regexCalls.push({text,placement,params});return text;};
  const result=await generateNative({...f.options,helper:{generate:async config=>{
    assert.equal(f.settings.temp_openai,0);assert.equal(f.settings.openai_max_tokens,7000);
    assert.deepEqual(f.settings.prompts,d.importedPreset.prompts);
    assert.equal(config.preset_name,undefined);assert.equal(config.ordered_prompts,undefined);
    assert.equal(config.overrides.chat_history.prompts[0].content,'PREVIOUS');
    assert.equal(config.custom_api.max_tokens,'same_as_preset');
    f.context.eventSource.emit('chat_completion_settings_ready',{reverse_proxy:config.custom_api.apiurl,proxy_password:config.custom_api.key});
    assert.deepEqual(f.settings,before);return 'generated';
  }}});
  assert.equal(result.draft,'generated');assert.deepEqual(f.settings,before);assert.deepEqual(f.extensionSettings,oldExt);
  assert.equal(regexCalls.filter(r=>r.text==='generated').length,2);
  assert.equal(f.context.eventSource.listenerCount('chat_completion_settings_ready'),0);
  assert.equal(f.calls.at(-1).path,'/native-session/close');
});
test('native failure and chat switch restore settings and release single-flight lock',async()=>{
  const f=fixture(),before=structuredClone(f.settings);
  await assert.rejects(generateNative({...f.options,helper:{generate:async()=>{throw new Error('upstream failure');}}}),/upstream failure/);
  assert.deepEqual(f.settings,before);
  await assert.rejects(generateNative({...f.options,helper:{generate:async()=>{f.setScope('b');return 'wrong chat';}}}),/聊天已切换/);
  assert.deepEqual(f.settings,before);
});
test('temporary field restoration preserves concurrent edits',()=>{
  const target={a:1,b:2};const restore=temporaryFields(target,{a:3,b:4,c:5});target.b=6;restore();restore();assert.deepEqual(target,{a:1,b:6});
});
test('native source toggles exclude previous/card/world independently and custom prompt is actually injected',()=>{
  const opts=nativeOptions({...d,readCharacter:false,readWorldbook:false},{previous:'',generationId:'test',customApi:{},regex:t=>t,userName:'我'});
  assert.deepEqual(opts.overrides.chat_history.prompts,[]);assert.equal(opts.overrides.char_description,'');assert.equal(opts.overrides.world_info_before,'');
  assert.equal(opts.overrides.chat_history.with_depth_entries,false);assert.match(opts.injects[0].content,/写得简练/);
});
test('loopback native API proxy keeps provider key server-side and forwards native parameters without flattening',async()=>{
  let sent;
  const s=await createNativeSession({baseUrl:'https://provider.invalid/v1',apiKey:'provider-secret',model:'relay-model'}, {fetchImpl:async(url,options)=>{sent={url:String(url),...options};return new Response(JSON.stringify({choices:[{message:{content:'hello'}}]}));}});
  try {
    assert.notEqual(s.key,'provider-secret');
    const denied=await fetch(s.apiurl+'/chat/completions',{method:'POST',body:'{}'});assert.equal(denied.status,403);
    const body={messages:[{role:'system',content:'A'},{role:'user',content:'B'}],temperature:0,max_tokens:9000,top_p:.8,seed:123,stream:false};
    const result=await fetch(s.apiurl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+s.key},body:JSON.stringify(body)});
    assert.equal(result.status,200);assert.equal((await result.json()).choices[0].message.content,'hello');
    assert.deepEqual(JSON.parse(sent.body),{...body,model:'relay-model'});assert.equal(sent.headers.Authorization,'Bearer provider-secret');
  }finally{s.close();}
});
test('native network failure records transport reason without exposing provider keys',async()=>{
  const s=await createNativeSession({baseUrl:'https://provider.invalid/v1',apiKey:'provider-secret',model:'relay'}, {fetchImpl:async()=>{throw new TypeError('fetch failed',{cause:{code:'ENOTFOUND'}});}});
  try{
    const result=await fetch(s.apiurl+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+s.key},body:JSON.stringify({messages:[{role:'user',content:'test'}]})});
    assert.equal(result.status,502);assert.equal(s.inspect().phase,'failed');assert.match(s.inspect().error,/ENOTFOUND/);assert.doesNotMatch(JSON.stringify(s.inspect()),/provider-secret/);
  }finally{s.close();}
});
test('native generation attaches request-local failure details before cleaning up session',async()=>{
  const f=fixture();const base=f.options.request;
  await assert.rejects(generateNative({...f.options,request:async(p,b)=>p==='/native-session/status'?{ok:true,phase:'failed',error:'接力模型接口 HTTP 503'}:base(p,b),helper:{generate:async()=>{throw new Error('Bad Gateway');}}}),/HTTP 503/);
  assert.equal(f.calls.at(-1).path,'/native-session/close');
});
