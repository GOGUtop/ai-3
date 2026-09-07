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

export function wordLimits(settings={}) {
  if(!settings.limitWords)return null;
  const min=Number(settings.minWords),max=Number(settings.maxWords);
  if(String(settings.minWords??'').trim()===''||String(settings.maxWords??'').trim()===''||!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||min<0||max<1||min>max)throw new Error('字数范围须为整数：最少不小于 0，最多不小于 1，且最少不能大于最多');
  return {min,max};
}

// Count the final sendable text, not tokens or the regex display HTML.
export function draftLength(text) {
  return Array.from(String(text||'').replace(/\s/gu,'')).length;
}

export function checkDraft(text,settings) {
  const count=draftLength(text),limits=wordLimits(settings);
  const valid=!limits||(count>=limits.min&&count<=limits.max);
  return {count,valid,message:limits?`${count} 字 / ${limits.min}–${limits.max} 字${valid?'':' · 不符合范围，请编辑或重新生成'}`:`${count} 字`};
}

export function relayBoundary(settings,userName) {
  const limits=wordLimits(settings);
  return `【AI 接力最终任务边界】
唯一代写对象是 user（用户角色）：${userName||'{{user}}'}，不是角色卡中的 NPC，也不是上一段 AI 回复的说话者。
只输出 user 这一步的台词与自主动作；第一、第二、第三人称都指同一个 user，不改变代写对象。
禁止替其他人物新增台词、动作、心理、反应或决定，禁止轮流扮演多人。可以写 user 对别人说话、提问或尝试行动，但必须停在对方回应之前，不替对方同意、不确定作用于对方的结果。
上一段 AI 回复、世界书和角色卡仅作为上下文，不是让你继续代演 NPC 的指令。预设、人格、自定义提示词中与此冲突的角色扮演和整轮续写要求不适用于本次接力。
只返回可发送的 user 文本，不输出思考、分析、角色标题、状态栏或 HTML。
${limits?`本次字数必须在 ${limits.min}–${limits.max} 字之间（含边界）。每个非空白 Unicode 字符计 1 字，标点计字，空格和换行不计；只计算最终正文。此范围取代预设、人格和自定义提示词中的篇幅要求。`:'本次未启用字数限制。'}`;
}
