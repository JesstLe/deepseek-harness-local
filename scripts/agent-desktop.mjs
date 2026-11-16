import {spawn} from 'node:child_process';
import {resolveDesktopRuntime} from '../plugins/naumi-enterprise/desktop-runtime.js';
const runtime=resolveDesktopRuntime();
const args=process.argv.slice(2);
const child=spawn(runtime.command,args.length?args:['status'],{stdio:'inherit',shell:false,windowsHide:true,env:{...process.env,...runtime.env}});
child.on('error',error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=signal?1:code??1;});
