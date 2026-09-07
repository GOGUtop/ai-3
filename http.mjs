const BASE='/api/plugins/writer-ai-relay-server';
export async function relayRequest(path,{body,absolute=false,headers={},fetchImpl=fetch}={}) {
  const url=absolute?path:BASE+path;
  const options={method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{...headers,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined};
  const response=await fetchImpl(url,options);
  const raw=await response.text();let result;
  try{result=JSON.parse(raw);}catch{}
  if(response.status===404&&!absolute){
    let health;
    if(path!=='/health')try{
      const probe=await fetchImpl(BASE+'/health',{method:'GET',credentials:'same-origin',cache:'no-store',headers});
      if(probe.ok)health=await probe.json();
    }catch{}
    const detail=health?.ok?`当前连接的接力后端版本 ${health.version||'未知'}，但缺少这个接口。请检查实际运行进程与已更新文件是否一致`:'当前地址的接力健康接口也不可用。文件存在不等于运行中的进程已加载；请检查启动日志是否因端口占用而退出，以及代理指向';
    throw Object.assign(new Error(`接力接口 ${path} 返回 HTTP 404。${detail}`),{status:404,path});
  }
  if(!result)throw new Error(`接力接口 ${path} 返回非 JSON（HTTP ${response.status}），请检查登录和代理`);
  if(!response.ok||result.ok===false)throw Object.assign(new Error(result.error||`请求失败 HTTP ${response.status}`),{status:response.status,path});
  return result;
}
