import type { PoolClient } from 'pg';
import type { Actor } from './types';
import { withTenant } from './db';
import { ApiError } from './errors';
import { audit } from './domain-core';
import { canUseProject } from './domain-projects';
import { effectiveRoles } from './role-capabilities';
import { digitalTaskChoices,digitalWorkRequest,linkDigitalWork } from './digital-work';
import { executionDevice,executionManager } from './digital-executions';
import {readModelPolicy,modelManager,modelDevice} from './digital-models';
import { assertNoCredentials, digest, edKey, keyHash, managerCommand, memoryPayload,
  profilePayload, signatureValid, signedAuthorization, signingConfig, signingPublic, deviceEnvelope,
  type ManagerCommand, type DeviceEnvelope, type SigningConfig } from './digital-employee-contract';

type Row=Record<string,any>;
const fail=(code:string,status=403):never=>{throw new ApiError(status,code,code);};
const owner=(a:Actor)=>a.roles.includes('owner');
const admin=(a:Actor)=>owner(a)||a.roles.includes('admin');
const tenant=(c:PoolClient,actor:Actor)=>c.query('SELECT id,name,kind FROM tenants WHERE id=$1 AND active FOR SHARE',[actor.tenantId]);
async function freshActor(c:PoolClient,a:Actor):Promise<Actor> {
  const company=(await tenant(c,a)).rows[0];if(!company) fail('TENANT_INACTIVE');
  const r=(await c.query(`SELECT m.*,u.email,COALESCE(NULLIF(m.display_name,''),u.name) name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.id=$2 AND m.active
    AND NOT EXISTS(SELECT 1 FROM external_accounts x WHERE x.user_id=m.user_id AND (x.disabled OR x.expires_at<=now())) FOR SHARE OF m`,[a.tenantId,a.id])).rows[0];
  if(!r)fail('MEMBER_INACTIVE');
  const roles=effectiveRoles(r.roles); if(!roles.length)fail('ACCESS_PENDING');
  return {...a,userId:r.user_id,name:r.name,email:r.email,tenantName:company.name,tenantKind:company.kind,roles,teamId:r.team_id,grade:r.grade,skills:r.skills,dailyCapacity:Number(r.daily_capacity)};
}
async function employee(c:PoolClient,a:Actor,id:string,lock=false) {
  const r=(await c.query(`SELECT * FROM digital_employees WHERE tenant_id=$1 AND id=$2 ${lock?'FOR UPDATE':'FOR SHARE'}`,[a.tenantId,id])).rows[0];
  if(!r)fail('DIGITAL_EMPLOYEE_NOT_FOUND',404);return r;
}
async function permitted(c:PoolClient,a:Actor,e:Row,role:'manager'|'requester'|'approver') {
  if(owner(a)||e.owner_id===a.id)return true;
  const roles=role==='requester'?['manager','requester','approver']:[role];
  return Boolean((await c.query('SELECT 1 FROM digital_employee_grants WHERE tenant_id=$1 AND employee_id=$2 AND member_id=$3 AND role=ANY($4::text[])',[a.tenantId,e.id,a.id,roles])).rowCount);
}
async function managed(c:PoolClient,a:Actor,id:string,lock=false) {
  const e=await employee(c,a,id,lock);if(!e.active)fail('DIGITAL_EMPLOYEE_INACTIVE');
  if(!await permitted(c,a,e,'manager'))fail('EMPLOYEE_MANAGER_REQUIRED');return e;
}
const checkRevision=(r:Row,n:number)=>{if(r.revision!==n)fail('REVISION_CONFLICT',409);};
async function projectAllowed(c:PoolClient,a:Actor,scope:string,projectId:string|null) {
  if(scope==='organization'){if(projectId!==null)fail('INVALID_SCOPE',400);return;}
  if(!projectId||!await canUseProject(c,a,projectId,false))fail('PROJECT_ACCESS_REQUIRED');
}
async function device(c:PoolClient,a:Actor,id:string) {
  const r=(await c.query('SELECT * FROM digital_devices WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[a.tenantId,id])).rows[0];
  if(!r)fail('DEVICE_NOT_FOUND',404);return r;
}
async function bindings(c:PoolClient,a:Actor,d:Row) {
  const rs=(await c.query(`SELECT b.*,e.owner_id,e.name,e.active,e.revision FROM digital_bindings b
    JOIN digital_employees e ON e.tenant_id=b.tenant_id AND e.id=b.employee_id
    WHERE b.tenant_id=$1 AND b.device_id=$2 ORDER BY b.employee_id FOR SHARE OF b,e`,[a.tenantId,d.id])).rows;
  const allowed:Row[]=[];
  for(const b of rs) if(b.active&&await permitted(c,a,{...b,id:b.employee_id},'manager'))allowed.push(b);
  return allowed;
}
async function authorization(c:PoolClient,a:Actor,d:Row,config:SigningConfig) {
  const list=await bindings(c,a,d),now=Date.now();
  // Include the exact resource set, not a wildcard organization capability.
  const projects=(await c.query('SELECT id FROM projects WHERE tenant_id=$1 ORDER BY id',[a.tenantId])).rows;
  const projectIds:string[]=[];
  for(const p of projects)if(await canUseProject(c,a,p.id,false))projectIds.push(p.id);
  const model=await readModelPolicy(c,a);
  const claims={tenantId:a.tenantId,memberId:a.id,deviceId:d.id,keyHash:d.key_hash,authEpoch:d.auth_epoch,requireModelGateway:!!model?.enforceManaged,modelPolicyRevision:model?.revision??0,
    issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+config.offlineSeconds*1000).toISOString(),
    capabilities:['local.read','local.draft','local.infer'],bindings:list.map(b=>({employeeId:b.employee_id,localBotId:b.local_bot_id})),projectIds};
  return {authorization:signedAuthorization(config,claims),serverTime:new Date(now).toISOString(),
    bindings:claims.bindings,policy:{offlineSeconds:config.offlineSeconds,onlineRequired:['shared.publish','business.accept','grant.change']}};
}
export async function digitalCatalog(actor:Actor) {
  return withTenant(actor.tenantId,async c=>{
    const a=await freshActor(c,actor);
    const all=(await c.query('SELECT * FROM digital_employees WHERE tenant_id=$1 ORDER BY created_at,id',[a.tenantId])).rows;
    const employees=[];
    for(const e of all){
      const canManage=await permitted(c,a,e,'manager'),canRead=await permitted(c,a,e,'requester'),canApprove=await permitted(c,a,e,'approver');
      if(canRead||admin(a))employees.push({id:e.id,name:e.name,ownerId:e.owner_id,active:e.active,revision:e.revision,canManage,canApprove,
        grants:canManage?(await c.query('SELECT member_id AS "memberId",role FROM digital_employee_grants WHERE tenant_id=$1 AND employee_id=$2 ORDER BY member_id,role',[a.tenantId,e.id])).rows:[]});
    }
    const devices=(await c.query(`SELECT id,name,member_id AS "memberId",active,revision,execution_kind AS "executionKind",last_seen_at AS "lastSeenAt",key_hash AS "keyHash"
      FROM digital_devices WHERE tenant_id=$1 AND ($2::boolean OR member_id=$3) ORDER BY registered_at`,[a.tenantId,admin(a),a.id])).rows;
    const proposals=[];
    const candidates=(await c.query("SELECT * FROM digital_memory_proposals WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500",[a.tenantId])).rows;
    for(const p of candidates){const e=all.find(e=>e.id===p.employee_id);
      if(e&&(p.proposed_by===a.id||await permitted(c,a,e,'approver'))){
        try {await projectAllowed(c,a,p.scope,p.project_id);}catch(error){if(error instanceof ApiError&&error.status===403)continue;throw error;}
        proposals.push(p);
      }
    }
    const members=owner(a)?(await c.query("SELECT m.id,COALESCE(NULLIF(m.display_name,''),u.name) name,m.team_id AS \"teamId\" FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.active ORDER BY name,m.id",[a.tenantId])).rows:[];
    const projects=[];for(const p of (await c.query('SELECT id,name FROM projects WHERE tenant_id=$1 ORDER BY name,id',[a.tenantId])).rows)if(await canUseProject(c,a,p.id,false))projects.push(p);
    const taskChoices=await digitalTaskChoices(c,a);
    return {version:1,tenantId:a.tenantId,memberId:a.id,canCreate:owner(a),employees,devices,proposals,members,projects,taskChoices,modelPolicy:await readModelPolicy(c,a)};
  });
}
async function runManager(c:PoolClient,a:Actor,p:ManagerCommand,config:SigningConfig):Promise<any> {
  if(p.action.startsWith('model.'))return modelManager(c,a,p,config);
  if(p.action.startsWith('execution.'))return executionManager(c,a,p);
  if(p.action==='work.link'){
    await managed(c,a,p.employeeId);return linkDigitalWork(c,a,p);
  }
  if(p.action==='employee.create'){
    if(!owner(a))fail('OWNER_REQUIRED');
    const r=(await c.query('INSERT INTO digital_employees(tenant_id,name,owner_id) VALUES($1,$2,$3) RETURNING *',[a.tenantId,p.name,a.id])).rows[0];
    return {id:r.id,name:r.name,revision:r.revision};
  }
  if(p.action==='employee.update'){
    const e=await employee(c,a,p.employeeId,true);if(!owner(a)&&e.owner_id!==a.id)fail('OWNER_REQUIRED');checkRevision(e,p.revision);
    return (await c.query('UPDATE digital_employees SET name=$3,active=$4,revision=revision+1 WHERE tenant_id=$1 AND id=$2 RETURNING id,revision',[a.tenantId,e.id,p.name,p.active])).rows[0];
  }
  if(p.action==='grant.set'){
    const e=await employee(c,a,p.employeeId,true);if(!owner(a)&&e.owner_id!==a.id)fail('OWNER_REQUIRED');checkRevision(e,p.revision);
    if(!(await c.query('SELECT 1 FROM memberships WHERE tenant_id=$1 AND id=$2 AND active FOR SHARE',[a.tenantId,p.memberId])).rowCount)fail('MEMBER_NOT_FOUND',404);
    await c.query('DELETE FROM digital_employee_grants WHERE tenant_id=$1 AND employee_id=$2 AND member_id=$3',[a.tenantId,e.id,p.memberId]);
    for(const r of new Set(p.roles))await c.query('INSERT INTO digital_employee_grants VALUES($1,$2,$3,$4)',[a.tenantId,e.id,p.memberId,r]);
    return (await c.query('UPDATE digital_employees SET revision=revision+1 WHERE tenant_id=$1 AND id=$2 RETURNING id,revision',[a.tenantId,e.id])).rows[0];
  }
  if(p.action==='device.register'){
    edKey(p.publicKey);
    if(!signatureValid(p.publicKey,{v:1,aud:'naumi-enrollment',deviceId:p.deviceId,publicKey:p.publicKey,operationId:p.operationId},p.proof))fail('DEVICE_PROOF_INVALID');
    const d=(await c.query('INSERT INTO digital_devices(id,tenant_id,member_id,name,public_key,key_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[p.deviceId,a.tenantId,a.id,p.name,p.publicKey,keyHash(p.publicKey)])).rows[0];
    return {deviceId:d.id,tenantId:a.tenantId,memberId:a.id,keyId:config.kid,serverPublicKey:signingPublic(config),...(await authorization(c,a,d,config))};
  }
  if(p.action==='device.revoke'){
    const d=await device(c,a,p.deviceId);if(d.member_id!==a.id&&!admin(a))fail('DEVICE_OWNER_REQUIRED');checkRevision(d,p.revision);
    return (await c.query('UPDATE digital_devices SET active=false,auth_epoch=auth_epoch+1,revision=revision+1 WHERE tenant_id=$1 AND id=$2 RETURNING id,revision',[a.tenantId,d.id])).rows[0];
  }
  if(p.action==='device.bind'){
    await managed(c,a,p.employeeId);const d=await device(c,a,p.deviceId);
    if(d.member_id!==a.id||!d.active)fail('DEVICE_OWNER_REQUIRED');
    const existing=(await c.query('SELECT * FROM digital_bindings WHERE tenant_id=$1 AND device_id=$2 AND employee_id=$3',[a.tenantId,d.id,p.employeeId])).rows[0];
    if(existing&&existing.local_bot_id!==p.localBotId)fail('BINDING_IMMUTABLE',409);
    await c.query('INSERT INTO digital_bindings VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,device_id,employee_id) DO NOTHING',[a.tenantId,d.id,p.employeeId,p.localBotId]);
    return authorization(c,a,d,config);
  }
  if(p.action==='memory.propose'){
    await managed(c,a,p.employeeId);await projectAllowed(c,a,p.scope,p.projectId);assertNoCredentials({payload:p.payload,source:p.source});
    const r=(await c.query('SELECT * FROM digital_shared_memories WHERE tenant_id=$1 AND id=$2 FOR SHARE',[a.tenantId,p.memoryId])).rows[0];
    if(r&&(r.employee_id!==p.employeeId||r.scope!==p.scope||r.project_id!==p.projectId))fail('SHARED_SCOPE_IMMUTABLE',409);
    if((r?.revision??0)!==p.baseRevision)fail('REVISION_CONFLICT',409);
    if(p.payload.status!=='active'&& !p.deleted)fail('SHARED_SOURCE_MUST_BE_CONFIRMED',400);
    await c.query(`INSERT INTO digital_memory_proposals(id,tenant_id,employee_id,memory_id,scope,project_id,base_revision,payload,source,deleted,proposed_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[p.proposalId,a.tenantId,p.employeeId,p.memoryId,p.scope,p.projectId,p.baseRevision,p.payload,p.source,p.deleted,a.id]);
    return {proposalId:p.proposalId,status:'candidate'};
  }
  if(p.action==='memory.decide'){
    const r=(await c.query('SELECT * FROM digital_memory_proposals WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[a.tenantId,p.proposalId])).rows[0];
    if(!r)fail('PROPOSAL_NOT_FOUND',404);if(r.status!=='candidate')fail('PROPOSAL_ALREADY_DECIDED',409);
    const e=await employee(c,a,r.employee_id);if(!e.active)fail('DIGITAL_EMPLOYEE_INACTIVE');
    if(!await permitted(c,a,e,'approver')||(r.scope==='organization'&&!owner(a)))fail('APPROVER_REQUIRED');
    await projectAllowed(c,a,r.scope,r.project_id);if(r.proposed_by===a.id)fail('SELF_APPROVAL');
    if(p.decision==='approved'){
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${a.tenantId}:shared:${r.memory_id}`]);
      const old=(await c.query('SELECT revision FROM digital_shared_memories WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[a.tenantId,r.memory_id])).rows[0];
      if((old?.revision??0)!==r.base_revision)fail('REVISION_CONFLICT',409);
      await c.query(`INSERT INTO digital_shared_memories(id,tenant_id,employee_id,scope,project_id,revision,payload,deleted)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,deleted=excluded.deleted,updated_at=now()`,
      [r.memory_id,a.tenantId,r.employee_id,r.scope,r.project_id,r.base_revision+1,r.payload,r.deleted]);
    }
    await c.query('UPDATE digital_memory_proposals SET status=$3,decided_by=$4,reason=$5,decided_at=now() WHERE tenant_id=$1 AND id=$2',[a.tenantId,r.id,p.decision,a.id,p.reason]);
    return {proposalId:r.id,status:p.decision};
  }
}
export async function digitalCommand(actor:Actor,input:unknown,config:SigningConfig=signingConfig()) {
  const p=managerCommand.parse(input);
  return withTenant(actor.tenantId,async c=>{
    const a=await freshActor(c,actor),hash=digest(p);
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${a.tenantId}:${a.id}:digital:${p.operationId}`]);
    const prior=(await c.query('SELECT * FROM digital_request_receipts WHERE tenant_id=$1 AND actor_id=$2 AND operation_id=$3',[a.tenantId,a.id,p.operationId])).rows[0];
    if(prior){if(prior.request_hash!==hash)fail('IDEMPOTENCY_CONFLICT',409);return prior.result;}
    const result=await runManager(c,a,p,config);
    // Audit identifiers, never full private memory / key material.
    await audit(c,a,p.action,'digital_employee','employeeId' in p?p.employeeId:'deviceId' in p?p.deviceId:result?.id??p.operationId,{operationId:p.operationId});
    await c.query('INSERT INTO digital_request_receipts(tenant_id,actor_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4,$5)',[a.tenantId,a.id,p.operationId,hash,JSON.stringify(result)]);
    return result;
  });
}

async function push(c:PoolClient,a:Actor,d:Row,body:Extract<DeviceEnvelope['body'],{action:'push'}>) {
  const allowed=await bindings(c,a,d),results=[];
  for(const event of body.events){
    if(!allowed.some(b=>b.employee_id===event.employeeId))fail('DEVICE_BINDING_REQUIRED');
    if(event.kind==='profile'&&event.aggregateId!=='profile'||event.kind==='memory'&&!/^memory-[0-9a-f-]{36}$/i.test(event.aggregateId))fail('INVALID_AGGREGATE',400);
    const payload=(event.kind==='profile'?profilePayload:memoryPayload).parse(event.payload);
    if(event.kind==='profile'&&event.deleted)fail('PROFILE_DELETE_FORBIDDEN',400);
    if(event.kind==='memory'&&event.deleted!==((payload as any).status==='deleted'))fail('TOMBSTONE_REQUIRED',400);
    assertNoCredentials({payload,source:event.source});
    const hash=digest(event);
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${a.tenantId}:event:${event.eventId}`]);
    const prior=(await c.query('SELECT * FROM digital_sync_events WHERE tenant_id=$1 AND event_id=$2',[a.tenantId,event.eventId])).rows[0];
    if(prior){if(prior.request_hash!==hash||prior.device_id!==d.id)fail('EVENT_ID_CONFLICT',409);results.push(prior.result);continue;}
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${a.tenantId}:${event.employeeId}:${event.aggregateId}`]);
    const current=(await c.query('SELECT * FROM digital_records WHERE tenant_id=$1 AND employee_id=$2 AND aggregate_id=$3 FOR UPDATE',[a.tenantId,event.employeeId,event.aggregateId])).rows[0];
    const revision=current?.revision??0;
    const result:Row=revision!==event.baseRevision||current?.deleted&&!event.deleted?{eventId:event.eventId,status:'conflict',revision,remote:current?{kind:current.kind,payload:current.payload,deleted:current.deleted,source:current.source}:null,local:payload}:
      {eventId:event.eventId,status:'applied',revision:revision+1,employeeId:event.employeeId,aggregateId:event.aggregateId,kind:event.kind,payload,deleted:event.deleted,source:event.source};
    if(result.status==='applied')await c.query(`INSERT INTO digital_records(tenant_id,employee_id,aggregate_id,kind,revision,payload,source,deleted) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(tenant_id,employee_id,aggregate_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,source=excluded.source,deleted=excluded.deleted,updated_at=now()`,[a.tenantId,event.employeeId,event.aggregateId,event.kind,result.revision,payload,event.source,event.deleted]);
    await c.query(`INSERT INTO digital_sync_events(tenant_id,event_id,employee_id,device_id,aggregate_id,kind,base_revision,request_hash,result,source,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[a.tenantId,event.eventId,event.employeeId,d.id,event.aggregateId,event.kind,event.baseRevision,hash,result,event.source,event.occurredAt]);
    results.push(result);
  }
  return {results};
}
async function shared(c:PoolClient,a:Actor,after:string,limit:number) {
  // Scan bounded pages before ACL filtering; cursor is the last examined id, not the last visible one.
  const rs=(await c.query('SELECT * FROM digital_shared_memories WHERE tenant_id=$1 AND id::text>$2 ORDER BY id::text LIMIT $3',[a.tenantId,after,limit+1])).rows;
  const page=rs.slice(0,limit),items=[];
  for(const r of page){try{await projectAllowed(c,a,r.scope,r.project_id);items.push(r);}catch(error){if(!(error instanceof ApiError&&error.status===403))throw error;}}
  return {items,after:page.at(-1)?.id??after,hasMore:rs.length>limit};
}
export async function digitalDeviceRequest(raw:unknown,signature:string,config:SigningConfig=signingConfig()) {
  const signed=structuredClone(raw),p=deviceEnvelope.parse(signed);
  if(Math.abs(Date.now()-Date.parse(p.issuedAt))>300000)fail('DEVICE_REQUEST_EXPIRED',401);
  const rollback:Array<()=>Promise<void>>=[];
  try{return await withTenant(p.tenantId,async c=>{
    const placeholder={tenantId:p.tenantId} as Actor;
    const initial=(await c.query('SELECT public_key FROM digital_devices WHERE tenant_id=$1 AND id=$2',[p.tenantId,p.deviceId])).rows[0];
    if(!initial)fail('DEVICE_NOT_FOUND',404);
    if(!signatureValid(initial.public_key,signed,signature))fail('DEVICE_SIGNATURE_INVALID',401);
    // Consistent tenant -> device lock order, including uploads' existing storage-quota lock.
    if(!(await c.query(`SELECT id FROM tenants WHERE id=$1 AND active ${p.body.action==='work.upload'?'FOR UPDATE':'FOR SHARE'}`,[p.tenantId])).rowCount)fail('TENANT_INACTIVE');
    const d=await device(c,placeholder,p.deviceId);
    if(!signatureValid(d.public_key,signed,signature))fail('DEVICE_SIGNATURE_INVALID',401);
    if(!d.active)fail('DEVICE_REVOKED');
    if((await c.query('SELECT 1 FROM external_accounts WHERE user_id=(SELECT user_id FROM memberships WHERE tenant_id=$1 AND id=$2) AND revoked_before>=$3',[p.tenantId,d.member_id,d.registered_at])).rowCount)fail('DEVICE_REENROLLMENT_REQUIRED');
    const a=await freshActor(c,{tenantId:p.tenantId,id:d.member_id} as Actor);
    const hash=digest(p),prior=(await c.query('SELECT * FROM digital_device_nonces WHERE tenant_id=$1 AND device_id=$2 AND nonce=$3',[a.tenantId,d.id,p.nonce])).rows[0];
    // Reject nonce reuse. Lost ACK retries use a fresh nonce and the original stable eventId.
    if(prior)fail('NONCE_REPLAY',409);
    const auth=await authorization(c,a,d,config);
    let result:Row={};
    if(p.body.action==='push')result=await push(c,a,d,p.body);
    if(p.body.action==='pull'){
      const allowed=await bindings(c,a,d),ids=allowed.map(b=>b.employee_id);
      const rows=(await c.query('SELECT seq,result,employee_id FROM digital_sync_events WHERE tenant_id=$1 AND seq>$2 ORDER BY seq LIMIT $3',[a.tenantId,p.body.cursor,p.body.limit+1])).rows;
      const page=rows.slice(0,p.body.limit);
      result={events:page.filter(r=>ids.includes(r.employee_id)&&r.result.status==='applied').map(r=>({seq:Number(r.seq),...r.result})),
        cursor:Number(page.at(-1)?.seq??p.body.cursor),hasMore:rows.length>p.body.limit};
    }
    if(p.body.action==='snapshot'){
      const allowed=await bindings(c,a,d);
      // Private records are per authorized employee. Shared snapshot has a separate pageable cursor.
      const records=(await c.query('SELECT * FROM digital_records WHERE tenant_id=$1 AND employee_id=ANY($2::uuid[]) AND (employee_id::text||\'/\'||aggregate_id)>$3 ORDER BY employee_id::text||\'/\'||aggregate_id LIMIT $4',[a.tenantId,allowed.map(b=>b.employee_id),p.body.after,p.body.limit+1])).rows;
      const page=records.slice(0,p.body.limit);
      result={records:page,after:page.length?page.at(-1)!.employee_id+'/'+page.at(-1)!.aggregate_id:p.body.after,hasMore:records.length>p.body.limit};
    }
    if(p.body.action==='shared')result=await shared(c,a,p.body.after,p.body.limit);
    if(p.body.action==='model.authorize')result=await modelDevice(c,a,d,p.body,auth.bindings,config);
    if(p.body.action.startsWith('work.')||p.body.action.startsWith('execution.')){
      const b=p.body as Extract<DeviceEnvelope['body'],{employeeId:string}>;
      if(!auth.bindings.some(x=>x.employeeId===b.employeeId))fail('DEVICE_BINDING_REQUIRED');
      result=p.body.action.startsWith('execution.')?await executionDevice(c,a,d,p.body):await digitalWorkRequest(c,a,d,p.body,rollback);
    }
    // Authorization response supplies a shared snapshot page on every call only when explicitly requested separately.
    await c.query('UPDATE digital_devices SET last_seen_at=now() WHERE tenant_id=$1 AND id=$2',[a.tenantId,d.id]);
    await c.query('DELETE FROM digital_device_nonces WHERE tenant_id=$1 AND device_id=$2 AND created_at<now()-interval \'10 minutes\'',[a.tenantId,d.id]);
    await c.query('INSERT INTO digital_device_nonces(tenant_id,device_id,nonce,request_hash,result) VALUES($1,$2,$3,$4,$5)',[a.tenantId,d.id,p.nonce,hash,p.body.action==='model.authorize'?{modelCredentialIssued:true}:result]);
    return {...result,...auth};
  });}catch(error){for(const cleanup of rollback)await cleanup().catch(()=>{});throw error;}
}

export async function digitalSharedSnapshot(actor:Actor,after='',limit=100) {
  return withTenant(actor.tenantId,async c=>shared(c,await freshActor(c,actor),after,limit));
}
