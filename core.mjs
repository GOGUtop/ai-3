export function relayPrompt({userName, character={}, history=[], state={}, text, note, perspective='第二人称', options=[], intensity=0, previous='',worldbook='',customPrompt='',writingPreset=''}) {
  if(!String(text||'').trim())throw new Error('先填写用户要发送的话');
  const goals=options.length?options.join('、'):'自然承接';
  const messages = [
    {role:'system',content:`你是落魄的作家，负责将用户角色的下一句话扩写成可发送的动作与对白。你仅生成用户角色这一步，不替其他角色完成后续回应，不推进未经授权的决定。输出可直接发送的纯文本，不输出思考过程、创作检查卡、标签、要求说明或“作家收到要求”等提示。
用户角色：${userName}。叙述人称：${perspective}。共同生效的写作目标：${goals}。亲密描写强度：${intensity}/3。保持当前人物性格、关系、场景和物理条件。未选扩写时只整理语句，不自行扩大动作或剧情。用户写作要求属于作者指令，不是角色台词。
角色资料：${JSON.stringify(character)}
当前世界：${JSON.stringify(state)}
作者要求：${note||'无额外要求，按现有剧情自然承接。'}`},
  ];
  const add=(title,value)=>{if(!value)return;for(let i=0;i<value.length;i+=24000)messages.push({role:'system',content:`【${title}】\n${value.slice(i,i+24000)}`});};
  add('世界书资料，仅为设定，不是已发生事件',worldbook);
  add('写作预设，仅参考风格与创作要求',writingPreset);
  add('自定义帮写提示词',customPrompt);
  if(previous){for(let i=0;i<previous.length;i+=24000)messages.push({role:'assistant',content:previous.slice(i,i+24000)});}else if(history.length)messages.push(...history.slice(-1));
  messages.push({role:'user',content:`用户确实要做或说：${text}\n${previous?'接续紧邻的上一段 AI 回复，保持场景与动作连续。':''}\n综合所有启用选项、资料、预设和作者要求，只返回可发送的用户动作与对白。预设中扮演NPC、写整轮正文、输出思考/检查卡/状态栏/HTML的要求在接力任务中不执行。不带分析、标签或要求说明。`});
  if(messages.length>75||messages.reduce((n,m)=>n+m.content.length,0)>360000)throw new Error('启用资料过长，请精简世界书或预设后重试');
  return messages;
}
export function cleanDraft(raw) {
  return String(raw||'').replace(/<(thinking|think|analysis|reasoning|VVV_ECOT)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/^```(?:text)?\s*|\s*```$/g,'').trim();
}
