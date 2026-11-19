import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import * as filesystemSkills from '@deepseek-ai/dsh-skill-filesystem';
import {desktopMcpConfig,desktopSkillConfig} from './desktop-runtime.js';

/** Add desktop tools through existing Harness bridges; do not change execution/permission policy. */
export function installAgentDesktop(ctx) {
  let mcp;
  try{mcp=desktopMcpConfig();}
  catch(error){ctx.logger?.warn('Naumi desktop integration not ready: '+error.message);return()=>{};}
  return ctx.inject(['tools','skills'],scope=>{
    scope.plugin(mcpClient,mcp);
    scope.plugin(filesystemSkills,desktopSkillConfig());
    scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/desktop',handler:async(req,res)=>{
      res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
      const send=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
      const admission=scope.connection.admit(req);
      if('rejection'in admission){send(admission.rejection,{error:'HARNESS_AUTH_REQUIRED'});return;}
      if(admission.peer.principal.kind!=='owner'){send(403,{error:'HARNESS_OWNER_REQUIRED'});return;}
      if(req.method!=='GET'){res.setHeader('Allow','GET');send(405,{error:'READ_ONLY'});return;}
      const tools=scope.tools.definitions().filter(t=>t.name.startsWith('mcp__naumi_desktop__'));
      const ready=tools.some(t=>t.name==='mcp__naumi_desktop__desktop_status');
      send(ready?200:503,{status:ready?'ready':'connecting',version:'1.3.1',transport:'stdio',namespace:'naumi_desktop',toolCount:tools.length,physicalInputDefault:false});
    }}));
  });
}
