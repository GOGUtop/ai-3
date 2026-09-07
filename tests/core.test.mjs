import test from 'node:test';
import assert from 'node:assert/strict';
import { relayPrompt,cleanDraft,wordLimits,draftLength,checkDraft,relayBoundary } from '../core.mjs';
test('all selected goals and separate author direction participate in generation',()=>{
 const p=relayPrompt({userName:'阿遥',character:{name:'林澈'},history:[],state:{},text:'我要吃饭',note:'人前显圣',options:['扩写','加强情绪','搞笑'],perspective:'第一人称'});
 assert(p[0].content.includes('扩写、加强情绪、搞笑'));assert(p[0].content.includes('作者要求：人前显圣'));assert(!p.at(-1).content.includes('人前显圣'));assert(p[0].content.includes('第一人称'));
});
test('provider reasoning blocks cannot become the user message',()=>assert.equal(cleanDraft('<thinking>hidden</thinking>\n我拿起筷子。'),'我拿起筷子。'));

test('word limits are optional, preserve zero minimum and support exact length',()=>{
 assert.equal(wordLimits({}),null);
 assert.equal(wordLimits({limitWords:false,minWords:'bad',maxWords:''}),null);
 assert.deepEqual(wordLimits({limitWords:true,minWords:'0',maxWords:'500'}),{min:0,max:500});
 assert(checkDraft('我问。',{limitWords:true,minWords:3,maxWords:3}).valid);
 assert(!checkDraft('我问。',{limitWords:true,minWords:4,maxWords:5}).valid);
 assert(!checkDraft('我问。',{limitWords:true,minWords:0,maxWords:2}).valid);
});
test('invalid, missing and reversed limits never silently become defaults',()=>{
 for(const [minWords,maxWords] of [['',100],[null,100],[0,''],[-1,10],[0,0],[2,1],[1.5,10],[0,Infinity],[0,Number.MAX_SAFE_INTEGER+1]])assert.throws(()=>wordLimits({limitWords:true,minWords,maxWords}),/字数范围/);
});
test('count uses Unicode code points including punctuation and excludes whitespace',()=>{
 assert.equal(draftLength('我 问。\n\t\u{20000}'),4);
 assert.equal(draftLength(''),0);
});
test('boundary ties all perspectives to user and overrides incompatible preset roles and lengths',()=>{
 for(const perspective of ['第一人称','第二人称','第三人称']){
  const text=relayBoundary({perspective,limitWords:true,minWords:40,maxWords:90},'阿遥');
  assert.match(text,/唯一代写对象是 user（用户角色）：阿遥/);
  assert.match(text,/禁止替其他人物新增台词、动作、心理、反应或决定/);
  assert.match(text,/40–90 字/);assert.match(text,/此范围取代预设/);
 }
});
