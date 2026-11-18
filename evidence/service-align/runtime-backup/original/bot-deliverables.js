import {verifyVersion,transferVersion} from './bot-file-versions.js';
import path from 'node:path';
import {z} from 'zod';

export const deliveryFiles=z.array(z.object({path:z.string().trim().min(1).max(4096),description:z.string().max(1000).optional()}).strict()).min(1).max(8);
export const fileReference=z.object({sessionId:z.string().min(1).max(200),seq:z.number().int().nonnegative(),index:z.number().int().nonnegative(),turn:z.number().int().positive(),path:z.string().min(1).max(4096),description:z.string().max(1000).optional(),snapshot:z.object({path:z.string().min(1).max(4096),originalPath:z.string().min(1).max(4096),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative(),createdAt:z.string().datetime()}).strict().optional(),version:z.string().optional(),bytes:z.number().nonnegative().optional()}).strict();
export const deliveryCheck=z.object({requirement:z.enum(['text','files']),status:z.enum(['not_required','ready','missing','unavailable']),files:z.array(fileReference).max(8)}).strict();
export const DELIVERY_PROMPT='File delivery is part of completing work, not a filename in backticks. For a requested standalone article, report, spreadsheet, image or other file: save and verify the final file, call present with its path and description in THIS employee Session, then link it in the final response. Do not present source edits or intermediate files just to populate cards. bot_task_reply(kind="result", files=[{path,description}]) also registers final files. For bot_dispatch set output="files" when the request requires separate files; output="text" is only for an inline answer. A completed model turn is not proof of a file delivery or business acceptance. File references in task results identify the original Session and event; do not fabricate attachment identities.';

export function previewAddress(ref){
  const encode=segment=>encodeURIComponent(segment).replace(/%3A/gi,':');
  return `dsh-resource://file/session/${encode(ref.sessionId)}/${(ref.snapshot?.path??ref.path).replaceAll('\\','/').split('/').map(encode).join('/')}`;
}

export function references(events,sessionId,turn){
  const files=new Map();
  for(const e of events)if(e.type==='deliverables/presented'&&e.data.turn===turn&&Number.isSafeInteger(e.seq)){
    for(const [index,f]of e.data.files.entries()){
      const ref=fileReference.safeParse({sessionId,seq:e.seq,index,turn,...f});
      if(ref.success)files.set(ref.data.path,ref.data);
    }
  }
  return [...files.values()].slice(-8);
}

/** Only final file references matching successful write/edit calls from this turn are eligible. */
export function announcedFiles(events,turn,text){
  const announced=new Set();
  for(const m of text.matchAll(/`([^`\n]+)`|\[[^\]\n]+\]\(<?([^\n)]+?)>?\)/g))announced.add((m[1]??m[2]).replace(/#L\d+(?:-L\d+)?$/,''));
  const normalize=p=>p.replaceAll('\\','/').toLocaleLowerCase();
  const files=new Map();
  for(const e of events){
    if(e.type!=='tool/call'||e.data.turn!==turn||!['write','edit'].includes(e.data.name))continue;
    const result=events.find(r=>r.type==='tool/result'&&r.data.message?.toolCallId===e.data.callId);
    if(!result||result.data.message.isError)continue;
    let args=e.data.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{continue;}
    const p=args?.file_path??args?.path;if(typeof p!=='string')continue;
    for(const a of announced){const n=normalize(a),written=normalize(p);if(n===written||!path.isAbsolute(a)&&written.endsWith('/'+n))files.set(p,{path:p});}
  }
  return [...files.values()].slice(0,8);
}

/** Use the same composed filesystem and scope as native preview; never Node raw file access. */
export async function validateFiles(ctx,session,files,signal){
  const parsed=deliveryFiles.parse(files),out=new Map();
  if(!session.header.cwd)throw Error('BOT_DELIVERY_WORKSPACE_REQUIRED');
  for(const file of parsed){
    signal.throwIfAborted();
    const stat=await ctx.workspaceFiles.stat({sessionId:session.id,workspaceRoot:session.header.cwd},file.path,signal);
    // Automatic registration/relay is confined to this Session's actual workspace.
    const relative=path.relative(path.resolve(session.header.cwd),path.resolve(stat.absolutePath));
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('BOT_DELIVERY_OUTSIDE_WORKSPACE');
    out.set(stat.absolutePath,{path:stat.absolutePath,...(file.description?{description:file.description}:{}),version:stat.version,...(stat.bytes!==undefined?{bytes:stat.bytes}:{})});
  }
  return [...out.values()];
}

export async function verifyHandoffFiles(ctx,snapshot,targetSessionId,refs,signal){
  const target=await snapshot(targetSessionId);
  if(!target)throw Error('BOT_HANDOFF_SESSION_MISSING');
  const sources=new Map(),transferred=[];
  for(const ref of refs){
    if(!sources.has(ref.sessionId))sources.set(ref.sessionId,await snapshot(ref.sessionId));
    const source=sources.get(ref.sessionId);
    const event=source?.events.find(e=>e.type==='deliverables/presented'&&e.seq===ref.seq&&e.data.turn===ref.turn);
    const original=event?.data.files[ref.index];
    if(!original||original.path!==ref.path)throw Error('BOT_HANDOFF_FILE_REFERENCE');
    if(ref.snapshot){transferred.push(await transferVersion(ctx,{id:ref.sessionId,header:source.header},{id:targetSessionId,header:target.header},ref,signal));continue;}
    const [previous]=await validateFiles(ctx,{id:ref.sessionId,header:source.header},[original],signal).catch(()=>{throw Error('BOT_HANDOFF_FILE_UNAVAILABLE');});
    if(ref.version===undefined||previous.version!==ref.version)throw Error('BOT_HANDOFF_FILE_STALE');
    const [current]=await validateFiles(ctx,{id:targetSessionId,header:target.header},[original],signal).catch(()=>{throw Error('BOT_HANDOFF_FILE_SCOPE');});
    if(path.relative(previous.path,current.path)||current.version!==previous.version)throw Error('BOT_HANDOFF_FILE_SCOPE');
  }
  return transferred;
}

export function registerFiles(session,turn,files,callId){
  const existing=session.snapshotEvents().find(e=>e.type==='deliverables/presented'&&e.data.callId===callId);
  if(existing){
    if(JSON.stringify(existing.data.files)!==JSON.stringify(files.map(({path,description})=>({path,...(description?{description}:{})}))))throw Error('BOT_DELIVERY_IDEMPOTENCY_CONFLICT');
    return existing;
  }
  return session.append('deliverables/presented',{turn,callId,files:files.map(({path,description})=>({path,...(description?{description}:{})}))});
}
