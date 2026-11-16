import {z} from 'zod';import {createHash,verify} from 'node:crypto';
export const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
export function fault(code,status=400){const e=Error(code);e.status=status;return e;}
const uuid=z.string().uuid(),limit=z.object({costMicros:z.number().int().min(0).max(1e12),tokens:z.number().int().min(0).max(1e12),requests:z.number().int().min(0).max(1e9),concurrent:z.number().int().min(1).max(64)}).strict();
export const policySchema=z.object({revision:z.number().int().positive(),active:z.boolean(),routes:z.array(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/)).min(1).max(30),organization:limit,employee:limit,task:limit,maxAttempts:z.number().int().min(1).max(3),credentialSeconds:z.number().int().min(300).max(86400),enforceManaged:z.boolean(),allowFallback:z.boolean()}).strict();
export const grantSchema=z.object({v:z.literal(1),aud:z.literal('naumi-model-gateway'),iss:z.string(),gateway:z.string().url(),jti:uuid,tenantId:uuid,memberId:uuid,deviceId:uuid,employeeId:uuid,botId:z.string().min(1).max(200),taskId:uuid.nullable(),authEpoch:z.number().int().positive(),period:z.string().regex(/^\d{4}-\d{2}$/),issuedAt:z.string().datetime(),expiresAt:z.string().datetime(),policy:policySchema}).strict();
export function verifyGrant(token,{keys,issuer,gateway,now=Date.now()}){
 if(typeof token!=='string'||token.length>15000)throw fault('MODEL_TOKEN_INVALID',401);const [kid,payload,signature,...rest]=token.split('.');
 try{if(rest.length||!keys[kid]||!verify(null,Buffer.from(payload),keys[kid],Buffer.from(signature,'base64url')))throw Error();}catch{throw fault('MODEL_TOKEN_SIGNATURE_INVALID',401);}
 let c;try{c=grantSchema.parse(JSON.parse(Buffer.from(payload,'base64url').toString()));}catch{throw fault('MODEL_TOKEN_INVALID',401);}
 if(c.iss!==issuer||c.gateway!==gateway)throw fault('MODEL_TOKEN_AUDIENCE_INVALID',401);
 const start=Date.parse(c.issuedAt),end=Date.parse(c.expiresAt);if(now<start-60000||now>=end||end<=start||end-start>86400000||new Date(start).toISOString().slice(0,7)!==c.period||new Date(end-1).toISOString().slice(0,7)!==c.period)throw fault('MODEL_TOKEN_EXPIRED',401);
 if(!c.policy.active)throw fault('MODEL_POLICY_DISABLED',403);return c;
}
export const cost=(input,output,route)=>Number((BigInt(input)*BigInt(route.inputMicrosPerMillion)+999999n)/1000000n+(BigInt(output)*BigInt(route.outputMicrosPerMillion)+999999n)/1000000n);
export function scopes(c){return [{kind:'organization',id:c.tenantId,limit:c.policy.organization},{kind:'employee',id:c.employeeId,limit:c.policy.employee},{kind:'bot',id:c.botId,limit:c.policy.employee},...(c.taskId?[{kind:'task',id:c.taskId,limit:c.policy.task}]:[])];}
export const routeSchema=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/),name:z.string().max(120),url:z.string().url(),model:z.string().min(1).max(200),keyEnv:z.string().regex(/^[A-Z][A-Z0-9_]+$/),contextTokens:z.number().int().min(128).max(2000000),maxOutputTokens:z.number().int().min(1).max(1000000),inputMicrosPerMillion:z.number().int().min(0).max(1e9),outputMicrosPerMillion:z.number().int().min(0).max(1e9),vision:z.boolean().default(false),fallbacks:z.array(z.string()).max(2).default([])}).strict();
