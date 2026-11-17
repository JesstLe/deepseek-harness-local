import {randomUUID} from 'node:crypto';import type {PoolClient} from 'pg';import type {Actor} from './types';import {ApiError} from './errors';import {audit,requireTask,requireRole} from './domain-core';import {modelPolicy} from './digital-model-contract';import {signedAuthorization,type SigningConfig} from './digital-employee-contract';
type Row=Record<string,any>;
export function gatewayUrl(){const raw=process.env.NAUMI_MODEL_GATEWAY_URL;if(!raw)throw new ApiError(503,'模型网关尚未配置','MODEL_GATEWAY_NOT_CONFIGURED');let u;try{u=new URL(raw);}catch{throw new ApiError(503,'模型网关配置格式错误','MODEL_GATEWAY_CONFIG_INVALID');}if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw new ApiError(503,'模型网关配置格式错误','MODEL_GATEWAY_CONFIG_INVALID');return u.origin;}
const token=(config:SigningConfig,claims:Row)=>{const p=signedAuthorization(config,claims);return p.kid+'.'+p.payload+'.'+p.signature;};
export async function readModelPolicy(c:PoolClient,a:Actor){const r=(await c.query('SELECT revision,policy,updated_at FROM digital_model_policies WHERE tenant_id=$1',[a.tenantId])).rows[0];return r?{...r.policy,revision:r.revision,updatedAt:r.updated_at}:null;}
function adminProof(a:Actor,config:SigningConfig,body:Row){const now=Date.now();return {gateway:gatewayUrl(),proof:token(config,{aud:'naumi-model-admin',gateway:gatewayUrl(),tenantId:a.tenantId,memberId:a.id,jti:randomUUID(),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),...body})};}
export async function modelManager(c:PoolClient,a:Actor,p:Row,config:SigningConfig){
 requireRole(a,'owner');
 if(p.action==='model.policy.sync'){const policy=await readModelPolicy(c,a);if(!policy)throw new ApiError(404,'模型策略尚未配置','MODEL_POLICY_NOT_FOUND');const {updatedAt,...signedPolicy}=policy;await audit(c,a,p.action,'model-policy',a.tenantId,{revision:policy.revision});return {policy:signedPolicy,...adminProof(a,config,{action:'apply-policy',policy:signedPolicy})};}
 if(p.action==='model.policy.set'){
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a.tenantId+':model-policy']);
  const next=modelPolicy.parse(p.policy),old=(await c.query('SELECT * FROM digital_model_policies WHERE tenant_id=$1 FOR UPDATE',[a.tenantId])).rows[0];if((old?.revision??0)!==p.expectedRevision)throw new ApiError(409,'模型策略已更新','REVISION_CONFLICT');
  const revision=(old?.revision??0)+1;await c.query('INSERT INTO digital_model_policies(tenant_id,revision,policy,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id) DO UPDATE SET revision=excluded.revision,policy=excluded.policy,updated_by=excluded.updated_by,updated_at=now()',[a.tenantId,revision,JSON.stringify(next),a.id]);await audit(c,a,p.action,'model-policy',a.tenantId,{revision,policy:next});
  return {policy:{...next,revision},...adminProof(a,config,{action:'apply-policy',policy:{...next,revision}})};
 }
 await audit(c,a,p.action,'model-request',p.requestId,{confirmedStopped:true,reason:p.reason});return adminProof(a,config,{action:'charge-ceiling',requestId:p.requestId,confirmedStopped:true,reason:p.reason});
}
export async function modelDevice(c:PoolClient,a:Actor,d:Row,p:Row,bindings:Array<{employeeId:string,localBotId:string}>,config:SigningConfig){
 const binding=bindings.find(b=>b.employeeId===p.employeeId);if(!binding)throw new ApiError(403,'设备未关联此员工','DEVICE_BINDING_REQUIRED');
 const policy=await readModelPolicy(c,a);if(!policy||!policy.active)throw new ApiError(403,'模型预算策略未启用','MODEL_POLICY_DISABLED');
 if(p.taskId){await requireTask(c,a,p.taskId,false);if(!(await c.query('SELECT 1 FROM digital_work_links WHERE tenant_id=$1 AND task_id=$2 AND employee_id=$3 AND active',[a.tenantId,p.taskId,p.employeeId])).rowCount)throw new ApiError(403,'任务未关联此员工','WORK_EMPLOYEE_LINK_REQUIRED');}
 const {updatedAt,...signedPolicy}=policy,now=Date.now(),date=new Date(now),end=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1),expiresAt=new Date(Math.min(now+policy.credentialSeconds*1000,end)).toISOString();
 const claims={aud:'naumi-model-gateway',gateway:gatewayUrl(),jti:randomUUID(),tenantId:a.tenantId,memberId:a.id,deviceId:d.id,employeeId:p.employeeId,botId:binding.localBotId,taskId:p.taskId,authEpoch:d.auth_epoch,period:new Date(now).toISOString().slice(0,7),issuedAt:new Date(now).toISOString(),expiresAt,policy:signedPolicy};
 return {model:{gateway:claims.gateway,token:token(config,claims),expiresAt,policy:signedPolicy}};
}
