import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {assertPublicText,memoryKinds,profileFields} from './employee-store.js';

const ref=z.object({id:z.string().min(1).max(200),revision:z.number().int().positive()}).strict();
const source=z.object({kind:z.string().max(50),sessionId:z.string().max(200).optional(),messageId:z.string().max(200).optional(),quote:z.string().max(4000).optional(),note:z.string().max(500).optional()}).strict();
const record=z.object({kind:z.enum(memoryKinds),text:z.string().trim().min(1).max(4000),pinned:z.boolean().default(false),expiresAt:z.string().datetime().nullable().default(null),source:source.optional(),proposedProfile:profileFields.optional()}).strict();
const imported=z.array(record).min(1).max(100);
const serialize=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hash=value=>createHash('sha256').update(serialize(value)).digest('hex');
const fail=code=>{throw Error(code);};
const normalize=s=>s.trim().replaceAll('\r\n','\n');
const mergeKey=m=>hash({kind:m.kind,text:normalize(m.text),status:m.status,expiresAt:m.expiresAt,proposedProfile:m.proposedProfile??null});

/** Deterministic owner-confirmed maintenance. No LLM, filesystem crawl or semantic fact inference. */
export class EmployeeMemoryMaintenance {
  constructor(store){this.store=store;}
  preview(botId){
    const all=this.store.allMemories(botId).filter(m=>m.status!=='deleted'),groups=new Map();
    for(const m of all){const key=mergeKey(m),group=groups.get(key)??[];group.push(m);groups.set(key,group);}
    return {version:1,botId,duplicates:[...groups.values()].filter(g=>g.length>1).map(g=>({keepId:g[0].id,kind:g[0].kind,text:g[0].text,refs:g.map(m=>({id:m.id,revision:m.revision})),sources:g.map(m=>m.source)})),
      expired:all.filter(m=>m.expiresAt&&Date.parse(m.expiresAt)<=this.store.clock().getTime()).map(m=>({id:m.id,revision:m.revision,kind:m.kind,text:m.text,expiresAt:m.expiresAt})),
      counts:{live:all.length,tombstones:this.store.allMemories(botId).length-all.length},sampledAt:this.store.now()};
  }
  previewImport(botId,input){
    const records=imported.parse(input);for(const r of records)assertPublicText(serialize(r));
    const existing=this.store.allMemories(botId).filter(m=>m.status!=='deleted'),seen=new Set(existing.map(m=>hash({kind:m.kind,text:normalize(m.text)}))),selected=[],duplicates=[];
    for(const r of records){const key=hash({kind:r.kind,text:normalize(r.text)});if(seen.has(key))duplicates.push({kind:r.kind,text:r.text});else{seen.add(key);selected.push(r);}}
    return {version:1,inputCount:records.length,candidateCount:selected.length,duplicateCount:duplicates.length,input:records,records:selected,duplicates,digest:hash(records)};
  }
  refs(botId,input){const values=z.array(ref).min(1).max(100).parse(input);if(new Set(values.map(v=>v.id)).size!==values.length)fail('EMP_DUPLICATE_REFERENCE');
    return values.map(r=>{const m=this.store.entity(botId,r.id);if(!m||!r.id.startsWith('memory-'))fail('EMP_MEMORY_NOT_FOUND');if(m.revision!==r.revision)fail('EMP_CONFLICT');if(m.status==='deleted')fail('EMP_MEMORY_DELETED');return m;});
  }
  merge(botId,{keepId,refs,operationId}){
    return this.store.mutate(botId,operationId,'memory_merge',{keepId,refs},{kind:'owner',note:'Confirmed exact duplicate merge'},()=>{
      const records=this.refs(botId,refs);if(records.length<2||!records.some(m=>m.id===keepId))fail('EMP_MERGE_INVALID');
      if(new Set(records.map(mergeKey)).size!==1)fail('EMP_MERGE_DIFFERENT_FACTS');
      const keep=records.find(m=>m.id===keepId),others=records.filter(m=>m.id!==keepId);
      const mergedFrom=[...(keep.mergedFrom??[]),...others.flatMap(m=>[{id:m.id,revision:m.revision,source:m.source,...(m.importSource?{importSource:m.importSource}:{})},...(m.mergedFrom??[])])];
      if(mergedFrom.length>100)fail('EMP_MERGE_SOURCE_CAPACITY');
      const value=this.store.put({...keep,pinned:records.some(m=>m.pinned),mergedFrom,revision:keep.revision+1,updatedAt:this.store.now()},'memory','memory_merge',{kind:'owner',note:'Confirmed exact duplicate merge'});
      for(const m of others)this.store.put({...m,status:'deleted',mergedInto:keepId,revision:m.revision+1,updatedAt:this.store.now()},'memory','memory_merged_tombstone',{kind:'owner',note:'Confirmed exact duplicate merge'});
      return {kept:value,removed:others.map(m=>m.id)};
    });
  }
  expire(botId,{refs,operationId}){
    return this.store.mutate(botId,operationId,'memory_expire',{refs},{kind:'owner',note:'Confirmed expired memory cleanup'},()=>{
      const records=this.refs(botId,refs);if(records.some(m=>!m.expiresAt||Date.parse(m.expiresAt)>this.store.clock().getTime()))fail('EMP_MEMORY_NOT_EXPIRED');
      return {deleted:records.map(m=>this.store.put({...m,status:'deleted',revision:m.revision+1,updatedAt:this.store.now()},'memory','memory_expire',{kind:'owner',note:'Confirmed expired memory cleanup'}).id)};
    });
  }
  import(botId,{records,digest,operationId}){
    const parsed=imported.parse(records);if(hash(parsed)!==digest)fail('EMP_IMPORT_PREVIEW_MISMATCH');
    return this.store.mutate(botId,operationId,'memory_import',{records:parsed,digest},{kind:'owner',note:'Confirmed manual memory import'},()=>{
      const preview=this.previewImport(botId,parsed);
      if(this.store.allMemories(botId).length+preview.records.length>5000)fail('EMP_MEMORY_CAPACITY');
      const values=preview.records.map(({source:originalSource,...r})=>this.store.put({id:'memory-'+randomUUID(),botId,revision:1,...r,status:'candidate',source:{kind:'owner',note:'Manual import; source unverified'},...(originalSource?{importSource:originalSource}:{}),createdAt:this.store.now(),updatedAt:this.store.now()},'memory','memory_import',{kind:'owner',note:'Confirmed manual memory import'}));
      return {imported:values.length,skipped:preview.duplicateCount,memories:values};
    });
  }
}

export const maintenanceCommands=z.discriminatedUnion('action',[
  z.object({action:z.literal('memory_merge'),keepId:z.string().min(1).max(200),refs:z.array(ref).min(2).max(100)}).strict(),
  z.object({action:z.literal('memory_expire'),refs:z.array(ref).min(1).max(100)}).strict(),
  z.object({action:z.literal('memory_import_preview'),records:imported}).strict(),
  z.object({action:z.literal('memory_import'),records:imported,digest:z.string().length(64)}).strict(),
]);
