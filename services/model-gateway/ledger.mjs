import fs from 'node:fs';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {canonical,digest,cost,scopes,fault} from './contract.mjs';
/** Gateway-authoritative, single-ledger reservations. No prompt, result text or credentials are stored. */
export class ModelLedger{
 constructor(file,{clock=()=>Date.now()}={}){this.clock=clock;if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true});this.db=new DatabaseSync(file);
 const application=this.db.prepare('PRAGMA application_id').get().application_id,version=this.db.prepare('PRAGMA user_version').get().user_version;
 if((application!==0&&application!==0x4e4d4731)||version>1){this.db.close();throw fault('MODEL_LEDGER_VERSION_UNSUPPORTED',503);}
 if(application===0&&this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length){this.db.close();throw fault('MODEL_LEDGER_IDENTITY_INVALID',503);}
 this.db.exec(`PRAGMA application_id=1313687345;PRAGMA user_version=1;PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS policies(tenant TEXT PRIMARY KEY,revision INTEGER NOT NULL,hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS epochs(tenant TEXT,device TEXT,epoch INTEGER NOT NULL,PRIMARY KEY(tenant,device));
 CREATE TABLE IF NOT EXISTS accounts(tenant TEXT,period TEXT,kind TEXT,id TEXT,spent_cost INTEGER NOT NULL DEFAULT 0,reserved_cost INTEGER NOT NULL DEFAULT 0,spent_tokens INTEGER NOT NULL DEFAULT 0,reserved_tokens INTEGER NOT NULL DEFAULT 0,requests INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(tenant,period,kind,id));
 CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,period TEXT NOT NULL,employee TEXT NOT NULL,bot TEXT NOT NULL,device TEXT NOT NULL,task TEXT,hash TEXT NOT NULL,state TEXT NOT NULL,route TEXT NOT NULL,price TEXT NOT NULL,scope TEXT NOT NULL,reserved_cost INTEGER NOT NULL,reserved_tokens INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,input_tokens INTEGER,output_tokens INTEGER,charged_cost INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,error TEXT);
 CREATE INDEX IF NOT EXISTS active_requests ON requests(tenant,period,state);
 CREATE TABLE IF NOT EXISTS audits(seq INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT,action TEXT NOT NULL,detail TEXT NOT NULL,at TEXT NOT NULL);`);
 this.db.exec('CREATE TABLE IF NOT EXISTS admin_operations(jti TEXT PRIMARY KEY,hash TEXT NOT NULL,result TEXT NOT NULL)');
 if(this.db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw fault('MODEL_LEDGER_CORRUPT',503);
 this.transaction(()=>{for(const r of this.db.prepare("SELECT id FROM requests WHERE state IN ('reserved','dispatched')").all()){this.db.prepare("UPDATE requests SET state='unknown',error='GATEWAY_PROCESS_INTERRUPTED',updated_at=? WHERE id=?").run(this.now(),r.id);this.audit(r.id,'restart_unknown',{});}});
 }
 now(){return new Date(this.clock()).toISOString();}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.beforeCommit?.();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 audit(id,action,detail){this.db.prepare('INSERT INTO audits(request_id,action,detail,at) VALUES(?,?,?,?)').run(id,action,canonical(detail),this.now());}
 accept(c){
  const now=this.clock(),high=this.db.prepare("SELECT value FROM metadata WHERE key='clock'").get()?.value??0;if(now<high-60000)throw fault('MODEL_CLOCK_ROLLBACK',403);this.db.prepare("INSERT INTO metadata VALUES('clock',?) ON CONFLICT(key) DO UPDATE SET value=max(value,excluded.value)").run(now);
  const p=this.db.prepare('SELECT * FROM policies WHERE tenant=?').get(c.tenantId),h=digest(c.policy);
  if(p&&(p.revision>c.policy.revision||p.revision===c.policy.revision&&p.hash!==h))throw fault('MODEL_POLICY_STALE',403);
  this.db.prepare('INSERT INTO policies VALUES(?,?,?) ON CONFLICT(tenant) DO UPDATE SET revision=excluded.revision,hash=excluded.hash').run(c.tenantId,c.policy.revision,h);
  const epoch=this.db.prepare('SELECT epoch FROM epochs WHERE tenant=? AND device=?').get(c.tenantId,c.deviceId)?.epoch??0;if(c.authEpoch<epoch)throw fault('MODEL_DEVICE_EPOCH_STALE',403);
  this.db.prepare('INSERT INTO epochs VALUES(?,?,?) ON CONFLICT(tenant,device) DO UPDATE SET epoch=max(epoch,excluded.epoch)').run(c.tenantId,c.deviceId,c.authEpoch);
 }
 authenticate(c){return this.transaction(()=>this.accept(c));}
 account(c,s){this.db.prepare('INSERT INTO accounts(tenant,period,kind,id) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(c.tenantId,c.period,s.kind,s.id);return this.db.prepare('SELECT * FROM accounts WHERE tenant=? AND period=? AND kind=? AND id=?').get(c.tenantId,c.period,s.kind,s.id);}
 active(c,s){return this.db.prepare("SELECT count(*) n FROM requests WHERE tenant=? AND state IN ('reserved','dispatched','unknown')"+(s.kind==='employee'?' AND employee=?':s.kind==='task'?' AND task=?':s.kind==='bot'?' AND bot=?':'')).get(c.tenantId,...s.kind==='organization'?[]:[s.id]).n;}
 reserve(c,id,body,plan){this.authenticate(c);return this.transaction(()=>{
  this.accept(c);const h=digest(body),old=this.db.prepare('SELECT * FROM requests WHERE id=?').get(id);
  if(old){if(old.tenant!==c.tenantId||old.device!==c.deviceId||old.employee!==c.employeeId||old.bot!==c.botId||old.task!==c.taskId||old.hash!==h)throw fault('MODEL_REQUEST_ID_CONFLICT',409);throw fault(old.state==='completed'?'MODEL_REQUEST_ALREADY_COMPLETED':'MODEL_REQUEST_RESULT_UNRESOLVED',409);}
  const reserveCost=Math.max(...plan.map(r=>cost(r.contextTokens,body.max_tokens,r))),reserveTokens=Math.max(...plan.map(r=>r.contextTokens))+body.max_tokens,list=scopes(c);
  for(const s of list){const a=this.account(c,s);if(a.spent_cost+a.reserved_cost+reserveCost>s.limit.costMicros||a.spent_tokens+a.reserved_tokens+reserveTokens>s.limit.tokens)throw fault('MODEL_BUDGET_EXCEEDED',402);if(a.requests>=s.limit.requests)throw fault('MODEL_REQUEST_LIMIT',429);if(this.active(c,s)>=s.limit.concurrent)throw fault('MODEL_CONCURRENCY_LIMIT',429);}
  for(const s of list)this.db.prepare('UPDATE accounts SET reserved_cost=reserved_cost+?,reserved_tokens=reserved_tokens+? WHERE tenant=? AND period=? AND kind=? AND id=?').run(reserveCost,reserveTokens,c.tenantId,c.period,s.kind,s.id);
  const time=this.now();this.db.prepare('INSERT INTO requests(id,tenant,period,employee,bot,device,task,hash,state,route,price,scope,reserved_cost,reserved_tokens,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,c.tenantId,c.period,c.employeeId,c.botId,c.deviceId,c.taskId,h,'reserved',plan[0].id,canonical(plan.map(r=>({id:r.id,inputMicrosPerMillion:r.inputMicrosPerMillion,outputMicrosPerMillion:r.outputMicrosPerMillion,contextTokens:r.contextTokens}))),canonical(list.map(({kind,id})=>({kind,id}))),reserveCost,reserveTokens,time,time);this.audit(id,'reserve',{costMicros:reserveCost,tokens:reserveTokens});return this.request(c,id);
 });}
 attempt(c,id,route){return this.transaction(()=>{this.accept(c);const r=this.request(c,id);if(!['reserved','dispatched'].includes(r.state)||r.attempts>=c.policy.maxAttempts)throw fault('MODEL_ATTEMPT_LIMIT',429);for(const s of scopes(c)){const a=this.account(c,s);if(a.requests>=s.limit.requests)throw fault('MODEL_REQUEST_LIMIT',429);}
  for(const s of scopes(c))this.db.prepare('UPDATE accounts SET requests=requests+1 WHERE tenant=? AND period=? AND kind=? AND id=?').run(c.tenantId,c.period,s.kind,s.id);
  this.db.prepare("UPDATE requests SET state='dispatched',route=?,attempts=attempts+1,updated_at=? WHERE id=?").run(route,this.now(),id);this.audit(id,'dispatch',{route});});}
 request(c,id){const r=this.db.prepare('SELECT * FROM requests WHERE id=? AND tenant=? AND device=? AND employee=? AND bot=?').get(id,c.tenantId,c.deviceId,c.employeeId,c.botId);if(!r||r.task!==c.taskId)throw fault('MODEL_RECEIPT_NOT_FOUND',404);return r;}
 settle(c,id,{inputTokens=0,outputTokens=0,route,state='completed',error=null}={},inside=false){const apply=()=>{
  const r=this.request(c,id);if(['completed','rejected','charged_ceiling'].includes(r.state))return r;
  if(!Number.isSafeInteger(inputTokens)||!Number.isSafeInteger(outputTokens)||inputTokens<0||outputTokens<0)throw fault('MODEL_USAGE_INVALID',502);
  const charge=state==='charged_ceiling'?r.reserved_cost:cost(inputTokens,outputTokens,route),tokens=state==='charged_ceiling'?r.reserved_tokens:inputTokens+outputTokens;
  for(const s of JSON.parse(r.scope))this.db.prepare('UPDATE accounts SET reserved_cost=reserved_cost-?,reserved_tokens=reserved_tokens-?,spent_cost=spent_cost+?,spent_tokens=spent_tokens+? WHERE tenant=? AND period=? AND kind=? AND id=?').run(r.reserved_cost,r.reserved_tokens,charge,tokens,c.tenantId,r.period,s.kind,s.id);
  this.db.prepare('UPDATE requests SET state=?,input_tokens=?,output_tokens=?,charged_cost=?,updated_at=?,error=? WHERE id=?').run(state,state==='charged_ceiling'?null:inputTokens,state==='charged_ceiling'?null:outputTokens,charge,this.now(),error,id);this.audit(id,'settle',{state,chargedCostMicros:charge,tokens});return this.request(c,id);
 };return inside?apply():this.transaction(apply);}
 unknown(c,id,code){return this.transaction(()=>{const r=this.request(c,id);if(['completed','rejected','charged_ceiling'].includes(r.state))return;this.db.prepare("UPDATE requests SET state='unknown',error=?,updated_at=? WHERE id=?").run(code,this.now(),id);this.audit(id,'unknown',{code});});}
 receipt(c,id){const r=this.request(c,id);return {requestId:r.id,state:r.state,route:r.route,attempts:r.attempts,reservedCostMicros:r.reserved_cost,chargedCostMicros:r.charged_cost,inputTokens:r.input_tokens,outputTokens:r.output_tokens,error:r.error,createdAt:r.created_at,updatedAt:r.updated_at};}
 summary(c){return this.transaction(()=>{this.accept(c);return {period:c.period,currency:'USD',costUnit:'microUSD',scopes:scopes(c).map(s=>({...s,usage:this.account(c,s),active:this.active(c,s)}))};});}
 admin(p){const h=digest(p),old=this.db.prepare('SELECT * FROM admin_operations WHERE jti=?').get(p.jti);if(old){if(old.hash!==h)throw fault('MODEL_ADMIN_REPLAY_CONFLICT',409);return JSON.parse(old.result);}
  if(p.action==='apply-policy')return this.transaction(()=>{const old=this.db.prepare('SELECT * FROM policies WHERE tenant=?').get(p.tenantId),ph=digest(p.policy);if(old&&(old.revision>p.policy.revision||old.revision===p.policy.revision&&old.hash!==ph))throw fault('MODEL_POLICY_STALE',409);this.db.prepare('INSERT INTO policies VALUES(?,?,?) ON CONFLICT(tenant) DO UPDATE SET revision=excluded.revision,hash=excluded.hash').run(p.tenantId,p.policy.revision,ph);const result={policyRevision:p.policy.revision,active:p.policy.active};this.db.prepare('INSERT INTO admin_operations VALUES(?,?,?)').run(p.jti,h,canonical(result));this.audit(null,'apply_policy',{tenant:p.tenantId,revision:p.policy.revision});return result;});
  return this.transaction(()=>{const r=this.db.prepare('SELECT * FROM requests WHERE id=? AND tenant=?').get(p.requestId,p.tenantId);if(!r)throw fault('MODEL_RECEIPT_NOT_FOUND',404);if(r.state!=='unknown')throw fault('MODEL_RECEIPT_NOT_UNKNOWN',409);
   const c={tenantId:r.tenant,employeeId:r.employee,deviceId:r.device,botId:r.bot,taskId:r.task},result=this.settle(c,r.id,{state:'charged_ceiling'},true),response={requestId:r.id,state:result.state};this.db.prepare('INSERT INTO admin_operations VALUES(?,?,?)').run(p.jti,h,canonical(response));this.audit(r.id,'owner_confirmed_stopped',{reason:p.reason});return response;});
 }
 close(){this.db.close();}
}
