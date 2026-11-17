import {z} from 'zod';
import {createHash,randomUUID} from 'node:crypto';
import {assertPublicText} from './employee-store.js';
export const observationReport=z.object({state:z.enum(['working','waiting_user','waiting_dependency','model_unavailable','blocked']),note:z.string().trim().max(1000),operationId:z.string().min(1).max(200)}).strict();
const entityId=sessionId=>'observation-'+createHash('sha256').update(sessionId).digest('hex');
/** Agent status is activity, reports are attributed, only persisted artifact/review events are progress. */
export class EmployeeObservation{
  constructor({store,directory,agents,noProgressMs=1800000}){Object.assign(this,{store,directory,agents,noProgressMs});}
  record(agent,state,{report,operationId}={}){
    const bot=this.directory.forSession(agent.id);if(!bot||bot.status!=='active')return;
    const id=entityId(agent.id),old=this.store.entity(bot.id,id),time=this.store.now();
    // A duplicate running event must not reset the no-progress clock; idle must not erase a fault/report.
    if(!report&&old?.runtimeState===state)return;
    const next={...old,id,botId:bot.id,sessionId:agent.id,revision:(old?.revision??0)+1,runtimeState:state,observedAt:time,
      activeSince:state==='running'?(old?.runtimeState==='running'?old.activeSince:time):old?.activeSince??null,
      ...(state==='running'&&old?.runtimeState!=='running'?{report:null,faultAt:null}:{}),
      ...(state==='fault'?{faultAt:time,faultCode:'AGENT_EXECUTION_ERROR'}:{}),
      ...(report?{faultAt:null,report:{state:report.state,note:report.note,reportedAt:time,source:'agent_report'}}:{}),
    };
    const source={kind:'agent',sessionId:agent.id,note:report?'Self-reported work state, not verified progress':'Observed native Agent lifecycle'};
    return this.store.mutate(bot.id,operationId??'observe:'+randomUUID(),'activity_observe',{sessionId:agent.id,state,...(report?{report}: {})},source,()=>this.store.put(next,'activity_observation','activity_observe',source));
  }
  report(agent,args){args=observationReport.parse(args);assertPublicText(args.note);return this.record(agent,agent.status,{report:args,operationId:args.operationId});}
  read(botId){
    const now=this.store.clock().getTime(),sessions=this.store.entitiesOfType(botId,'activity_observation');
    const row=this.store.db.prepare("SELECT seq,json,type FROM events WHERE bot_id=? AND type IN ('artifact','review') ORDER BY seq DESC LIMIT 1").get(botId),event=row?JSON.parse(row.json):null;
    const progress=event?{at:event.occurredAt,eventSeq:row.seq,entityId:event.entityId,kind:row.type,action:event.action}:null;
    return {domain:'local-owner',progress,sessions:sessions.map(s=>{
      const agent=this.agents.get(s.sessionId),runtimeState=agent?.status??'unknown',report=s.report??null;
      const own=this.store.db.prepare("SELECT seq,json,type FROM events WHERE bot_id=? AND type='artifact' AND json_extract(json,'$.source.sessionId')=? ORDER BY seq DESC LIMIT 1").get(botId,s.sessionId),ownEvent=own?JSON.parse(own.json):null;
      const sessionProgress=ownEvent?{at:ownEvent.occurredAt,eventSeq:own.seq,entityId:ownEvent.entityId,kind:own.type}:null;
      const basis=Math.max(Date.parse(s.activeSince??'')||0,Date.parse(sessionProgress?.at??'')||0);
      // An explicit waiting report or a native fault is not generic stalled execution.
      const fault=!!s.faultAt;
      const workState=fault?'fault':report?.state??(runtimeState==='running'?'working':runtimeState);
      return {...s,runtimeState,workState,noProgress:runtimeState==='running'&&workState==='working'&&basis>0&&now-basis>=this.noProgressMs,lastProgressAt:sessionProgress?.at??null,progress:sessionProgress};
    }),noProgressAfterMs:this.noProgressMs,heartbeatIsProgress:false};
  }
}
