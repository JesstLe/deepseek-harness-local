import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';

export const PROFILE_FIELDS=['communicationStyle','workStyle','personality','persona'];
export const profileFields=z.object(Object.fromEntries(PROFILE_FIELDS.map(k=>[k,z.string().trim().max(2000).optional()]))).strict();
export const profilePatch=profileFields.extend({autoLearning:z.boolean().optional(),lockedFields:z.array(z.enum(PROFILE_FIELDS)).max(4).refine(a=>new Set(a).size===a.length).optional()}).strict();
export const memoryKinds=['fact','preference','experience','procedure','relationship'];
const sourceSchema=z.object({kind:z.enum(['owner','user','proposal']),sessionId:z.string().max(200).optional(),messageId:z.string().max(200).optional(),quote:z.string().max(4000).optional(),note:z.string().max(500).optional()}).strict();
const stamp=z.string().datetime(),expected=z.number().int().nonnegative(),operation=z.string().min(1).max(200);
const memoryInput=z.object({kind:z.enum(memoryKinds),text:z.string().trim().min(1).max(4000),status:z.enum(['candidate','active']).default('active'),pinned:z.boolean().default(false),expiresAt:stamp.nullable().default(null)}).strict();
const memoryPatch=z.object({text:z.string().trim().min(1).max(4000).optional(),status:z.enum(['candidate','active','rejected','deleted']).optional(),pinned:z.boolean().optional(),expiresAt:stamp.nullable().optional()}).strict();
const fail=code=>{throw Error(code);},clone=value=>structuredClone(value);
const serial=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const sensitive=/(?:\b(?:sk|rk)-[a-z0-9_-]{16,}|\bBearer\s+[a-z0-9._~-]{12,}|(?:api[_ -]?key|access[_ -]?token|密码|口令)\s*[:：=]\s*\S{6,})/iu;
export function assertPublicText(value){if(sensitive.test(value))fail('EMP_SECRET_PATTERN');}
function assertFields(patch){for(const value of Object.values(patch))if(typeof value==='string')assertPublicText(value);}

/** Local-only employee continuity. Entities, version history, audit and pending-sync event commit atomically. */
export class EmployeeStore{
  constructor(file,{clock=()=>new Date(),beforeCommit}={}){
    this.file=file;this.clock=clock;this.beforeCommit=beforeCommit;this.closed=false;
    if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true});
    try{
      this.db=new DatabaseSync(file);this.db.exec('PRAGMA busy_timeout=3000;');
      const version=this.db.prepare('PRAGMA user_version').get().user_version;
      if(version!==0&&version!==1)fail('EMP_SCHEMA_UNSUPPORTED');
      if(version===0&&this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length)fail('EMP_SCHEMA_UNSUPPORTED');
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS entities(bot_id TEXT NOT NULL,id TEXT NOT NULL,type TEXT NOT NULL,revision INTEGER NOT NULL,json TEXT NOT NULL,PRIMARY KEY(bot_id,id));
        CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,bot_id TEXT NOT NULL,entity_id TEXT NOT NULL,type TEXT NOT NULL,revision INTEGER NOT NULL,json TEXT NOT NULL,sync_state TEXT NOT NULL DEFAULT 'local_only');
        CREATE INDEX IF NOT EXISTS events_bot ON events(bot_id,seq);
        CREATE TABLE IF NOT EXISTS operations(bot_id TEXT NOT NULL,operation_id TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(bot_id,operation_id));
        PRAGMA user_version=1;COMMIT;`);
      if(this.db.prepare('PRAGMA quick_check').get().quick_check!=='ok')fail('EMP_STORAGE_CORRUPT');
    }catch(error){this.db?.close();throw Error(/^EMP_/.test(error.message)?error.message:'EMP_STORAGE_UNAVAILABLE',{cause:error});}
  }
  ready(){if(this.closed)fail('EMP_STORE_CLOSED');}
  now(){return this.clock().toISOString();}
  entity(botId,id){this.ready();const row=this.db.prepare('SELECT json FROM entities WHERE bot_id=? AND id=?').get(botId,id);return row?JSON.parse(row.json):null;}
  profile(botId){return this.entity(botId,'profile')??{id:'profile',botId,revision:0,communicationStyle:'',workStyle:'',personality:'',persona:'',autoLearning:true,lockedFields:[],updatedAt:null};}
  allMemories(botId){this.ready();return this.db.prepare("SELECT json FROM entities WHERE bot_id=? AND type='memory'").all(botId).map(row=>JSON.parse(row.json));}
  mutate(botId,operationId,action,payload,actor,fn){
    this.ready();operation.parse(operationId);actor=sourceSchema.parse(actor);if(actor.quote)assertPublicText(actor.quote);
    const digest=createHash('sha256').update(serial({action,payload,actor})).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const old=this.db.prepare('SELECT digest,result FROM operations WHERE bot_id=? AND operation_id=?').get(botId,operationId);
      if(old){if(old.digest!==digest)fail('EMP_IDEMPOTENCY_CONFLICT');this.db.exec('COMMIT');return JSON.parse(old.result);}
      if(this.db.prepare('SELECT count(*) AS n FROM operations WHERE bot_id=?').get(botId).n>=100000)fail('EMP_AUDIT_CAPACITY');
      const result=fn();this.beforeCommit?.();
      this.db.prepare('INSERT INTO operations VALUES(?,?,?,?)').run(botId,operationId,digest,JSON.stringify(result));
      this.db.exec('COMMIT');return clone(result);
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  put(value,type,action,actor){
    this.db.prepare('INSERT INTO entities VALUES(?,?,?,?,?) ON CONFLICT(bot_id,id) DO UPDATE SET revision=excluded.revision,json=excluded.json').run(value.botId,value.id,type,value.revision,JSON.stringify(value));
    const event={eventId:randomUUID(),domain:'local-owner',botId:value.botId,entityId:value.id,revision:value.revision,action,source:actor,occurredAt:this.now(),value};
    this.db.prepare('INSERT INTO events(event_id,bot_id,entity_id,type,revision,json) VALUES(?,?,?,?,?,?)').run(event.eventId,value.botId,value.id,type,value.revision,JSON.stringify(event));
    return value;
  }
  updateProfile(botId,{expectedRevision,patch,operationId},actor={kind:'owner'}){
    expected.parse(expectedRevision);patch=profilePatch.parse(patch);if(!Object.keys(patch).length)fail('EMP_EMPTY_PATCH');assertFields(patch);
    return this.mutate(botId,operationId,'profile_update',{expectedRevision,patch},actor,()=>this.applyProfile(botId,expectedRevision,patch,actor,'profile_update'));
  }
  applyProfile(botId,revision,patch,actor,action){
    const current=this.profile(botId);if(current.revision!==revision)fail('EMP_CONFLICT');
    for(const field of PROFILE_FIELDS)if(field in patch&&patch[field]!==current[field]&&current.lockedFields.includes(field))fail('EMP_FIELD_LOCKED');
    if(Object.entries(patch).every(([k,v])=>serial(current[k])===serial(v)))return current;
    return this.put({...current,...patch,revision:current.revision+1,updatedAt:this.now()},'profile',action,actor);
  }
  restoreProfile(botId,{expectedRevision,targetRevision,operationId},actor={kind:'owner'}){
    expected.parse(expectedRevision);z.number().int().positive().parse(targetRevision);
    return this.mutate(botId,operationId,'profile_restore',{expectedRevision,targetRevision},actor,()=>{
      const row=this.db.prepare("SELECT json FROM events WHERE bot_id=? AND entity_id='profile' AND type='profile' AND revision=?").get(botId,targetRevision);if(!row)fail('EMP_VERSION_NOT_FOUND');
      const value=JSON.parse(row.json).value,patch=Object.fromEntries([...PROFILE_FIELDS,'autoLearning','lockedFields'].map(k=>[k,value[k]]));
      return this.applyProfile(botId,expectedRevision,patch,actor,'profile_restore');
    });
  }
  createMemory(botId,{operationId,...input},actor={kind:'owner'},{proposedProfile}={}){
    input=memoryInput.parse(input);assertPublicText(input.text);if(proposedProfile){proposedProfile=profileFields.parse(proposedProfile);assertFields(proposedProfile);}
    return this.mutate(botId,operationId,'memory_create',{input,...(proposedProfile?{proposedProfile}:{})},actor,()=>{
      if(this.allMemories(botId).length>=5000)fail('EMP_MEMORY_CAPACITY');
      const time=this.now();return this.put({id:'memory-'+randomUUID(),botId,revision:1,...input,source:actor,...(proposedProfile?{proposedProfile}:{}),createdAt:time,updatedAt:time},'memory','memory_create',actor);
    });
  }
  updateMemory(botId,{memoryId,expectedRevision,patch,operationId,profileRevision},actor={kind:'owner'}){
    expected.parse(expectedRevision);patch=memoryPatch.parse(patch);if(!Object.keys(patch).length)fail('EMP_EMPTY_PATCH');if(patch.text)assertPublicText(patch.text);
    return this.mutate(botId,operationId,'memory_update',{memoryId,expectedRevision,patch,...(profileRevision===undefined?{}:{profileRevision})},actor,()=>{
      const value=this.entity(botId,memoryId);if(!value||!memoryId.startsWith('memory-'))fail('EMP_MEMORY_NOT_FOUND');if(value.revision!==expectedRevision)fail('EMP_CONFLICT');if(value.status==='deleted')fail('EMP_MEMORY_DELETED');
      if(value.proposedProfile&&patch.status==='active'){
        if(profileRevision===undefined)fail('EMP_PROFILE_REVISION_REQUIRED');this.applyProfile(botId,profileRevision,value.proposedProfile,actor,'profile_candidate_accepted');
      }
      if(Object.entries(patch).every(([k,v])=>serial(value[k])===serial(v)))return value;
      return this.put({...value,...patch,revision:value.revision+1,updatedAt:this.now()},'memory','memory_update',actor);
    });
  }
  learnExplicit(botId,messageId,text,sessionId){
    const p=this.profile(botId);if(!p.autoLearning)return {learned:false,reason:'learning_disabled'};
    if(text.length>1000||/[\r\n]/.test(text)||/(这一次|这次|本次|暂时|仅此|以下是|引用|他说|她说)/u.test(text))return {learned:false,reason:'not_explicit'};
    const custom=text.match(/^记住我的偏好[：:]\s*(.{1,500})[。！!]?$/u),style=text.match(/^以后回复[：:，,\s]*(先给结论|简洁直接|详细解释|少用术语)[。！!]?$/u);
    if(!custom&&!style)return {learned:false,reason:'not_explicit'};
    if(style&&p.lockedFields.includes('communicationStyle'))return {learned:false,reason:'field_locked'};
    assertPublicText(text);const actor={kind:'user',sessionId,messageId,quote:text},content=custom?custom[1]:style[1];
    return this.mutate(botId,'learn:'+messageId,'explicit_learning',{text,sessionId},actor,()=>{
      if(this.allMemories(botId).length>=5000)fail('EMP_MEMORY_CAPACITY');const time=this.now();
      const memory=this.put({id:'memory-'+randomUUID(),botId,revision:1,kind:'preference',text:content,status:'active',pinned:true,expiresAt:null,source:actor,createdAt:time,updatedAt:time},'memory','explicit_learning',actor);
      // Re-read under the transaction; the same instruction may coexist with unrelated edits.
      const profile=this.profile(botId);
      if(style&&!profile.lockedFields.includes('communicationStyle'))this.applyProfile(botId,profile.revision,{communicationStyle:content},actor,'explicit_learning');
      return {learned:true,memory,profile:this.profile(botId)};
    });
  }
  memories(botId,{query='',status='active',limit=20}={}){
    z.string().max(300).parse(query);z.enum(['active','candidate','rejected','deleted','all']).parse(status);z.number().int().min(1).max(100).parse(limit);
    const q=query.trim().toLocaleLowerCase(),tokens=q.split(/\s+/u).filter(Boolean),time=this.clock().getTime();
    return this.allMemories(botId).filter(m=>(status==='all'||m.status===status)&&(status!=='active'||!m.expiresAt||Date.parse(m.expiresAt)>time))
      .map(m=>({...m,_score:q?tokens.reduce((n,t)=>n+(m.text.toLocaleLowerCase().includes(t)?1:0),0):1})).filter(m=>m._score>0)
      .sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b._score-a._score||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)).slice(0,limit).map(({_score,...m})=>m);
  }
  history(botId,{after=0,limit=50}={}){
    this.ready();z.number().int().nonnegative().parse(after);z.number().int().min(1).max(100).parse(limit);
    return this.db.prepare('SELECT seq,json,sync_state FROM events WHERE bot_id=? AND seq>? ORDER BY seq ASC LIMIT ?').all(botId,after,limit).map(r=>({seq:r.seq,...JSON.parse(r.json),syncState:r.sync_state}));
  }
  export(botId){return {version:1,domain:'local-owner',syncState:'local_only',profile:this.profile(botId),memories:this.allMemories(botId),exportedAt:this.now()};}
  context(botId){const p=this.profile(botId),memories=this.memories(botId,{limit:8});
    const value={profile:Object.fromEntries(PROFILE_FIELDS.map(k=>[k,p[k].slice(0,900)])),memories:memories.map(m=>({id:m.id,kind:m.kind,text:m.text.slice(0,450)}))};
    while(JSON.stringify(value).length>7800){
      if(value.memories.length)value.memories.pop();
      else for(const key of PROFILE_FIELDS)value.profile[key]=value.profile[key].slice(0,Math.floor(value.profile[key].length/2));
    }
    return JSON.stringify(value);
  }
  stats(){this.ready();return {profiles:this.db.prepare("SELECT count(*) AS n FROM entities WHERE type='profile'").get().n,memories:this.db.prepare("SELECT count(*) AS n FROM entities WHERE type='memory'").get().n,events:this.db.prepare('SELECT count(*) AS n FROM events').get().n,syncState:'local_only'};}
  close(){if(this.closed)return;this.db.close();this.closed=true;}
}
