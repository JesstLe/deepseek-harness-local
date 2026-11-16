import {spawn} from 'node:child_process';
import {EgoBrowserRuntime,resolveBrowserRuntime} from '../plugins/naumi-enterprise/browser-runtime.js';
const [command,...args]=process.argv.slice(2);
if(command==='status'){const state=new EgoBrowserRuntime().status();console.log(JSON.stringify(state));process.exitCode=state.status==='installed'?0:1;}
else if(command==='skill'||command==='version'){
  const runtime=resolveBrowserRuntime(),child=spawn(runtime.command,[command==='version'?'--version':'skill',...args],{stdio:'inherit',windowsHide:true,shell:false});child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
}else{console.error('Usage: node scripts/ego-browser.mjs status|skill|version');process.exitCode=2;}
