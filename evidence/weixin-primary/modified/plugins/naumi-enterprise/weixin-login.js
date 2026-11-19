import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {WEIXIN_BASE,weixinBase,weixinRequest} from './weixin-api.js';
const command=z.discriminatedUnion('action',[
 z.object({action:z.literal('weixin-start'),expectedRevision:z.number().int().nonnegative()}).strict(),
 z.object({action:z.enum(['weixin-poll','weixin-cancel']),loginId:z.uuid()}).strict(),
 z.object({action:z.literal('weixin-code'),loginId:z.uuid(),code:z.string().regex(/^\d{4,12}$/)}).strict(),
]);
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\x00-\x20\x7f]/.test(v);
export class WeixinLogin{
 constructor(service,{request=weixinRequest,now=Date.now}={}){this.s=service;this.request=request;this.now=now;this.current=null;}
 serial(fn){const run=this.s.serial.then(fn);this.s.serial=run.catch(()=>{});return run;}
 view(v){return v?{loginId:v.id,status:v.status,expires:v.expires,...v.qr?{qr:v.qr}:{}}:null;}
 async execute(input){const p=command.parse(input);
  if(p.action==='weixin-start')return this.serial(async()=>{
   if(this.s.closed)throw Error('IM_CLOSED');if(this.s.store.revision()!==p.expectedRevision)throw Error('IM_CONFLICT');
   const primary=this.s.directory.primary?.();if(!primary)throw Error('IM_PRIMARY_REQUIRED');
   this.close();const ac=new AbortController(),v={id:randomUUID(),status:'starting',expires:this.now()+300000,revision:p.expectedRevision,primaryId:primary.id,baseURL:WEIXIN_BASE,ac};this.current=v;
   try{const r=await this.request({path:'ilink/bot/get_bot_qrcode?bot_type=3',body:{local_token_list:[]},signal:ac.signal,timeoutMs:15000});
    if(this.current!==v||this.s.closed)throw Error('IM_WEIXIN_CANCELLED');if(typeof r.qrcode!=='string'||r.qrcode.length>4096||typeof r.qrcode_img_content!=='string'||r.qrcode_img_content.length>4096)throw Error('IM_WEIXIN_QR_INVALID');
    const u=new URL(r.qrcode_img_content);if(u.protocol!=='https:'||u.username||u.password||!(u.hostname==='weixin.qq.com'||u.hostname.endsWith('.weixin.qq.com')))throw Error('IM_WEIXIN_QR_INVALID');
    Object.assign(v,{qrcode:r.qrcode,qr:r.qrcode_img_content,status:'wait'});return{login:this.view(v)};
   }catch(e){if(this.current===v)this.close();throw e;}
  });
  const v=this.current;if(!v||v.id!==p.loginId||v.expires<=this.now())throw Error('IM_WEIXIN_LOGIN_EXPIRED');
  if(p.action==='weixin-cancel'){this.close();return{login:null};}
  if(p.action==='weixin-code'){v.code=p.code;return{login:this.view(v)};}
  if(v.flight)return v.flight;
  v.flight=this.poll(v).finally(()=>{v.flight=null;});return v.flight;
 }
 async poll(v){
  const r=await this.request({baseURL:v.baseURL,path:'ilink/bot/get_qrcode_status?qrcode='+encodeURIComponent(v.qrcode)+(v.code?'&verify_code='+encodeURIComponent(v.code):''),signal:v.ac.signal,timeoutMs:38000});
  if(this.current!==v||this.s.closed)throw Error('IM_WEIXIN_CANCELLED');
  if(r.status==='scaned_but_redirect'){v.baseURL=weixinBase('https://'+r.redirect_host);v.status='scaned';return{login:this.view(v)};}
  if(['wait','scaned','need_verifycode','verify_code_blocked'].includes(r.status)){v.status=r.status;if(r.status==='scaned')delete v.code;return{login:this.view(v)};}
  if(r.status!=='confirmed'){v.status=r.status==='binded_redirect'?'already-bound':'expired';return{login:this.view(v)};}
  if(!validId(r.ilink_bot_id)||!validId(r.ilink_user_id)||typeof r.bot_token!=='string'||!r.bot_token||r.bot_token.length>16000)throw Error('IM_WEIXIN_IDENTITY_REQUIRED');
  const baseURL=weixinBase(r.baseurl??v.baseURL);
  return this.serial(async()=>{
   if(this.current!==v||v.ac.signal.aborted||this.s.closed)throw Error('IM_WEIXIN_CANCELLED');
   if(this.s.store.revision()!==v.revision)throw Error('IM_CONFLICT');if(this.s.directory.primary?.()?.id!==v.primaryId)throw Error('IM_PRIMARY_CHANGED');
   if(this.s.store.connections().some(c=>c.platform==='weixin'&&c.enabled))throw Error('IM_WEIXIN_ALREADY_CONNECTED');
   const ref='NAUMI_WEIXIN_'+randomUUID().replaceAll('-','').toUpperCase(),id=randomUUID();await this.s.credentials.set(ref,r.bot_token);
   try{if(this.current!==v||v.ac.signal.aborted||v.expires<=this.now()||this.s.closed)throw Error('IM_WEIXIN_CANCELLED');if(this.s.directory.primary?.()?.id!==v.primaryId)throw Error('IM_PRIMARY_CHANGED');this.s.store.configure(v.revision,()=>{
    this.s.store.saveConnection({id,platform:'weixin',name:'我的微信',appId:r.ilink_bot_id,domain:'weixin',baseURL,ownerUserId:r.ilink_user_id,primaryId:v.primaryId,secretRef:ref,enabled:true});
    this.s.store.saveBinding({id:randomUUID(),connectionId:id,chat:{key:r.ilink_user_id,kind:'direct',title:'我的微信'},target:{kind:'bot',id:v.primaryId},users:[r.ilink_user_id],active:true,revision:1,sessionId:'session-'+randomUUID(),createdAt:new Date().toISOString()});
   });}catch(e){await this.s.credentials.unset(ref);throw e;}
   this.close();await this.s.sync();return{login:{status:'connected'},...await this.s.read()};
  });
 }
 close(){this.current?.ac.abort();this.current=null;}
}
