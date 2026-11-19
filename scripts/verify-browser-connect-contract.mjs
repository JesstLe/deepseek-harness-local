// Source capability regression. Functional execution is tested separately.
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(process.argv[2]||'.'),read=p=>{try{return fs.readFileSync(path.join(root,p),'utf8');}catch{return '';}};
const main=read('desktop/app/main.cjs'),native=read('desktop/app/tools.cjs'),tool=read('plugins/naumi-enterprise/browser-runtime.js'),worker=read('desktop/app/browser-extension/worker.js');
const checks=[
 ['persistent-native-profile-preserved',read('desktop/app/policy.cjs').includes('persist:naumi-browser-')],
 ['existing-tab-connection',read('desktop/app/browser-external.cjs').includes('class ExternalBrowserHub')],
 ['encrypted-exact-origin-account-vault',read('desktop/app/browser-vault.cjs').includes('encryptString')&&read('desktop/app/browser-vault.cjs').includes('value.origin!==website(origin)')],
 ['same-agent-tool-accounts-and-login',tool.includes("'accounts','login'")],
 ['native-bridge-composition',native.includes('await browserConnections.start(native)')],
 ['trusted-native-manager',main.includes("ipcMain.handle('naumi:browser-control'")&&main.includes('e.senderFrame!==browserManager.webContents.mainFrame')],
 ['real-extension-official-attach',worker.includes('chrome.debugger.attach')&&worker.includes('chrome.tabs.query')],
 ['no-replay-and-preserved-user-tabs',read('desktop/app/browser-external.cjs').includes('userTabsClosed:false,cookiesCleared:false')&&worker.includes("'/permit'")],
];
const failed=checks.filter(x=>!x[1]);for(const [name]of failed)console.log('MISSING '+name);
console.log(`BROWSER_CONNECT_CONTRACT passed=${checks.length-failed.length} failed=${failed.length} checks=${checks.length}`);process.exitCode=failed.length?1:0;
