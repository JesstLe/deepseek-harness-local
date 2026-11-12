import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
export async function connect() {
  const logs=['logs/server.out.log','logs/server.err.log'].map(p=>fs.readFileSync(p,'utf8')).join('\n');
  const launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];
  if(!launch) throw Error('Local authenticated launch URL missing');
  const exchange=await fetch(launch,{redirect:'manual'});
  const cookie=exchange.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  if(!cookie) throw Error('Browser authentication failed');
  return async (method,args={})=>{
    const response=await fetch('http://127.0.0.1:3080/api/'+method,{
      method:'POST',headers:{cookie,'content-type':'application/json'},
      body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method,payload:{args}}),
    });
    const envelope=await response.json();
    if(!envelope.result?.ok) throw Error(JSON.stringify(envelope.result?.error??{http:response.status}));
    return envelope.result.value;
  };
}
