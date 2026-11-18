import assert from 'node:assert/strict';
import {zstdDecompressSync,zstdCompressSync} from 'node:zlib';
import {createSystemMessage} from '@deepseek-ai/dsh-llm';
import {digest} from './session-import-source.js';

/** Exact legacy-import repair planner only. Never touches disk. Caller must verify
 * native read/write/reopen on a copy, then CAS original bytes in an idle window. */
export function planImportedHeadRepair(bytes,plan){
 assert(plan.sessionId?.startsWith('naumi-import-'));
 assert.equal(plan.eventsDigest,digest(JSON.stringify(plan.events)));
 assert.equal(plan.snapshotDigest,digest(JSON.stringify(plan.snapshot)));
 let offset=0;const parts=[];while(offset<bytes.length){const r=zstdDecompressSync(bytes.subarray(offset),{info:true});assert(r.engine.bytesWritten>0);offset+=r.engine.bytesWritten;parts.push(r.buffer);}
 const rows=Buffer.concat(parts).toString('utf8').trim().split('\n').map(JSON.parse),header=rows[0],events=rows.slice(1);
 assert.equal(header.version,4);assert.equal(header.id,plan.sessionId);assert.equal(header.isSeeded,false);
 assert(events.length>=plan.events.length);
 for(let i=0;i<plan.events.length;i++)assert.deepEqual(events[i],plan.events[i],'IMPORT_PREFIX_CHANGED '+i);
 const first=events.find(e=>e.surfaceOp!==undefined);assert(first&&first.type==='user/message'&&first.data.source?.kind==='naumi-session-import','NOT_LEGACY_IMPORT');
 const allowed=new Set(['session/title','user/message','turn/start','step/start','assistant/message','step/end','turn/end','session/end-seed','permission/preset','sandbox/mode','approval/policy','model/selection','agent/inbox/spliced','system/message','request/header','request/context','assistant/attempt','compaction/start','compaction/end']);
 for(const e of events){assert(allowed.has(e.type),'UNSUPPORTED_REPAIR_EVENT '+e.type);assert(e.surfaceOp===undefined||e.surfaceOp==='append','REPAIR_REPLACEMENT_NOT_SUPPORTED');assert(e.sourceEventSeqs===undefined,'REPAIR_REFS_NOT_SUPPORTED');if(e.type==='session/title')assert(e.data.messageSeqs.length===0,'REPAIR_TITLE_REFS_NOT_SUPPORTED');}
 const time=header.createdAt,anchor=[{type:'turn/start',data:{turn:1}},{type:'step/start',data:{turn:1,step:1}},{type:'system/message',data:{turn:1,step:1,message:createSystemMessage('')},surfaceOp:'append'},{type:'step/end',data:{turn:1,step:1}},{type:'turn/end',data:{turn:1,reason:{kind:'completed'}}}].map((e,seq)=>({...e,seq,time}));
 const shifted=events.map((e,i)=>{assert.equal(e.seq,i);const data=structuredClone(e.data);if(typeof data.turn==='number')data.turn++;return{...e,seq:e.seq+anchor.length,data};});
 // Exact comparison after reversing only the declared sequence/turn offset.
 for(let i=0;i<events.length;i++){const e=structuredClone(shifted[i]);e.seq-=anchor.length;if(typeof e.data.turn==='number')e.data.turn--;assert.deepEqual(e,events[i]);}
 // Native V4 framing reserves the first Zstandard frame for exactly the header.
 const after=Buffer.concat([zstdCompressSync(Buffer.from(JSON.stringify(header)+'\n')),zstdCompressSync(Buffer.from([...anchor,...shifted].map(JSON.stringify).join('\n')+'\n'))]);
 return{after,receipt:{version:1,sessionId:header.id,originalSHA256:digest(bytes),modifiedSHA256:digest(after),originalEvents:events.length,addedEvents:anchor.length,sequenceOffset:anchor.length,turnOffset:1,originalEventDataPreserved:true,messageIdsPreserved:true,sourcePlanUnchanged:true}};
}
