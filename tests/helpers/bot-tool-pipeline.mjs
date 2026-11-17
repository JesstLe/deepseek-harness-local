import {ToolExecutionPipeline,executeToolBatch} from '@deepseek-ai/dsh-tools/pipeline';

// Real native output validation/render/materialization, without model/network calls.
export async function runBotTool(tools,agent,name,args={}){
  const registry={executable:n=>tools.find(t=>t.name===n),checkGuards:()=>undefined};
  const ctx={tools:registry,waterfall:async(...args)=>args.at(-1)(),events:{dispatch:()=>[]},logger:{warn:()=>{}}};
  const batch=await executeToolBatch({calls:[{type:'tool-call',id:'integrity-call',name,arguments:JSON.stringify(args)}],agent,signal:new AbortController().signal},new ToolExecutionPipeline(ctx),()=>1);
  return batch.results[0].result;
}
