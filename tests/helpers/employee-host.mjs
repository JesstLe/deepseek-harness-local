import path from 'node:path';
import {botTaskHost} from './bot-task-host.mjs';
import {EmployeeStore} from '../../plugins/naumi-enterprise/employee-store.js';
import {installEmployees} from '../../plugins/naumi-enterprise/employees.js';

export async function employeeHost(){
  const f=await botTaskHost(),store=new EmployeeStore(path.join(f.dir,'employees.sqlite'));let runtime,child;
  const host=await f.ctx.plugin({name:'employee-host-fixture',inject:['webServer','connection'],apply(scope){child=installEmployees(scope,f.directory,{store,onReady:value=>{runtime=value;}});}});await child;
  return {...f,store,runtime,
    async command(body){const response=await fetch(f.origin+'/naumi/employee-work',{method:'POST',headers:{cookie:'fixture-owner',origin:f.origin,'Content-Type':'application/json','x-naumi-employee-work':'1'},body:JSON.stringify(body)});return {status:response.status,value:await response.json()};},
    async cleanup(){await host.dispose();await f.cleanup();},
  };
}
