import test from 'node:test';
import assert from 'node:assert/strict';
import {createOraclePort} from '../oracle/port.mjs';
import {makeOracleBridge} from '../oracle/bridge.mjs';
function fixture(){const settings={enabled:true,builtinJbMigrated:true,sysPromptPresetName:'',systemPrompt:'CUSTOM'};const context={name1:'用户',substituteParams:t=>String(t).replaceAll('{{user}}','用户'),getCharacterCardFields:()=>({description:'CARD'}),extensionSettings:{},chatMetadata:{}};return {settings,context,port:createOraclePort({settings:()=>settings,context:()=>context,save(){}})};}
test('ported original personas, caps and flesh parser are available without StoryOracleAPI',()=>{
  const {port}=fixture();assert.equal(port.original.PERSONAS.length,4);assert.equal(port.original.CUSTOM_PERSONA_CAPS.count,20);
  assert.equal(port.original.normalizeCustomPersonas(Array.from({length:25},(_,i)=>({id:'p'+i,label:'名字',voice:'说话方式'}))).length,20);
  assert.deepEqual(port.original.parsePersonaFleshReply('<think>hidden</think><PersonaVoice>声音</PersonaVoice><PersonaExample>示例</PersonaExample>'),{voice:'声音',example:'示例',fallback:false});
  assert.match(port.original.buildPersonaFleshMessages('伙伴','轻松')[1].content,/伙伴/);
});
test('all eleven original prompt editors resolve their own saved overrides',()=>{
  const {port,settings}=fixture();assert.equal(port.original.SYSPROMPT_MODES.length,11);
  for(const mode of port.original.SYSPROMPT_MODES){settings[mode.key]='MODE:'+mode.id;settings.activePromptMode=mode.id;assert.match(JSON.stringify(port.instructionMessages()),new RegExp('MODE:'+mode.id));}
});
test('original frozen curation preserves roles and disables custom chat text; native selection retains preset settings and regex',()=>{
  const {port,settings}=fixture();const raw={temperature:.3,extensions:{regex_scripts:[{id:'rule'}]},prompts:[{identifier:'main',content:'live',injection_position:1,injection_depth:3}],prompt_order:[]};
  settings.sysPromptPresetName='frozen';settings.curatedPresets={frozen:{items:[{kind:'text',identifier:'main',name:'主提示',role:'assistant',content:'FROZEN'},{kind:'marker',identifier:'chatHistory'}]}};settings.presetSources={frozen:raw};
  const out=port.compose([{role:'user',content:'QUESTION'}],{task:'TASK'});assert.ok(out.some(r=>r.role==='assistant'&&r.content==='FROZEN'));assert.doesNotMatch(JSON.stringify(out),/CUSTOM|live/);
  const native=port.selectedNativePreset();assert.equal(native.prompts[0].injection_depth,3);assert.equal(native.prompts[0].content,'FROZEN');assert.equal(native.temperature,.3);assert.equal(native.extensions.regex_scripts[0].id,'rule');
  raw.prompts[0].content='changed';assert.equal(native.prompts[0].content,'FROZEN');
});
test('host stores stay independent and macro side effects are restored',()=>{
  const c={extensionSettings:{variables:{global:{old:1}}},chatMetadata:{variables:{old:2}},saveSettingsDebounced(){},substituteParams:t=>{c.chatMetadata.variables.old=999;c.extensionSettings.variables.global.old=999;return t;}};
  const phone=makeOracleBridge({namespace:'phone',kind:'phone',context:()=>c}),relay=makeOracleBridge({namespace:'relay',kind:'relay',context:()=>c});
  Object.assign(phone.settings(),{enabled:true,builtinJbMigrated:true,sysPromptPresetName:'',systemPrompt:'PHONE'});
  Object.assign(relay.settings(),{enabled:true,builtinJbMigrated:true,sysPromptPresetName:'',systemPrompt:'RELAY'});
  const originalLocal=c.chatMetadata.variables,originalGlobal=c.extensionSettings.variables.global;
  const p=JSON.stringify(phone.compose([{role:'user',content:'Hi'}]));assert.match(p,/PHONE/);assert.doesNotMatch(p,/RELAY/);assert.match(p,/宿主任务适配/);
  assert.equal(c.chatMetadata.variables.old,2);assert.equal(c.extensionSettings.variables.global.old,1);
  assert.equal(c.chatMetadata.variables,originalLocal);assert.equal(c.extensionSettings.variables.global,originalGlobal);
});
