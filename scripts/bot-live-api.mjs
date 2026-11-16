import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
export async function botLiveApi(runtime='E:/Workspace/deepseek-harness-local'){
  const base='http://127.0.0.1:3080';
  const logs=['server.out.log','server.err.log'].map(p=>fs.readFileSync(path.join(runtime,'logs',p),'utf8')).join('\n');
  const launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch,'launch URL missing');
  const exchange=await fetch(launch,{redirect:'manual',signal:AbortSignal.timeout(5000)});assert.equal(exchange.status,303);
  const cookie=exchange.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');assert(cookie);
  const request=async(url,options={})=>fetch(base+url,{...options,headers:{cookie,...options.headers},signal:options.signal??AbortSignal.timeout(15000)});
  const json=async(url,body,header)=>{
    const response=await request(url,body?{method:'POST',headers:{'Content-Type':'application/json',...(header?{[header]:'1'}:{})},body:JSON.stringify(body)}:{});
    const value=await response.json();if(!response.ok)throw Error(value.error??'HTTP_'+response.status);return value;
  };
  const rpc=async(method,args,timeoutMs=15000)=>{
    const response=await request('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'naumi-bot-integration',method,payload:{args}}),signal:AbortSignal.timeout(timeoutMs)});
    const result=(await response.json()).result;if(!result?.ok)throw Error(result?.error?.code??'RPC_FAILED');return result.value;
  };
  return {base,request,json,rpc};
}
