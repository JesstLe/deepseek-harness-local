import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function importError(code,status=400){throw Object.assign(Error('IMPORT_'+code),{status});}
const inside=(root,file)=>{const r=path.relative(root,file);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
export function defaultImportRoots(){const codex=process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),claude=process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude');return [{provider:'codex',path:path.join(codex,'sessions')},{provider:'codex',path:path.join(codex,'archived_sessions')},{provider:'claude',path:path.join(claude,'projects')}];}
/** Discovery reads bounded metadata only. IDs resolve exclusively to regular JSONL files under known roots. */
export class ImportSources{
 constructor(roots=defaultImportRoots()){this.roots=roots;this.files=new Map();}
 async scan(){const files=[],warnings=[];let visited=0;
  for(const spec of this.roots){let root;try{root=await fs.realpath(spec.path);}catch(e){if(e.code!=='ENOENT')warnings.push({provider:spec.provider,code:'ROOT_UNREADABLE'});continue;}
   const walk=async(dir,depth)=>{if(depth>5)return;let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{warnings.push({provider:spec.provider,code:'DIRECTORY_UNREADABLE'});return;}
    for(const e of entries){if(++visited>30000){warnings.push({code:'DISCOVERY_LIMIT'});return;}if(e.isSymbolicLink())continue;const file=path.join(dir,e.name);if(e.isDirectory()){if(!['subagents','node_modules','.git'].includes(e.name))await walk(file,depth+1);continue;}if(!e.isFile()||!e.name.endsWith('.jsonl'))continue;
     const real=await fs.realpath(file);if(!inside(root,real))continue;const stat=await fs.stat(real),id=digest(spec.provider+'\0'+real),row={id,provider:spec.provider,root,file:real,sizeBytes:stat.size,modifiedAt:stat.mtime.toISOString()};files.push(row);
    }};await walk(root,0);
  }
  files.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));this.files=new Map(files.map(f=>[f.id,f]));return{items:files,warnings};
 }
 async resolve(id){if(!/^[a-f0-9]{64}$/.test(id??''))importError('SOURCE_NOT_FOUND',404);if(!this.files.has(id))await this.scan();const row=this.files.get(id);if(!row)importError('SOURCE_NOT_FOUND',404);const real=await fs.realpath(row.file).catch(()=>null);if(!real||!inside(row.root,real)||real!==row.file||(await fs.lstat(row.file)).isSymbolicLink())importError('SOURCE_CHANGED',409);return row;}
 async metadata(row){let handle;try{handle=await fs.open(row.file,'r');const buffer=Buffer.alloc(Math.min(row.sizeBytes,2*1024*1024)),{bytesRead}=await handle.read(buffer,0,buffer.length,0);let title='',sourceSessionId='',cwd='';for(const l of buffer.subarray(0,bytesRead).toString('utf8').split('\n')){let o;try{o=JSON.parse(l);}catch{continue;}if(row.provider==='codex'&&o.type==='session_meta'){sourceSessionId=o.payload?.id??o.payload?.session_id??'';cwd=o.payload?.cwd??'';}else if(row.provider==='claude'){sourceSessionId||=o.sessionId??'';cwd||=o.cwd??'';}
    const m=row.provider==='codex'&&o.type==='response_item'?o.payload:row.provider==='claude'&&o.type==='user'?o.message:null;if(!title&&m?.role==='user'){title=typeof m.content==='string'?m.content:m.content?.filter(b=>['text','input_text'].includes(b.type)).map(b=>b.text).join(' ');title=String(title??'').replace(/\s+/g,' ').trim().slice(0,72);if(title)break;}}
   return {id:row.id,provider:row.provider,sizeBytes:row.sizeBytes,modifiedAt:row.modifiedAt,title:title||path.basename(row.file,'.jsonl').slice(0,72),sourceSessionId,cwd};
  }catch{return{id:row.id,provider:row.provider,sizeBytes:row.sizeBytes,modifiedAt:row.modifiedAt,title:'读取失败',unreadable:true};}finally{await handle?.close();}}
}
/** Only transcript fields enter normalized history; config, request blobs and encrypted reasoning never do. */
function blocks(content,stats){if(typeof content==='string')return[{kind:'text',text:content}];const out=[];
 for(const b of Array.isArray(content)?content:[]){if(!b||typeof b!=='object'){stats.unsupported++;continue;}
  if(['text','input_text','output_text'].includes(b.type)&&typeof b.text==='string')out.push({kind:'text',text:b.text});
  else if(b.type==='tool_use')out.push({kind:'tool-call',id:String(b.id??''),name:String(b.name??''),text:typeof b.input==='string'?b.input:JSON.stringify(b.input??{})});
  else if(b.type==='tool_result'){const inner=blocks(b.content,stats);out.push({kind:'tool-result',id:String(b.tool_use_id??''),isError:b.is_error===true,text:inner.map(x=>x.text??'['+x.kind+']').join('\n')});}
  else if(['thinking','redacted_thinking','reasoning'].includes(b.type))stats.reasoning++;
  else{stats.attachments++;out.push({kind:'attachment',mediaType:String(b.type??'unknown'),text:'[历史附件：'+String(b.type??'unknown')+'，未读取本地文件或远端资源]'});}
 }return out;}
export async function readImportSnapshot(row,{maxBytes=512*1024*1024,maxHistoryBytes=64*1024*1024}={}){
 const handle=await fs.open(row.file,'r');let snapshotBytes=0,tail=Buffer.alloc(0),lineNumber=0,completeBytes=0,historyBytes=0;const hash=createHash('sha256'),records=[],nodes=new Map(),stats={metadata:0,reasoning:0,attachments:0,unsupported:0,offBranch:0},meta={sourceSessionId:'',cwd:'',startedAt:''};let leaf=null;
 const add=(o,role,content,id)=>{const b=blocks(content,stats);if(!b.length)return;const item={sourceId:String(id??'line-'+lineNumber),line:lineNumber,time:String(o.timestamp??''),role,blocks:b};historyBytes+=Buffer.byteLength(JSON.stringify(item));if(historyBytes>maxHistoryBytes)importError('HISTORY_TOO_LARGE',413);records.push(item);};
 const parse=line=>{lineNumber++;let o;try{o=JSON.parse(line.toString('utf8'));}catch{importError('INVALID_JSON_LINE_'+lineNumber);}if(!o||typeof o!=='object')importError('INVALID_RECORD');
  if(row.provider==='codex'){const p=o.payload;if(o.type==='session_meta'){meta.sourceSessionId=String(p?.id??p?.session_id??'');meta.cwd=String(p?.cwd??'');meta.startedAt=String(o.timestamp??'');return;}
   if(o.type==='response_item'&&p){if(p.type==='message'&&['user','assistant'].includes(p.role))add(o,p.role,p.content,p.id);
    else if(['function_call','custom_tool_call'].includes(p.type))add(o,'assistant',[{type:'tool_use',id:p.call_id,name:p.name,input:p.arguments??p.input??''}],p.id??p.call_id);
    else if(['function_call_output','custom_tool_call_output'].includes(p.type))add(o,'assistant',[{type:'tool_result',tool_use_id:p.call_id,content:typeof p.output==='string'?p.output:JSON.stringify(p.output??'')}],p.id??p.call_id);
    else if(p.type==='reasoning')stats.reasoning++;else if(p.type==='message'&&['system','developer'].includes(p.role))stats.metadata++;else stats.unsupported++;
   }else if(o.type==='compacted'&&typeof p?.message==='string')add(o,'assistant','[来源压缩摘要]\n'+p.message,'compacted-'+lineNumber);else stats.metadata++;
  }else{
   meta.sourceSessionId||=String(o.sessionId??'');meta.cwd||=String(o.cwd??'');meta.startedAt||=String(o.timestamp??'');
   if(o.uuid&&!o.isSidechain){if(nodes.has(o.uuid))importError('DUPLICATE_SOURCE_ID');nodes.set(o.uuid,{parent:o.parentUuid??null,line:lineNumber});if(['user','assistant'].includes(o.type))leaf=o.uuid;}
   if(o.isSidechain){stats.offBranch++;return;}if(['user','assistant'].includes(o.type)&&o.message){if(!['user','assistant'].includes(o.message.role??o.type))importError('INVALID_ROLE');add(o,o.message.role??o.type,o.message.content,o.uuid);}
   else stats.metadata++;
  }};
 try{const before=await handle.stat();if(!before.isFile())importError('NOT_REGULAR_FILE');snapshotBytes=before.size;if(snapshotBytes>maxBytes)importError('SOURCE_TOO_LARGE',413);let offset=0;
  while(offset<snapshotBytes){const b=Buffer.alloc(Math.min(256*1024,snapshotBytes-offset)),{bytesRead}=await handle.read(b,0,b.length,offset);if(!bytesRead)importError('SOURCE_CHANGED',409);offset+=bytesRead;hash.update(b.subarray(0,bytesRead));tail=Buffer.concat([tail,b.subarray(0,bytesRead)]);let start=0,end;
   while((end=tail.indexOf(10,start))>=0){const line=tail.subarray(start,end);completeBytes+=end-start+1;if(line.toString('utf8').trim())parse(line);start=end+1;}tail=tail.subarray(start);if(tail.length>16*1024*1024)importError('LINE_TOO_LARGE',413);
  }
  if(tail.length){let complete=false;try{JSON.parse(tail.toString('utf8'));complete=true;}catch{}if(complete){parse(tail);completeBytes+=tail.length;tail=Buffer.alloc(0);}}
  const after=await handle.stat();if(after.size<snapshotBytes||after.ino!==before.ino)importError('SOURCE_CHANGED',409);
 }finally{await handle.close();}
 let messages=records;
 if(row.provider==='claude'&&leaf){const chain=new Set(),seen=new Set();let current=leaf;while(current&&nodes.has(current)){if(seen.has(current))importError('SOURCE_BRANCH_CYCLE');seen.add(current);const n=nodes.get(current);chain.add(n.line);current=n.parent;}
  messages=records.filter(r=>chain.has(r.line));stats.offBranch+=records.length-messages.length;
 }
 if(!meta.sourceSessionId)importError('SOURCE_ID_MISSING');if(!messages.length)importError('NO_MESSAGES');const title=(messages.find(m=>m.role==='user')?.blocks.filter(b=>b.kind==='text').map(b=>b.text).join(' ')||'导入会话').replace(/\s+/g,' ').trim().slice(0,72);
 return{version:1,provider:row.provider,sourceId:row.id,...meta,title,fingerprint:hash.digest('hex'),snapshotBytes,completeBytes,incompleteTailBytes:tail.length,stats,messages};
}
