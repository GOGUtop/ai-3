import test from 'node:test';
import assert from 'node:assert/strict';
import { relayPrompt,cleanDraft } from '../core.mjs';
test('all selected goals and separate author direction participate in generation',()=>{
 const p=relayPrompt({userName:'阿遥',character:{name:'林澈'},history:[],state:{},text:'我要吃饭',note:'人前显圣',options:['扩写','加强情绪','搞笑'],perspective:'第一人称'});
 assert(p[0].content.includes('扩写、加强情绪、搞笑'));assert(p[0].content.includes('作者要求：人前显圣'));assert(!p.at(-1).content.includes('人前显圣'));assert(p[0].content.includes('第一人称'));
});
test('provider reasoning blocks cannot become the user message',()=>assert.equal(cleanDraft('<thinking>hidden</thinking>\n我拿起筷子。'),'我拿起筷子。'));
