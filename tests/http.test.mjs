import test from 'node:test';
import assert from 'node:assert/strict';
import {relayRequest} from '../http.mjs';
test('404 identifies missing route and actual backend version rather than claiming missing installation',async()=>{
  await assert.rejects(relayRequest('/native-session',{body:{},fetchImpl:async url=>url.endsWith('/health')?Response.json({ok:true,version:'1.0.0'}):new Response('Not found',{status:404})}),e=>e.message.includes('/native-session')&&e.message.includes('1.0.0')&&!e.message.includes('请安装'));
});
test('missing health points to process/port or proxy, not API key settings',async()=>{
  await assert.rejects(relayRequest('/generate',{body:{},fetchImpl:async()=>new Response('Not found',{status:404})}),/端口占用/);
});
test('health and non-404 failures keep accurate HTTP results',async()=>{
  assert.equal((await relayRequest('/health',{fetchImpl:async()=>Response.json({ok:true,version:'1.2.0'})})).version,'1.2.0');
  await assert.rejects(relayRequest('/config',{fetchImpl:async()=>new Response('Login required',{status:401})}),/401/);
});
