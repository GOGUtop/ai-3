import {createOraclePort} from './port.mjs';
export const ORACLE_TASKS={
  phone:'【宿主任务适配，优先于原模块的分析岗位】本次由用户授权为小手机工作：按前述任务扮演指定 NPC、服务商，或更新幕后状态，不作为故事神谕回答分析问题。人格只修饰助手表达，NPC 自己的人设、知情边界和关系优先。保持宿主要求的 JSON 字段和数据类型，不把 JSON 换成剧情分析、Markdown 或 HTML；禁止代用户发言、决定交易，禁止泄露其他人物的秘密。',
  relay:'【宿主任务适配，优先于原模块的分析岗位】本次由用户授权进行 AI 接力：生成用户准备发送的下一步动作与对白，而不是故事分析答案。遵守用户选择的叙述人称、写作目标与原话意图；不代 NPC 完成回应。人格不覆盖用户角色人设。返回可发送的写作成品，不输出助手评论。',
};
export function makeOracleBridge({namespace,kind,context,call}) {
  const root=()=>{const c=context();c.extensionSettings||={};c.extensionSettings[namespace]||={};return c.extensionSettings[namespace].oracle||={};};
  const port=createOraclePort({settings:root,context,save:()=>context().saveSettingsDebounced?.(),call});
  // Macros may set variables. Isolate that work from the main conversation.
  const isolate=fn=>{
    const c=context(),targets=[[c.chatMetadata,'variables'],[c.extensionSettings?.variables,'global']].filter(([o])=>o);
    const saved=targets.map(([o,k])=>({o,k,exists:Object.hasOwn(o,k),value:o[k],local:structuredClone(o[k])}));
    for(const {o,k,local} of saved)o[k]=local;
    try{return fn();}finally{for(const {o,k,exists,value} of saved){if(exists)o[k]=value;else delete o[k];}}
  };
  return {...port,
    compose:(messages,options={})=>isolate(()=>port.compose(messages,{...options,task:ORACLE_TASKS[kind]})),
    instructions:options=>isolate(()=>[...port.instructionMessages(options),...(root().enabled?[{role:'system',content:ORACLE_TASKS[kind]}]:[])]),
  };
}
