import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID,sign,verify,createPublicKey} from 'node:crypto';
import {EmployeeDeviceVault} from './employee-device-vault.js';
import {assertPublicText,PROFILE_FIELDS} from './employee-store.js';

const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const fail=code=>{throw Error(code);};
const payload=(value,kind)=>Object.fromEntries((kind==='profile'?[...PROFILE_FIELDS,'autoLearning','lockedFields']:['kind','text','status','pinned','expiresAt','proposedProfile','mergedFrom','mergedInto','importSource']).map(k=>[k,value[k]]));
const keyHash=pem=>createHash('sha256').update(createPublicKey(pem).export({type:'spki',format:'der'})).digest('hex');
export function verifyEmployeeAuthorization(packet,{publicKey,kid,issuer,deviceId,tenantId,key,now=Date.now(),highWater=0}={}){
  if(!packet||packet.kid!==kid||typeof packet.payload!=='string'||packet.payload.length>1000000)fail('EMP_AUTH_SIGNATURE_INVALID');
  try{if(!verify(null,Buffer.from(packet.payload),publicKey,Buffer.from(packet.signature,'base64url')))fail('EMP_AUTH_SIGNATURE_INVALID');}catch{fail('EMP_AUTH_SIGNATURE_INVALID');}
  let c;try{c=JSON.parse(Buffer.from(packet.payload,'base64url').toString('utf8'));}catch{fail('EMP_AUTH_INVALID');}
  if(c.v!==1||c.aud!=='naumi-desktop'||c.iss!==issuer||c.tenantId!==tenantId||c.deviceId!==deviceId||c.keyHash!==keyHash(key))fail('EMP_AUTH_BINDING_INVALID');
  if(!Array.isArray(c.bindings)||!Array.isArray(c.projectIds)||!Array.isArray(c.capabilities)||!Number.isInteger(c.authEpoch)||c.authEpoch<1)fail('EMP_AUTH_INVALID');
  const issued=Date.parse(c.issuedAt),expires=Date.parse(c.expiresAt);
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||expires<=issued||expires-issued>86400000||now<issued-300000)fail('EMP_AUTH_INVALID');
  if(now<highWater-60000)fail('EMP_AUTH_CLOCK_ROLLBACK');
  if(now>=expires)fail('EMP_AUTH_EXPIRED');return c;
}

export class EmployeeSync {
  constructor({file,store,directory,origin,vault,fetch:request=globalThis.fetch,sessionRequest,clock=()=>Date.now()}){
    this.store=store;this.directory=directory;this.origin=new URL(origin).origin;this.request=request;this.sessionRequest=sessionRequest;this.clock=clock;
    const u=new URL(origin);if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))fail('EMP_SYNC_ORIGIN_INVALID');
    fs.mkdirSync(path.dirname(file),{recursive:true});this.vault=vault??new EmployeeDeviceVault(file+'.device');this.db=new DatabaseSync(file);
    if(![0,1].includes(this.db.prepare('PRAGMA user_version').get().user_version)){this.db.close();fail('EMP_SYNC_SCHEMA_UNSUPPORTED');}
    this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(bot_id TEXT,aggregate_id TEXT,remote_revision INTEGER NOT NULL,local_revision INTEGER NOT NULL,payload_hash TEXT NOT NULL,PRIMARY KEY(bot_id,aggregate_id));
      CREATE TABLE IF NOT EXISTS outbox(event_id TEXT PRIMARY KEY,bot_id TEXT,aggregate_id TEXT,local_revision INTEGER NOT NULL,status TEXT NOT NULL,encrypted TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_pending ON outbox(bot_id,aggregate_id) WHERE status='pending';
      CREATE TABLE IF NOT EXISTS conflicts(id TEXT PRIMARY KEY,bot_id TEXT,aggregate_id TEXT,encrypted TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS shared_cache(id TEXT PRIMARY KEY,scope TEXT NOT NULL,project_id TEXT,encrypted TEXT NOT NULL);
      PRAGMA user_version=1;
    `);
    this.deviceId=this.get('deviceId')??randomUUID();this.set('deviceId',this.deviceId);this.lastError=null;this.closed=false;
  }
  get(k){const r=this.db.prepare('SELECT value FROM config WHERE key=?').get(k);return r?JSON.parse(r.value):null;}
  set(k,v){this.db.prepare('INSERT INTO config VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,JSON.stringify(v));}
  registration(){return this.get('registration');}
  status(){const r=this.registration();let claims=null,error=this.lastError;
    if(r)try{claims=this.offlineClaims();}catch(e){error=e.message;}
    const dirty=claims?.bindings.some(b=>[this.store.profile(b.localBotId),...this.store.allMemories(b.localBotId)].some(v=>{const cp=this.checkpoint(b.localBotId,v.id);return v.revision>0&&cp?.local_revision!==v.revision&&cp?.payload_hash!==hash(payload(v,v.id==='profile'?'profile':'memory'));}));
    return {version:1,deviceId:this.deviceId,registered:!!r,origin:this.origin,tenantId:r?.tenantId??null,memberId:r?.memberId??null,enabled:!!this.get('enabled'),syncState:!r?'local_only':!this.get('enabled')?'paused':error?'attention':this.db.prepare('SELECT count(*) AS n FROM conflicts').get().n?'conflict':this.db.prepare("SELECT count(*) AS n FROM outbox WHERE status='pending'").get().n||dirty?'pending':this.get('lastSyncedAt')?'synced':'pending',
      bindings:claims?.bindings??[],authorization:claims?{expiresAt:claims.expiresAt,capabilities:claims.capabilities}:null,lastSyncedAt:this.get('lastSyncedAt'),error,
      pending:this.db.prepare("SELECT count(*) AS n FROM outbox WHERE status='pending'").get().n,
      conflicts:this.db.prepare('SELECT * FROM conflicts').all().map(x=>({id:x.id,botId:x.bot_id,aggregateId:x.aggregate_id,...this.vault.unseal(x.encrypted)}))};
  }
  offlineClaims(){
    const r=this.registration();if(!r)fail('EMP_DEVICE_NOT_REGISTERED');if(this.get('revoked'))fail('EMP_DEVICE_REVOKED');
    const now=this.clock(),highWater=this.get('highWater')??0;
    const claims=verifyEmployeeAuthorization(this.get('authorization'),{publicKey:r.serverPublicKey,kid:r.keyId,issuer:this.origin,deviceId:this.deviceId,tenantId:r.tenantId,key:this.vault.open().publicKey,now,highWater});
    if(claims.authEpoch<(this.get('authEpoch')??0))fail('EMP_AUTH_EPOCH_ROLLBACK');
    this.set('highWater',Math.max(now,highWater));return claims;
  }
  async manager(action,cookie){
    const result=await this.http('/api/digital-employees',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(action)},true);
    return result.result;
  }
  async http(endpoint,options={},session=false){
    const request=session&&this.sessionRequest?this.sessionRequest:this.request;
    const r=await request(this.origin+endpoint,{...options,redirect:'error',signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(15000)])});
    if(r.status===404&&endpoint==='/api/digital-employees'){await r.body?.cancel();const error=Error('EMP_SERVICE_NOT_DEPLOYED');error.status=503;throw error;}
    const text=await r.text();if(text.length>8*1024*1024)fail('EMP_SYNC_RESPONSE_TOO_LARGE');let value;try{value=JSON.parse(text);}catch{fail('EMP_SYNC_RESPONSE_INVALID');}
    if(!r.ok){const code=session&&r.status===401?'COLLABORATION_LOGIN_REQUIRED':value.code??'EMP_SYNC_UNAVAILABLE';if(['DEVICE_REVOKED','MEMBER_INACTIVE','TENANT_INACTIVE','ACCESS_PENDING','DEVICE_REENROLLMENT_REQUIRED'].includes(code)){this.set('revoked',true);this.db.exec('DELETE FROM shared_cache');}const error=Error(code);error.status=r.status;throw error;}
    return value;
  }
  async enroll(cookie,name){
    if(this.registration())fail('EMP_DEVICE_ALREADY_REGISTERED');
    const keys=this.vault.open(),operationId=this.get('enrollmentOperation')??randomUUID();this.set('enrollmentOperation',operationId);
    const proof=sign(null,Buffer.from(canonical({v:1,aud:'naumi-enrollment',deviceId:this.deviceId,publicKey:keys.publicKey,operationId})),keys.privateKey).toString('base64url');
    const r=await this.manager({action:'device.register',operationId,deviceId:this.deviceId,name,publicKey:keys.publicKey,proof},cookie);
    // Trusted configured TLS/loopback enrollment only; pin server key and issuer once.
    const claims=verifyEmployeeAuthorization(r.authorization,{publicKey:r.serverPublicKey,kid:r.keyId,issuer:this.origin,deviceId:this.deviceId,tenantId:r.tenantId,key:keys.publicKey,now:this.clock()});
    this.set('registration',{tenantId:r.tenantId,memberId:r.memberId,keyId:r.keyId,serverPublicKey:r.serverPublicKey});this.accept(r,claims);return this.status();
  }
  accept(response,alreadyVerified){
    const r=this.registration(),claims=alreadyVerified??verifyEmployeeAuthorization(response.authorization,{publicKey:r.serverPublicKey,kid:r.keyId,issuer:this.origin,deviceId:this.deviceId,tenantId:r.tenantId,key:this.vault.open().publicKey,now:this.clock(),highWater:this.get('highWater')??0});
    if(claims.authEpoch<(this.get('authEpoch')??0))fail('EMP_AUTH_EPOCH_ROLLBACK');
    this.set('authorization',response.authorization);this.set('authEpoch',claims.authEpoch);this.set('revoked',false);this.set('highWater',Math.max(this.clock(),this.get('highWater')??0));
    // Do not retain resource caches after project/employee access disappears.
    const projects=new Set(claims.projectIds),bots=new Set(claims.bindings.map(b=>b.localBotId));
    for(const row of this.db.prepare('SELECT id,scope,project_id FROM shared_cache').all())if(row.scope==='project'&&!projects.has(row.project_id))this.db.prepare('DELETE FROM shared_cache WHERE id=?').run(row.id);
    for(const row of this.db.prepare('SELECT id,bot_id FROM conflicts').all())if(!bots.has(row.bot_id))this.db.prepare('DELETE FROM conflicts WHERE id=?').run(row.id);
    return claims;
  }
  async device(body,{signal}={}){
    const r=this.registration();if(!r)fail('EMP_DEVICE_NOT_REGISTERED');
    const p={v:1,aud:'naumi-device-api',tenantId:r.tenantId,deviceId:this.deviceId,nonce:randomUUID(),issuedAt:new Date(this.clock()).toISOString(),body};
    const signature=sign(null,Buffer.from(canonical(p)),this.vault.open().privateKey).toString('base64url');
    const response=await this.http('/api/digital-employees/device',{method:'POST',headers:{'Content-Type':'application/json','x-naumi-device-signature':signature},body:canonical(p),signal});
    this.accept(response);return response;
  }
  async catalog(cookie){return this.http('/api/digital-employees',{headers:{cookie}},true);}
  async bind(botId,employeeId,cookie){this.bot(botId);const r=await this.manager({action:'device.bind',operationId:randomUUID(),deviceId:this.deviceId,employeeId,localBotId:botId},cookie);this.accept(r);return this.status();}
  localBot(id){return this.directory.list().bots.find(b=>b.id===id);}
  bot(id){const b=this.localBot(id);if(!b||b.status!=='active')fail('EMP_BOT_NOT_FOUND');return b;}
  checkpoint(botId,id){return this.db.prepare('SELECT * FROM revisions WHERE bot_id=? AND aggregate_id=?').get(botId,id);}
  mark(botId,id,remote,local,value){this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?) ON CONFLICT(bot_id,aggregate_id) DO UPDATE SET remote_revision=excluded.remote_revision,local_revision=excluded.local_revision,payload_hash=excluded.payload_hash').run(botId,id,remote,local,hash(value));}
  conflict(botId,id,detail){const key=botId+'/'+id;this.db.prepare('INSERT INTO conflicts VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted=excluded.encrypted').run(key,botId,id,this.vault.seal(detail));}
  queue(claims){
    for(const binding of claims.bindings){const botId=binding.localBotId;if(!this.localBot(botId)||this.localBot(botId).status!=='active')continue;
      for(const value of [this.store.profile(botId),...this.store.allMemories(botId)]){
        if(value.revision===0)continue;const kind=value.id==='profile'?'profile':'memory',p=payload(value,kind),checkpoint=this.checkpoint(botId,value.id);
        if(checkpoint?.local_revision===value.revision||this.db.prepare('SELECT 1 FROM conflicts WHERE bot_id=? AND aggregate_id=?').get(botId,value.id)||this.db.prepare("SELECT 1 FROM outbox WHERE bot_id=? AND aggregate_id=? AND status='pending'").get(botId,value.id))continue;
        const event={eventId:randomUUID(),employeeId:binding.employeeId,aggregateId:value.id,kind,baseRevision:checkpoint?.remote_revision??0,payload:p,deleted:p.status==='deleted',source:value.source??{kind:'owner',note:'Explicitly enabled private synchronization'},occurredAt:new Date(this.clock()).toISOString()};
        assertPublicText(JSON.stringify(event.payload));this.db.prepare('INSERT INTO outbox VALUES(?,?,?,?,?,?)').run(event.eventId,botId,value.id,value.revision,'pending',this.vault.seal(event));
      }
    }
  }
  importRecord(binding,remote){
    const botId=binding.localBotId,id=remote.aggregate_id??remote.aggregateId,kind=remote.kind,revision=remote.revision,p=remote.payload;
    if(!this.localBot(botId))return;
    const current=id==='profile'?this.store.profile(botId):this.store.entity(botId,id),cp=this.checkpoint(botId,id);
    if(cp&&revision<=cp.remote_revision)return;
    const pending=this.db.prepare("SELECT * FROM outbox WHERE bot_id=? AND aggregate_id=? AND status='pending'").get(botId,id);
    if(pending&&hash(this.vault.unseal(pending.encrypted).payload)===hash(p)){this.mark(botId,id,revision,pending.local_revision,p);this.db.prepare('DELETE FROM outbox WHERE event_id=?').run(pending.event_id);return;}
    if(current&&hash(payload(current,kind))===hash(p)){this.mark(botId,id,revision,current.revision,p);return;}
    if(current?.revision&&(cp?.local_revision??0)!==current.revision){this.conflict(botId,id,{revision,remote:{kind,payload:p,deleted:remote.deleted,source:remote.source},local:payload(current,kind),reason:'concurrent_update'});return;}
    try{
      const value=this.applyRemote(botId,id,kind,p,revision,remote.source);this.mark(botId,id,revision,value.revision,p);
    }catch(e){this.conflict(botId,id,{revision,remote:{kind,payload:p,deleted:remote.deleted,source:remote.source},local:current?payload(current,kind):null,reason:e.message});}
  }
  applyRemote(botId,id,kind,p,revision,source){
    assertPublicText(JSON.stringify(p));const current=id==='profile'?this.store.profile(botId):this.store.entity(botId,id);
    // Locks retain their meaning even when a remote manager edits the profile.
    if(kind==='profile'&&current.lockedFields.some(k=>current[k]!==p[k]))fail('EMP_FIELD_LOCKED');
    if(current?.status==='deleted'&&p.status!=='deleted')fail('EMP_MEMORY_DELETED');
    return this.store.mutate(botId,`sync:${this.registration().tenantId}:${id}:${revision}`,'remote_sync',{kind,p,revision},{kind:'owner',note:'Verified enterprise device sync'},()=>this.store.put({...current,...p,id,botId,revision:(current?.revision??0)+1,updatedAt:this.store.now(),...(kind==='memory'?{createdAt:current?.createdAt??this.store.now(),source:source??{kind:'owner',note:'Verified enterprise device sync'}}:{})},kind,'remote_sync',{kind:'owner',note:'Verified enterprise device sync'}));
  }
  async sync(){
    if(this.flight)return this.flight;if(this.closed)fail('EMP_SYNC_CLOSED');
    this.flight=this.run().catch(e=>{this.lastError=/^[A-Z_]+$/.test(e.message)?e.message:'EMP_CONTROL_UNAVAILABLE';throw Error(this.lastError);}).finally(()=>{this.flight=null;});return this.flight;
  }
  async run(){
    if(!this.get('enabled'))fail('EMP_SYNC_NOT_ENABLED');
    // Always refresh authority before any upload after reconnect. Offline expiry does not erase local records.
    await this.device({action:'authorize'});let claims=this.offlineClaims();
    let after='',snapshotComplete=false;for(let page=0;page<1000;page++){
      const response=await this.device({action:'snapshot',after,limit:100});claims=this.offlineClaims();
      for(const r of response.records){const b=claims.bindings.find(b=>b.employeeId===r.employee_id);if(b)this.importRecord(b,r);}
      if(!response.hasMore){snapshotComplete=true;break;}if(response.after===after)fail('EMP_SYNC_CURSOR_INVALID');after=response.after;
    }
    if(!snapshotComplete)fail('EMP_SYNC_PAGE_LIMIT');
    if(!this.get('enabled'))fail('EMP_SYNC_NOT_ENABLED');
    this.queue(claims);
    const pending=this.db.prepare("SELECT * FROM outbox WHERE status='pending' ORDER BY rowid LIMIT 100").all();
    // New grants cannot silently expand already queued private data to another employee.
    const authorized=pending.filter(row=>{const e=this.vault.unseal(row.encrypted);return claims.bindings.some(b=>b.localBotId===row.bot_id&&b.employeeId===e.employeeId);});
    if(authorized.length){const response=await this.device({action:'push',events:authorized.map(r=>this.vault.unseal(r.encrypted))});
      for(const row of authorized){const result=response.results.find(r=>r.eventId===row.event_id);if(!result)fail('EMP_SYNC_ACK_MISSING');
        if(result.status==='applied'){const e=this.vault.unseal(row.encrypted);this.mark(row.bot_id,row.aggregate_id,result.revision,row.local_revision,e.payload);this.db.prepare('DELETE FROM outbox WHERE event_id=?').run(row.event_id);}
        else if(result.status==='conflict'){this.conflict(row.bot_id,row.aggregate_id,result);this.db.prepare("UPDATE outbox SET status='conflict' WHERE event_id=?").run(row.event_id);}
        else fail('EMP_SYNC_ACK_INVALID');
      }
    }
    // Stage complete snapshot, then atomically replace cache; partial fetch never masquerades as a complete catalog.
    const shared=[];let sharedComplete=false;after='';for(let page=0;page<1000;page++){const r=await this.device({action:'shared',after,limit:100});shared.push(...r.items);if(!r.hasMore){sharedComplete=true;break;}if(r.after===after)fail('EMP_SYNC_CURSOR_INVALID');after=r.after;}
    if(!sharedComplete)fail('EMP_SYNC_PAGE_LIMIT');
    this.db.exec('BEGIN IMMEDIATE');try{this.db.exec('DELETE FROM shared_cache');for(const r of shared)this.db.prepare('INSERT INTO shared_cache VALUES(?,?,?,?)').run(r.id,r.scope,r.project_id,this.vault.seal(r));this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
    this.set('lastSyncedAt',new Date(this.clock()).toISOString());this.lastError=null;return this.status();
  }
  resolve(id,choice){const row=this.db.prepare('SELECT * FROM conflicts WHERE id=?').get(id);if(!row)fail('EMP_SYNC_CONFLICT_NOT_FOUND');
    const c=this.vault.unseal(row.encrypted),binding=this.offlineClaims().bindings.find(b=>b.localBotId===row.bot_id);if(!binding)fail('EMP_DEVICE_BINDING_REQUIRED');
    if(choice==='remote'){if(!c.remote)fail('EMP_SYNC_REMOTE_EMPTY');const v=this.applyRemote(row.bot_id,row.aggregate_id,c.remote.kind,c.remote.payload,c.revision,c.remote.source);this.mark(row.bot_id,row.aggregate_id,c.revision,v.revision,c.remote.payload);}
    else if(choice==='local'){if(c.remote?.deleted)fail('EMP_MEMORY_DELETED');const value=row.aggregate_id==='profile'?this.store.profile(row.bot_id):this.store.entity(row.bot_id,row.aggregate_id);this.mark(row.bot_id,row.aggregate_id,c.revision,-1,payload(value,row.aggregate_id==='profile'?'profile':'memory'));}
    else fail('EMP_SYNC_INVALID_RESOLUTION');
    this.db.prepare('DELETE FROM conflicts WHERE id=?').run(id);this.db.prepare('DELETE FROM outbox WHERE bot_id=? AND aggregate_id=?').run(row.bot_id,row.aggregate_id);return this.status();
  }
  sharedMemories(){this.offlineClaims();return this.db.prepare('SELECT encrypted FROM shared_cache').all().map(r=>this.vault.unseal(r.encrypted)).filter(r=>!r.deleted&&r.payload.status==='active'&&(!r.payload.expiresAt||Date.parse(r.payload.expiresAt)>this.clock()));}
  setEnabled(enabled){this.set('enabled',enabled);return this.status();}
  start(){let delay=30000;const tick=async()=>{if(this.closed)return;try{if(this.get('enabled'))await this.sync();delay=30000;}catch{delay=Math.min(delay*2,300000);}finally{if(!this.closed){this.timer=setTimeout(tick,delay+Math.floor(Math.random()*3000));this.timer.unref?.();}}};this.timer=setTimeout(tick,30000);this.timer.unref?.();}
  async close(){this.closed=true;clearTimeout(this.timer);await this.enterpriseWork?.close();await this.flight?.catch(()=>{});this.db.close();}
}
