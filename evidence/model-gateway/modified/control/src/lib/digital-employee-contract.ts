import { z } from 'zod';
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { ApiError } from './errors';
import { readFileSync } from 'node:fs';
import { workDeviceCommands,workManagerCommands } from './digital-work-contract';
import { executionDeviceCommands,executionManagerCommands } from './digital-execution-contract';
import { modelDeviceCommands,modelManagerCommands } from './digital-model-contract';

export const canonical = (v: any): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))) : x);
export const digest = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
export const uuid = z.string().uuid();
export const localBotId = z.string().regex(/^bot-[0-9a-f-]{36}$/i);
export const publicKey = z.string().min(60).max(300);
export function edKey(pem: string): KeyObject {
  try { const k=createPublicKey(pem); if(k.asymmetricKeyType!=='ed25519') throw Error(); return k; }
  catch { throw new ApiError(400,'设备公钥格式不正确','DEVICE_KEY_INVALID'); }
}
export function keyHash(pem: string) { return createHash('sha256').update(edKey(pem).export({type:'spki',format:'der'})).digest('hex'); }
export function signatureValid(pem: string, body: unknown, signature: string) {
  try { return verify(null,Buffer.from(canonical(body)),edKey(pem),Buffer.from(signature,'base64url')); } catch { return false; }
}
export type SigningConfig = { kid:string; privateKey:string; issuer:string; offlineSeconds:number };
export function signingConfig(): SigningConfig {
  const key=process.env.DIGITAL_EMPLOYEE_SIGNING_KEY||(process.env.DIGITAL_EMPLOYEE_SIGNING_KEY_FILE?readFileSync(process.env.DIGITAL_EMPLOYEE_SIGNING_KEY_FILE,'utf8'):undefined);
  if(!key) throw new ApiError(503,'企业设备签名服务尚未配置','SIGNING_NOT_CONFIGURED');
  return {kid:process.env.DIGITAL_EMPLOYEE_KEY_ID||'naumi-device-v1', privateKey:key.replaceAll('\\n','\n'),
    issuer:process.env.APP_ORIGIN||'http://127.0.0.1:3112',offlineSeconds:Math.min(86400,Math.max(300,Number(process.env.DIGITAL_EMPLOYEE_OFFLINE_SECONDS)||86400))};
}
export function signingPublic(config: SigningConfig) {
  const key=createPrivateKey(config.privateKey); if(key.asymmetricKeyType!=='ed25519') throw new ApiError(503,'签名密钥类型错误','SIGNING_KEY_INVALID');
  return createPublicKey(key).export({type:'spki',format:'pem'}).toString();
}
export function signedAuthorization(config: SigningConfig, claims: Record<string,unknown>) {
  const payload=Buffer.from(canonical({v:1,aud:'naumi-desktop',iss:config.issuer,...claims})).toString('base64url');
  return {kid:config.kid,payload,signature:sign(null,Buffer.from(payload),config.privateKey).toString('base64url')};
}
const source=z.object({kind:z.enum(['owner','user','proposal','agent']),sessionId:z.string().max(200).optional(),messageId:z.string().max(200).optional(),quote:z.string().max(4000).optional(),note:z.string().max(500).optional()}).strict();
export const memoryPayload=z.object({kind:z.enum(['fact','preference','experience','procedure','relationship']),text:z.string().trim().min(1).max(4000),status:z.enum(['candidate','active','rejected','deleted']),pinned:z.boolean(),expiresAt:z.string().datetime().nullable(),mergedInto:z.string().max(200).optional(),mergedFrom:z.array(z.object({id:z.string().max(200),revision:z.number().int().positive(),source:source.optional(),importSource:z.object({kind:z.string().max(50),sessionId:z.string().max(200).optional(),messageId:z.string().max(200).optional(),quote:z.string().max(4000).optional(),note:z.string().max(500).optional()}).strict().optional()}).strict()).max(100).optional(),importSource:z.object({kind:z.string().max(50),sessionId:z.string().max(200).optional(),messageId:z.string().max(200).optional(),quote:z.string().max(4000).optional(),note:z.string().max(500).optional()}).strict().optional(),proposedProfile:z.object({communicationStyle:z.string().max(2000).optional(),workStyle:z.string().max(2000).optional(),personality:z.string().max(2000).optional(),persona:z.string().max(2000).optional()}).strict().optional()}).strict();
export const profilePayload=z.object({communicationStyle:z.string().max(2000),workStyle:z.string().max(2000),personality:z.string().max(2000),persona:z.string().max(2000),autoLearning:z.boolean(),lockedFields:z.array(z.enum(['communicationStyle','workStyle','personality','persona'])).max(4)}).strict();
export function assertNoCredentials(v: unknown) {
  if(/(?:\b(?:sk|rk)-[a-z0-9_-]{16,}|\bBearer\s+[a-z0-9._-]{12,}|(?:api[_ -]?key|password|密码|token)\s*[:=：]\s*\S{6,})/iu.test(canonical(v)))
    throw new ApiError(400,'记忆包含凭证模式','CREDENTIAL_IN_MEMORY');
}
export const syncEvent=z.object({eventId:uuid,employeeId:uuid,aggregateId:z.string().min(1).max(200),kind:z.enum(['profile','memory']),baseRevision:z.number().int().min(0),payload:z.unknown(),source,occurredAt:z.string().datetime(),deleted:z.boolean()}).strict();
export const deviceBody=z.discriminatedUnion('action',[
  ...modelDeviceCommands,
  ...executionDeviceCommands,
  ...workDeviceCommands,
  z.object({action:z.literal('authorize')}).strict(),
  z.object({action:z.literal('push'),events:z.array(syncEvent).min(1).max(100)}).strict(),
  z.object({action:z.literal('pull'),cursor:z.number().int().min(0),limit:z.number().int().min(1).max(100).default(100)}).strict(),
  z.object({action:z.literal('snapshot'),after:z.string().max(400).default(''),limit:z.number().int().min(1).max(100).default(100)}).strict(),
  z.object({action:z.literal('shared'),after:z.string().max(50).default(''),limit:z.number().int().min(1).max(100).default(100)}).strict(),
]);
export const deviceEnvelope=z.object({v:z.literal(1),aud:z.literal('naumi-device-api'),tenantId:uuid,deviceId:uuid,nonce:uuid,issuedAt:z.string().datetime(),body:deviceBody}).strict();
const common={operationId:uuid};
export const managerCommand=z.discriminatedUnion('action',[
  ...modelManagerCommands,
  ...executionManagerCommands,
  ...workManagerCommands,
  z.object({action:z.literal('employee.create'),name:z.string().trim().min(1).max(100),...common}).strict(),
  z.object({action:z.literal('employee.update'),employeeId:uuid,revision:z.number().int().positive(),name:z.string().trim().min(1).max(100),active:z.boolean(),...common}).strict(),
  z.object({action:z.literal('grant.set'),employeeId:uuid,revision:z.number().int().positive(),memberId:uuid,roles:z.array(z.enum(['manager','requester','approver'])).max(3),...common}).strict(),
  z.object({action:z.literal('device.register'),deviceId:uuid,name:z.string().trim().min(1).max(100),publicKey,proof:z.string().max(200),...common}).strict(),
  z.object({action:z.literal('device.revoke'),deviceId:uuid,revision:z.number().int().positive(),...common}).strict(),
  z.object({action:z.literal('device.bind'),deviceId:uuid,employeeId:uuid,localBotId,...common}).strict(),
  z.object({action:z.literal('memory.propose'),proposalId:uuid,memoryId:uuid,employeeId:uuid,scope:z.enum(['organization','project']),projectId:uuid.nullable(),baseRevision:z.number().int().min(0),payload:memoryPayload,source,deleted:z.boolean().default(false),...common}).strict(),
  z.object({action:z.literal('memory.decide'),proposalId:uuid,decision:z.enum(['approved','rejected']),reason:z.string().trim().min(1).max(1000),...common}).strict(),
]);
export type ManagerCommand=z.infer<typeof managerCommand>;
export type DeviceEnvelope=z.infer<typeof deviceEnvelope>;
