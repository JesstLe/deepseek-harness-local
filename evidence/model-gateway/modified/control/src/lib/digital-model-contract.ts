import {z} from 'zod';
const uuid=z.string().uuid(),limit=z.object({costMicros:z.number().int().min(0).max(1e12),tokens:z.number().int().min(0).max(1e12),requests:z.number().int().min(0).max(1e9),concurrent:z.number().int().min(1).max(64)}).strict();
export const modelPolicy=z.object({active:z.boolean(),routes:z.array(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/)).min(1).max(30).refine(v=>new Set(v).size===v.length),organization:limit,employee:limit,task:limit,maxAttempts:z.number().int().min(1).max(3),credentialSeconds:z.number().int().min(300).max(86400),enforceManaged:z.boolean(),allowFallback:z.boolean()}).strict();
export const modelManagerCommands=[
 z.object({action:z.literal('model.policy.sync'),operationId:uuid}).strict(),
 z.object({action:z.literal('model.policy.set'),expectedRevision:z.number().int().nonnegative(),policy:modelPolicy,operationId:uuid}).strict(),
 z.object({action:z.literal('model.resolve-unknown'),requestId:uuid,confirmedStopped:z.literal(true),reason:z.string().trim().min(6).max(1000),operationId:uuid}).strict(),
] as const;
export const modelDeviceCommands=[z.object({action:z.literal('model.authorize'),employeeId:uuid,taskId:uuid.nullable().default(null)}).strict()] as const;
