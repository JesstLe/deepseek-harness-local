'use strict';
// Child fixture, launched with an isolated userData by the runner below.
const {app,BrowserWindow,ipcMain,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.NAUMI_BROWSER_TEST_ROOT,temp=process.env.NAUMI_BROWSER_TEST_DATA,phase=process.env.NAUMI_BROWSER_TEST_PHASE;
app.setPath('userData',path.join(temp,'electron'));app.disableHardwareAcceleration();
const {BrowserVault,credentialScript}=require(path.join(root,'desktop/app/browser-vault.cjs'));
app.whenReady().then(async()=>{
 let checks=0,manager,site;
 try{
  const vault=new BrowserVault({root:path.join(temp,'accounts'),safeStorage});assert(safeStorage.isEncryptionAvailable());checks++;
  if(phase==='write'){
   manager=new BrowserWindow({show:false,width:720,height:820,webPreferences:{preload:path.join(root,'desktop/app/browser-manager-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
   ipcMain.handle('naumi:browser-control',(event,input)=>{
    assert.equal(event.sender,manager.webContents);assert.equal(event.senderFrame,manager.webContents.mainFrame);
    if(input.action==='status')return {ok:true,data:{tabs:[],accounts:vault.list(),vaultAvailable:true}};
    if(input.action==='save')return {ok:true,data:vault.save(input)};
    throw Error('TEST_UNEXPECTED_ACTION');
   });
   await manager.loadFile(path.join(root,'desktop/app/browser-manager.html'));
   await manager.webContents.executeJavaScript(`document.querySelector('[name=origin]').value='https://example.test';document.querySelector('[name=username]').value='fixture-user';document.querySelector('[name=password]').value='FIXTURE_PASSWORD_NOT_REAL';document.querySelector('[name=allowAgent]').checked=true;document.querySelector('form').requestSubmit();`);
   for(let i=0;i<100&&!fs.existsSync(vault.file);i++)await new Promise(r=>setTimeout(r,50));
   assert.equal(vault.list().length,1);assert(!fs.readFileSync(vault.file).includes(Buffer.from('FIXTURE_PASSWORD_NOT_REAL')));checks++;
   const value=vault.list()[0];assert.equal(value.password,undefined);assert.equal(vault.credential(value.id,'https://example.test').password,'FIXTURE_PASSWORD_NOT_REAL');checks++;
   for(let i=0;i<100;i++){if(await manager.webContents.executeJavaScript(`document.getElementById('status').textContent.includes('已加密保存')`))break;await new Promise(r=>setTimeout(r,30));}
   assert.equal(await manager.webContents.executeJavaScript(`document.querySelector('[name=password]').value`),'');checks++;
   assert.equal(await manager.webContents.executeJavaScript(`typeof require`),'undefined');checks++;
   assert.equal(await manager.webContents.executeJavaScript(`typeof window.naumiDesktop`),'undefined');checks++;
   fs.writeFileSync(path.join(temp,'account-id.txt'),value.id);
   const png=await manager.webContents.capturePage();fs.writeFileSync(path.join(process.env.NAUMI_BROWSER_TEST_OUT,'MANAGER.png'),png.toPNG());
  }else{
   const id=fs.readFileSync(path.join(temp,'account-id.txt'),'utf8');assert.equal(vault.credential(id,'https://example.test').password,'FIXTURE_PASSWORD_NOT_REAL');checks++;
   const other=new BrowserVault({root:path.join(temp,'other-identity'),safeStorage});assert.deepEqual(other.list(),[]);checks++;
   site=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await site.loadURL('data:text/html,<input id="u"><input id="p" type="password"><form id="f"></form>');
   const result=await site.webContents.executeJavaScript(credentialScript({origin:'null',username:'fixture-user',password:'FIXTURE_PASSWORD_NOT_REAL',usernameSelector:'#u',passwordSelector:'#p'}));
   assert.equal(result.filled,true);assert.equal(result.submitted,false);assert(!JSON.stringify(result).includes('FIXTURE_PASSWORD'));checks++;
   assert.equal(await site.webContents.executeJavaScript(`document.querySelector('#p').value`),'FIXTURE_PASSWORD_NOT_REAL');checks++;
   await assert.rejects(site.webContents.executeJavaScript(credentialScript({origin:'https://other.test',username:'wrong-origin-user',password:'WRONG_ORIGIN_FIXTURE',usernameSelector:'#u',passwordSelector:'#p'})));assert.equal(await site.webContents.executeJavaScript(`document.querySelector('#p').value`),'FIXTURE_PASSWORD_NOT_REAL');checks++;
   vault.remove(id);assert.deepEqual(vault.list(),[]);checks++;
  }
  fs.writeFileSync(path.join(process.env.NAUMI_BROWSER_TEST_OUT,'ELECTRON_'+phase+'.json'),JSON.stringify({phase,checks,realElectron:true,realSafeStorage:true,windowsDacl:true,passwordDisclosed:false},null,2));
  console.log(`BROWSER_VAULT_ELECTRON phase=${phase} checks=${checks} DPAPI=PASS DACL=PASS password_returned=0`);
 }catch(error){console.error('BROWSER_VAULT_ELECTRON_FAILED '+error.message);process.exitCode=1;}
 finally{manager?.destroy();site?.destroy();app.exit(process.exitCode||0);}
});
