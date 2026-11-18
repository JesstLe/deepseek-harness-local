import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,randomBytes,createCipheriv,createDecipheriv,createPublicKey} from 'node:crypto';

// Current installer target is Windows. No plaintext fallback for device secrets.
export class EmployeeDeviceVault {
  constructor(file,{protect,unprotect}={}){this.file=file;this.protect=protect??(value=>dpapi(value,false));this.unprotect=unprotect??(value=>dpapi(value,true));}
  open(){
    if(this.value)return this.value;
    if(fs.existsSync(this.file)){
      this.value=JSON.parse(this.unprotect(fs.readFileSync(this.file,'utf8')));
      if(this.value.v!==1||!this.value.privateKey||!this.value.dataKey)throw Error('EMP_DEVICE_VAULT_INVALID');
      const pub=createPublicKey(this.value.privateKey).export({type:'spki',format:'pem'}).toString();
      if(pub!==this.value.publicKey)throw Error('EMP_DEVICE_VAULT_INVALID');
      return this.value;
    }
    const {privateKey,publicKey}=generateKeyPairSync('ed25519');
    const value={v:1,privateKey:privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicKey:publicKey.export({type:'spki',format:'pem'}).toString(),dataKey:randomBytes(32).toString('base64')};
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const encrypted=this.protect(JSON.stringify(value)),tmp=this.file+'.tmp';
    fs.writeFileSync(tmp,encrypted,{mode:0o600,flag:'wx'});fs.renameSync(tmp,this.file);this.value=value;return value;
  }
  seal(value){const key=Buffer.from(this.open().dataKey,'base64'),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});}
  unseal(value){const v=JSON.parse(value);if(v.v!==1)throw Error('EMP_DEVICE_VAULT_INVALID');const decipher=createDecipheriv('aes-256-gcm',Buffer.from(this.open().dataKey,'base64'),Buffer.from(v.iv,'base64'));decipher.setAuthTag(Buffer.from(v.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(v.data,'base64')),decipher.final()]).toString('utf8'));}
}
function dpapi(value,decode){
  if(process.platform!=='win32')throw Error('EMP_OS_VAULT_REQUIRED');
  const program=`Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=${decode?'[Convert]::FromBase64String($s)':'[Text.Encoding]::UTF8.GetBytes($s)'}; $r=[Security.Cryptography.ProtectedData]::${decode?'Unprotect':'Protect'}($b,[Text.Encoding]::UTF8.GetBytes('Naumi.employee.device.v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write(${decode?'[Text.Encoding]::UTF8.GetString($r)':'[Convert]::ToBase64String($r)'})`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(program,'utf16le').toString('base64')],{input:value,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:2*1024*1024});
  if(result.status!==0||!result.stdout)throw Error('EMP_OS_VAULT_UNAVAILABLE');return result.stdout.trim();
}
