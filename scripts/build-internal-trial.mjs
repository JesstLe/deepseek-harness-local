// Local-only internal distribution. Source must be a fixed main snapshot.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {exportTrialInput} from '../desktop/scripts/internal-trial-models.mjs';
import {prepareRuntime} from '../desktop/scripts/prepare-runtime.mjs';
import {buildDesktop} from '../desktop/scripts/build-desktop.mjs';
const root=process.cwd(),home=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
assert(home&&out&&process.argv.length===4,'Usage: node scripts/build-internal-trial.mjs SOURCE_HOME OUTPUT_DIRECTORY');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim(),source=git('rev-parse','HEAD');
assert.equal(git('status','--porcelain','--untracked-files=no'),'','TRIAL_DIRTY_SOURCE');assert.equal(source,git('rev-parse','main'),'TRIAL_BUILD_REQUIRES_FIXED_MAIN');
const privateDir=path.join(root,'runtime/internal-trial-private');fs.mkdirSync(privateDir,{recursive:true});
const input=path.join(privateDir,'models-'+Date.now()+'.json');const selected=exportTrialInput(home,input);
console.log('TRIAL_MODEL_EXPORT groups='+selected.groups+' models='+selected.models+' source_unchanged=1');
for(const script of ['scripts/build-naumi-layout.mjs','scripts/build-naumi-browser.mjs','desktop/scripts/build-icons.mjs','desktop/scripts/build-installer-ui.mjs'])execFileSync(process.execPath,[script],{stdio:'inherit',windowsHide:true});
await prepareRuntime({trialInput:input});
await buildDesktop(['--internal-trial','--output='+out]);
fs.writeFileSync(path.join(out,'TRIAL_BUILD.json'),JSON.stringify({source,edition:'internal-trial',version:JSON.parse(fs.readFileSync('desktop/package.json')).version,appId:'com.naumi.desktop',userDataName:'Naumi',groups:selected.groups,models:selected.models,sourceConfigurationUnchanged:true,published:false,installed:false,credentialsIncluded:'selected-internal-test-connections-only'},null,2));
console.log('INTERNAL_TRIAL_BUILD_PASS published=0 installed=0');
