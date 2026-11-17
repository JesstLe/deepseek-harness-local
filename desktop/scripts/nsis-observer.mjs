import fs from 'node:fs';
import path from 'node:path';

// NSIS launchers can exit before their self-copied uninstall process finishes.
// An observation timeout never authorizes a second launch.
export function createUninstallObserver({launch,isDirectoryAbsent,isEnvironmentRestored,checkpoint=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}) {
  let started=false,completed=false;
  return {
    get started(){return started;},
    get completed(){return completed;},
    async run(timeout=300000){
      if(completed)return;
      if(!started){started=true;checkpoint({uninstallStarted:true});await launch();checkpoint({uninstallLauncherReturned:true});}
      const end=now()+timeout;
      while(now()<end){
        if(await isDirectoryAbsent() && await isEnvironmentRestored()){
          completed=true;checkpoint({uninstallCompleted:true});return;
        }
        await sleep(500);
      }
      checkpoint({uninstallObservationTimeout:true});
      throw Error('NSIS_UNINSTALL_OBSERVATION_TIMEOUT');
    }
  };
}

export function writeCheckpoint(file,value){
  const pending=file+'.pending';
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(pending,JSON.stringify(value,null,2)+'\n');
  fs.renameSync(pending,file);
}
