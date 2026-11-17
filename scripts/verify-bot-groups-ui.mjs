import {execFileSync} from 'node:child_process';import path from 'node:path';import {pathToFileURL} from 'node:url';
execFileSync(process.execPath,['scripts/render-unified-chat.mjs'],{stdio:'inherit'});
const code="await import('"+pathToFileURL(path.resolve('scripts/verify-unified-chat-ui.mjs')).href+"')";
if(process.platform==='win32')execFileSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-Command','& ego-browser nodejs -e "'+code+'"'],{stdio:'inherit',windowsHide:true});
else execFileSync('ego-browser',['nodejs','-e',code],{stdio:'inherit'});
