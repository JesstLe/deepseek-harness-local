import fs from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{zstdDecompressSync}from'node:zlib';
const hash=b=>createHash('sha256').update(b).digest('hex');
/** Read-only: exact bytes except verified empty end-seed frames appended by
 * native cold-session restoration. Text/tool/model/config changes still reject. */
export function verifyThreadProtectedFile(file,expected){
 const bytes=fs.readFileSync(file);if(hash(bytes)===expected)return{kind:'exact'};
 assert(file.endsWith('session.v4.jsonl.zstd'),'NON_SESSION_DRIFT '+file);let pos=0,originalEnd=null,events=[];
 while(pos<bytes.length){const frame=zstdDecompressSync(bytes.subarray(pos),{info:true});assert(frame.engine.bytesWritten>0,'SESSION_FRAME_INVALID');pos+=frame.engine.bytesWritten;if(originalEnd!==null)events.push(...frame.buffer.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse));if(hash(bytes.subarray(0,pos))===expected)originalEnd=pos;}
 assert(originalEnd!==null,'ORIGINAL_SESSION_PREFIX_CHANGED '+file);assert(events.length&&events.every(row=>row.type==='session/end-seed'&&row.data&&Object.keys(row.data).length===0),'NON_LIFECYCLE_APPEND '+file);
 return{kind:'lifecycle-append',originalSHA256:expected,originalBytes:originalEnd,currentBytes:bytes.length,appendedEventTypes:events.map(r=>r.type)};
}
