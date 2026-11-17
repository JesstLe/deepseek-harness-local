import {z} from 'zod';
import {appendPluginRecord,pluginRecordOf} from '@deepseek-ai/dsh-session';
import {defineTool} from '@deepseek-ai/dsh-tools';

export const TEAM_PROFILE_EVENT='plugin:naumi/team-profile';
const nameSchema=z.string().trim().min(1).max(80).refine(value=>!/[\u0000-\u001f\u007f]/u.test(value));
const recordSchema=z.object({teamId:z.string().min(1),revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),name:nameSchema,updatedAt:z.string().datetime()}).strict();
const stateSchema=z.object({teamId:z.string(),revision:z.number().int().nonnegative(),name:z.string().nullable(),updatedAt:z.string().nullable(),failure:z.string().optional()});

/** Team identity stays the root Session ID. A fork never inherits another team's display identity. */
export const teamProfileProjection={
  key:'naumiTeamProfile',stateVersion:1,stateSchema,
  init:header=>({teamId:header.id,revision:0,name:null,updatedAt:null}),
  apply(state,event){
    const record=pluginRecordOf(event);
    if(record?.type!==TEAM_PROFILE_EVENT||record.data?.teamId!==state.teamId||state.failure)return state;
    const parsed=recordSchema.safeParse(record.data);
    if(!parsed.success||parsed.data.revision!==state.revision+1)return {...state,failure:'TEAM_PROFILE_INVALID_RECORD'};
    return parsed.data;
  },
  wire:{viewSchema:stateSchema,view:state=>state},
};

/** Serialized CAS on a plugin-owned record, never a rename of model-addressable team/member IDs. */
export function createTeamProfileService(ctx,projection,{append=appendPluginRecord,now=()=>new Date().toISOString()}={}){
  const tails=new Map();let closed=false;
  const membership=agent=>{if(closed)throw Error('TEAM_PROFILE_CLOSED');if(!agent)throw Error('TEAM_PROFILE_CALLER_REQUIRED');return ctx.agentTeams.membership(agent);};
  const state=root=>{const value=projection.stateOf(root.session);if(value.failure)throw Error(value.failure);return value;};
  const serial=(id,operation)=>{
    const run=(tails.get(id)??Promise.resolve()).then(operation);
    const tail=run.then(()=>{},()=>{});tails.set(id,tail);
    return run.finally(()=>{if(tails.get(id)===tail)tails.delete(id);});
  };
  return {
    async read(agent){const {root}=membership(agent);await ctx.sessions.flush(root.session);return {...state(root)};},
    update(agent,args,{signal}={}){
      const initial=membership(agent);
      if(initial.role!=='lead')throw Error('TEAM_PROFILE_LEAD_REQUIRED');
      const name=nameSchema.parse(args.name);
      if(!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision<0)throw Error('TEAM_PROFILE_REVISION_REQUIRED');
      return serial(initial.id,async()=>{
        signal?.throwIfAborted();
        const current=membership(agent);
        if(current.role!=='lead'||current.id!==initial.id)throw Error('TEAM_PROFILE_IDENTITY_CHANGED');
        // A previously failed checkpoint must settle before accepting another revision.
        await ctx.sessions.flush(current.root.session);signal?.throwIfAborted();
        const previous=state(current.root);
        if(previous.revision!==args.expectedRevision)throw Error('TEAM_PROFILE_CONFLICT');
        if(previous.name===name)return {...previous};
        const value=recordSchema.parse({teamId:current.id,revision:previous.revision+1,name,updatedAt:now()});
        append(current.root.session,TEAM_PROFILE_EVENT,value);
        // Success means persistence acknowledged the record, not merely a local label change.
        await ctx.sessions.flush(current.root.session);
        return {...state(current.root)};
      });
    },
    async dispose(){closed=true;await Promise.all([...tails.values()]);},
  };
}

export function createTeamProfileTools(service){
  const output={schema:{type:'json'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
  return [
    defineTool({name:'team_profile_get',description:'Read this Agent Team\'s persistent display name and revision. Team identity, members and their tool addresses are unchanged.',parameters:{},output,execute:(_args,exec)=>service.read(exec.agent)}),
    defineTool({name:'team_profile_update',description:'The Team Lead chooses or updates its own team display name for the current work. Read team_profile_get first and use its exact revision. This changes only display metadata, never team/member IDs, permissions, prompts or model selection.',parameters:{name:{type:'string',required:true,description:'A concise team name chosen by the Lead for the actual work, in the user\'s language. No preset team types.'},expectedRevision:{type:'integer',required:true,description:'Revision from team_profile_get; 0 for an unnamed team.'}},output,execute:(args,exec)=>service.update(exec.agent,args,{signal:exec.signal})}),
  ];
}

/** Tools follow the original Team service's exact Agent membership and lifecycle. No browser write endpoint. */
export function installTeamProfile(ctx){
  return ctx.inject(['agents','agentTeams','sessions','sessionPersistence','sessionProjections','tools','systemPrompt'],async scope=>{
    const projection=await scope.sessionProjections.register(teamProfileProjection);
    const service=createTeamProfileService(scope,projection),installed=new Map();
    const install=agent=>{
      if(installed.has(agent)||!scope.agentTeams.tryMembership(agent))return;
      const disposers=[];
      try{
        for(const tool of createTeamProfileTools(service))disposers.push(agent.ctx.tools.register(tool));
        disposers.push(agent.ctx.systemPrompt.section({name:'naumi:team-profile',order:agent.ctx.systemPrompt.getSectionOrder('TEAM_POLICY')+1,text:'When organizing a team for the user\'s task, the Team Lead autonomously chooses and maintains a concise team name using team_profile_get and team_profile_update. Use the user\'s language and the actual work; do not select from fixed team categories. Reuse an existing appropriate name. Members, responsibilities and assignments remain managed through the existing Team tools. Do not create teammates just to populate the UI. A teammate may read the profile; only the Lead may update it. The name is display metadata, not a tool address.'}));
        installed.set(agent,()=>{for(const dispose of disposers.reverse())dispose();});
      }catch(error){for(const dispose of disposers.reverse())dispose();throw error;}
    };
    scope.on('agent/created',({agent})=>install(agent));
    scope.on('agent/disposed',({agent})=>{installed.get(agent)?.();installed.delete(agent);});
    scope.effect(()=>async()=>{for(const dispose of installed.values())dispose();installed.clear();await service.dispose();});
    for(const agent of scope.agents.list())install(agent);
  });
}
