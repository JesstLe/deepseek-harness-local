import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Context} from '@deepseek-ai/cordis';

/** Real Cordis injection boundary; only external host services are fixture adapters. */
export async function botRuntime(module,{preset='standard',lateAgent=false,failWrite=false}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-bot-runtime-'));
  const directory=new module.BotDirectory(path.join(dir,'bots.json'));
  if(failWrite)directory.write=async()=>{throw Error('fixture disk failure');};
  const ctx=new Context(),tools=new Map(),routes=new Map(),prompts=new Map(),agents=new Map();
  const root={id:'fixture-root',session:{header:{id:'fixture-root',cwd:dir}},ctx:{
    tools:{register(tool){tools.set(tool.name,tool);return()=>tools.delete(tool.name);}},
    systemPrompt:{getSectionOrder:()=>10,getContextOrder:()=>10,
      section(value){prompts.set(value.name,value);return()=>prompts.delete(value.name);},
      context(value){prompts.set(value.name,value);return()=>prompts.delete(value.name);}},
  }};
  if(!lateAgent)agents.set(root.id,root);
  const membership=agent=>agents.get(agent.id)===agent?{root:agent,role:'lead',id:agent.id}:undefined;
  let presetReads=0;
  const services={
    agents:{list:()=>[...agents.values()]},agentTeams:{tryMembership:membership,membership(agent){const m=membership(agent);if(!m)throw Error('TEAM_NOT_MEMBER');return m;}},
    sessions:{get:id=>agents.get(id)?.session},sessionPersistence:{stat:async()=>undefined},
    tools:{},systemPrompt:{},agentPresets:{presetForSession(session){if(session!==root.session)throw Error('WRONG_SESSION');presetReads++;return preset;}},
    connection:{admit:()=>({peer:{principal:{kind:'owner'}}})},
    webServer:{register(route){routes.set(route.path,route.handler);return()=>routes.delete(route.path);}},
  };
  const provider=await ctx.plugin({name:'fixture-host-services',apply(scope){
    for(const [name,value] of Object.entries(services))scope.provide(name,value);
  }});
  // Parent matches host.js. agentPresets is deliberately NOT inherited here.
  let child;
  const parent=await ctx.plugin({name:'fixture-enterprise-host',inject:['webServer','connection'],apply(scope){child=module.installBots(scope,{directory});}});
  await child;
  if(lateAgent){agents.set(root.id,root);await ctx.serial('agent/created',{agent:root,source:'create'});}
  const dispose=async()=>{
    await parent.dispose();await provider.dispose();await directory.close();
    if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('BAD_FIXTURE_PATH');
    fs.rmSync(dir,{recursive:true,force:true});
  };
  return {root,ctx,tools,routes,prompts,directory,dir,presetReads:()=>presetReads,dispose,
    invoke:(name,input)=>tools.get(name).execute(input,{agent:root}),
  };
}
