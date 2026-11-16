import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolveBrowserRuntime} from '../plugins/naumi-enterprise/browser-runtime.js';
const runtime=resolveBrowserRuntime(),archive=path.join(runtime.root,`runtime/ego-lite-win32-x64-${runtime.version}.zip`);
const code=`import sys,zipfile,pathlib
root=pathlib.Path(sys.argv[1]);dest=pathlib.Path(sys.argv[2]);files=sorted(root.rglob('*'))
with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in files:
  if p.is_symlink(): raise RuntimeError('Runtime symlinks are not packaged')
  if p.is_file():
   if p.name in ('Cookies','History','Login Data','Preferences','Local State'): raise RuntimeError('Personal profile in runtime')
   z.write(p,'Application/'+p.relative_to(root).as_posix())
with zipfile.ZipFile(dest) as z:
 assert z.testzip() is None
 print('EGO_OFFLINE_ARCHIVE files='+str(len(z.namelist()))+' crc=pass personal_profile=0')`;
const result=spawnSync('python',['-c',code,runtime.app,archive],{stdio:'inherit',windowsHide:true,shell:false});if(result.status!==0)throw Error('EGO_ARCHIVE_BUILD_FAILED');
const hash=createHash('sha256');for await(const chunk of fs.createReadStream(archive))hash.update(chunk);const sha256=hash.digest('hex');fs.writeFileSync(archive+'.sha256',sha256+'\n');
fs.writeFileSync('evidence/ego-lite/OFFLINE_PACKAGE.json',JSON.stringify({archive:path.relative(runtime.root,archive).replaceAll('\\','/'),version:runtime.version,sha256,bytes:fs.statSync(archive).size,personalProfileIncluded:false},null,2)+'\n');
console.log('EGO_OFFLINE_ARCHIVE sha256='+sha256+' bytes='+fs.statSync(archive).size);
