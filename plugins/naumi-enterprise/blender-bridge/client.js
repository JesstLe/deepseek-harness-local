import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';

export const bridgeFile=home=>path.join(home,'active.json');
const fail=code=>{throw Error(code);};
export function readBridge(home){
  let d;try{d=JSON.parse(fs.readFileSync(bridgeFile(home),'utf8'));}catch(e){if(e.code==='ENOENT')return null;fail('BLENDER_DESCRIPTOR_INVALID');}
  if(d.version!==1||!Number.isInteger(d.port)||d.port<1||d.port>65535||!Number.isInteger(d.pid)||d.pid<1||!/^[a-f0-9]{64}$/.test(d.token)||typeof d.instanceId!=='string')fail('BLENDER_DESCRIPTOR_INVALID');
  return d;
}
export function requestBlender(home,type,params={}, {requestId=randomUUID(),timeoutMs=120000,signal}={}){
  const d=readBridge(home);if(!d)return Promise.reject(Error('BLENDER_NOT_CONNECTED'));
  const payload=JSON.stringify({id:requestId,instanceId:d.instanceId,type,params}),mac=createHmac('sha256',d.token).update(payload).digest('hex');
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(Error('BLENDER_REQUEST_ABORTED'));return;}
    const socket=net.createConnection({host:'127.0.0.1',port:d.port}),chunks=[];let bytes=0,settled=false,sent=false;
    const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);socket.destroy();error?reject(error):resolve(value);};
    const abort=()=>finish(Error(sent?'BLENDER_RESULT_UNKNOWN':'BLENDER_REQUEST_ABORTED'));
    socket.setTimeout(timeoutMs,()=>finish(Error(sent?'BLENDER_RESULT_UNKNOWN':'BLENDER_CONNECTION_TIMEOUT')));
    socket.on('connect',()=>{socket.write(JSON.stringify({payload,mac})+'\n');sent=true;});
    socket.on('error',()=>finish(Error(sent?'BLENDER_RESULT_UNKNOWN':'BLENDER_NOT_CONNECTED')));
    socket.on('end',()=>{if(!settled)finish(Error('BLENDER_RESULT_UNKNOWN'));});
    socket.on('data',chunk=>{
      bytes+=chunk.length;if(bytes>12*1024*1024){finish(Error('BLENDER_RESPONSE_TOO_LARGE'));return;}chunks.push(chunk);
      const raw=Buffer.concat(chunks).toString('utf8');if(!raw.endsWith('\n'))return;
      try{
        const envelope=JSON.parse(raw),expected=createHmac('sha256',d.token).update(envelope.payload).digest(),actual=Buffer.from(envelope.mac??'','hex');
        if(actual.length!==expected.length||!timingSafeEqual(expected,actual))fail('BLENDER_REPLY_AUTH_FAILED');
        const value=JSON.parse(envelope.payload);if(value.id!==requestId||value.instanceId!==d.instanceId)fail('BLENDER_REPLY_IDENTITY');
        if(value.status==='error')fail(/^BLENDER_[A-Z_]+$/.test(value.code??'')?value.code:'BLENDER_EXECUTION_FAILED');
        finish(null,value.result);
      }catch(e){finish(/^BLENDER_/.test(e.message)?e:Error('BLENDER_INVALID_RESPONSE'));}
    });
    signal?.addEventListener('abort',abort,{once:true});
  });
}
