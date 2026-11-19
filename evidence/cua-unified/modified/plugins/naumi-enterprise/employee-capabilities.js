import {resolveDesktopRuntime} from './desktop-runtime.js';
import {NativeBrowserRuntime} from './native-browser-runtime.js';
import {dingTalkHealth} from './dingtalk-runtime.js';

/** A tool definition is not proof of tool authorization, transport health, or business account access. */
export class EmployeeCapabilities{
  constructor({ctx,sync,home,clock=()=>Date.now(),browser,desktop=()=>resolveDesktopRuntime(),dingtalk=()=>dingTalkHealth({home})}={}){
    Object.assign(this,{ctx,sync,clock,desktop,dingtalk});this.browser=browser??new NativeBrowserRuntime({home});this.values=new Map();this.closed=false;
  }
  async refresh(){
    if(this.closed)return;if(this.flight)return this.flight;
    this.flight=this.probe().finally(()=>{this.flight=null;});return this.flight;
  }
  async probe(){
    const checkedAt=new Date(this.clock()).toISOString(),base={connected:null,authorized:null,healthy:null,lastChecked:checkedAt,staleAfterMs:180000,authorizationScope:'unknown'};
    const save=(id,value)=>this.values.set(id,{id,...base,...value});
    let desktop;try{desktop=this.desktop();}catch{}
    let names=[];try{names=(this.ctx.tools.definitions?.()??[]).map(t=>t.name);}catch{}
    const registered=names.includes('naumi_cua');
    save('desktop',{installed:!!desktop,version:desktop?.version??null,toolRegistered:registered,reasonCode:!desktop?'DESKTOP_BUNDLE_INVALID':registered?'DESKTOP_HEALTH_NOT_PROBED':'DESKTOP_TOOL_NOT_REGISTERED'});
    const health=await this.browser.health();
    save('browser',{installed:health.installed,connected:health.connected,healthy:health.healthy,toolRegistered:names.includes('naumi_browser'),engine:health.engine,reasonCode:health.reasonCode});
    // This inventory concerns the distributed bundle, not every executable elsewhere on this machine.
    save('dingtalk',await this.dingtalk());
    save('enterprise',{installed:!!this.sync,connected:null,reasonCode:this.sync?'ENTERPRISE_CONNECTIVITY_NOT_PROBED':'ENTERPRISE_NOT_CONFIGURED'});
  }
  read(botId){
    // Backend starts before the GUI bridge. Refresh immediately when the descriptor arrives/restarts.
    let stamp=null;try{const d=this.browser.descriptor?.();stamp=d?`${d.pid}:${d.port}`:null;}catch{}
    if(stamp!==this.bridgeStamp){this.bridgeStamp=stamp;void this.refresh().catch(()=>{});}
    const records=[...this.values.values()].map(v=>({...v,stale:this.clock()-Date.parse(v.lastChecked)>v.staleAfterMs}));
    const enterprise=records.find(r=>r.id==='enterprise');
    if(enterprise&&this.sync){
      try{const claims=this.sync.offlineClaims(),bound=claims.bindings.some(b=>b.localBotId===botId);enterprise.authorized=bound;enterprise.authorizationScope='signed_device_bot_binding';enterprise.authorizationExpiresAt=claims.expiresAt;enterprise.reasonCode=bound?'ENTERPRISE_LIVE_RBAC_CHECK_REQUIRED':'EMP_DEVICE_BINDING_REQUIRED';}
      catch(e){enterprise.authorized=false;enterprise.authorizationScope='signed_device_bot_binding';enterprise.reasonCode=/^EMP_[A-Z_]+$/.test(e.message)?e.message:'EMP_AUTHORIZATION_UNKNOWN';}
    }
    return {domain:'local-owner',records,checking:!!this.flight,toolPermissionNotInferred:true};
  }
  async close(){this.closed=true;await this.flight?.catch(()=>{});await this.browser.dispose();}
}
