import test from 'node:test';
import assert from 'node:assert/strict';
import {previousAssistant,presetText,readWorldbooks,clampPosition} from '../context.mjs';
import {relayPrompt} from '../core.mjs';
test('previous context contains only the last AI narrative, not reasoning or user text',()=>{
 const row=previousAssistant([{role:'assistant',mes:'旧楼层'},{role:'assistant',mes:'<think>推演</think><content>他放下茶杯。</content>'},{role:'user',mes:'我的输入'}]);assert.equal(row.text,'他放下茶杯。');
});
test('preset order respects enablement, markers and simple character macros',()=>{
 const p={prompts:[{identifier:'a',content:'{{char}}对{{user}}'},{identifier:'b',content:'关闭的提示词'},{identifier:'c',marker:true,content:'标记'}],prompt_order:[{character_id:100001,order:[{identifier:'b',enabled:false},{identifier:'c',enabled:true},{identifier:'a',enabled:true}]}]};
 assert.equal(presetText(p,{characterName:'林澈',userName:'阿遥'}),'【a】\n林澈对阿遥');
 assert.equal(presetText({prompts:[{id:'a',content:'启用',enabled:true},{id:'b',content:'关闭',enabled:false}]}),'【a】\n启用');
});
test('worldbooks include primary, additional, chat, global and embedded enabled prose',async()=>{
 const h={getCharWorldbookNames:()=>({primary:'a',additional:['b']}),getChatWorldbookName:()=> 'c',getGlobalWorldbookNames:()=>['d'],getWorldbook:n=>[{name:n,content:n},{enabled:false,content:'disabled'}]};
 const result=await readWorldbooks(h,{data:{character_book:{entries:[{content:'embedded'}]}}});assert.equal(result.count,5);assert.doesNotMatch(result.text,/disabled/);
});
test('optional relay sources are independent and floating position stays inside viewport',()=>{
 const base=relayPrompt({text:'喝茶',userName:'阿遥'}).map(m=>m.content).join('');assert.doesNotMatch(base,/SENTINEL/);
 for(const field of ['previous','worldbook','customPrompt','writingPreset'])assert.match(relayPrompt({text:'喝茶',userName:'阿遥',[field]:'SENTINEL'}).map(m=>m.content).join(''),/SENTINEL/);
 assert.deepEqual(clampPosition(-100,2000,46,46,390,844),{x:8,y:790});
});
