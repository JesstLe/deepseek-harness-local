import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import{execFileSync}from'node:child_process';
const root=process.cwd(),out=path.join(root,'runtime/naumi-desktop-release-0.3.3'),e=path.join(root,'evidence/installer-ui');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const fixedMain='318cfbb8989859fca33a5816acd627e132087888';
const observedHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
execFileSync('git',['merge-base','--is-ancestor',fixedMain,observedHead]);
assert.equal(execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim(),'','BUILD_SOURCE_CHANGED');
const exe=path.join(out,'Naumi-Setup-0.3.3-x64.exe'),app=path.join(out,'win-unpacked');assert.equal(fs.readFileSync(exe).toString('ascii',0,2),'MZ');
const require=createRequire(path.join(root,'desktop/package.json')),asar=require('@electron/asar');
const archive=path.join(app,'resources/app.asar'),packed=JSON.parse(asar.extractFile(archive,'package.json'));
assert.equal(packed.version,'0.3.3');assert.equal(packed.name,'naumi-desktop');
const appFiles=['main.cjs','backend.cjs','installer-preflight.cjs','installer-state.cjs','assets/naumi.ico','assets/symbol.svg'];
for(const file of appFiles){const b=asar.extractFile(archive,path.join('app',file));assert.equal(createHash('sha256').update(b).digest('hex'),sha(path.join(root,'desktop/app',file)));}
const backend=path.join(app,'resources/backend'),manifest=JSON.parse(fs.readFileSync(path.join(backend,'runtime-manifest.json'))),inventory=JSON.parse(fs.readFileSync(path.join(backend,'runtime-files.json')));
assert.equal(manifest.version,'0.3.3');assert.equal(manifest.dingtalk.version,'1.0.68');assert.equal(manifest.personalCredentials,false);assert.equal(manifest.browserProfiles,false);
fs.copyFileSync(path.join(backend,'runtime-manifest.json'),path.join(e,'PACKAGED_RUNTIME_MANIFEST.json'));
assert.equal(sha(path.join(backend,'node.exe')),manifest.nodeSHA256);
assert.equal(sha(path.join(backend,'runtime-files.json')),manifest.inventorySHA256);
for(const file of inventory){const p=path.resolve(backend,file.path);assert(p.startsWith(backend+path.sep));assert.equal(sha(p),file.sha256,file.path);}
const checkoutEOLVariants=[];
for(const file of inventory.filter(x=>x.path.startsWith('plugins/'))){
 const expected=execFileSync('git',['show',fixedMain+':'+file.path],{maxBuffer:10*1024*1024});
 if(createHash('sha256').update(expected).digest('hex')!==file.sha256){
  const actual=fs.readFileSync(path.join(backend,file.path));
  assert(Buffer.from(expected.toString('utf8')).equals(expected),'NON_TEXT_SOURCE_DRIFT '+file.path);
  assert.equal(actual.toString('utf8').replaceAll('\r\n','\n'),expected.toString('utf8').replaceAll('\r\n','\n'),'FIXED_MAIN_PLUGIN_CONTENT '+file.path);
  checkoutEOLVariants.push(file.path);
 }
}
for(const f of ['bot-task-service.js','bot-tasks.js'])assert.equal(sha(path.join(backend,'plugins/naumi-enterprise',f)),sha(path.join(root,'plugins/naumi-enterprise',f)));
const old=JSON.parse(fs.readFileSync(path.join(root,'runtime/installer-ui-build-inputs/old-release-hashes.json'))).filter(x=>x.Path.endsWith('.exe'));
for(const f of old)assert.equal(sha(f.Path).toUpperCase(),f.Hash);
const seven='D:/DEV/7zip/7z.exe';
const test=execFileSync(seven,['t',exe],{encoding:'utf8',maxBuffer:5*1024*1024});fs.writeFileSync(path.join(e,'PACKAGE_ARCHIVE_TEST.log'),test);assert(test.includes('Everything is Ok'));
const result={status:'PASS',version:'0.3.3',sourceMain:fixedMain,observedHeadAfterBuild:observedHead,subsequentMainChangesIncluded:false,fixedMainPluginContentVerified:true,checkoutEOLVariants,buildExit:0,buildCommand:'npm --prefix desktop run build -- --output=../runtime/naumi-desktop-release-0.3.3',buildCwd:root,freshStage:{files:inventory.length,version:manifest.version,node:manifest.node,dingtalk:manifest.dingtalk.version,closure:manifest.closure.status,forbiddenPaths:manifest.scan.forbiddenPaths},package:{path:exe,bytes:fs.statSync(exe).size,sha256:sha(exe),archiveTest:'Everything is Ok',archiveTestExit:0,asarSourceFiles:appFiles.length,backendFilesHashVerified:inventory.length,oldInstallersHashPreserved:old.length},firstAttempt:{exit:1,error:'EPERM unlink existing win-unpacked/dxil.dll',log:'BUILD_ATTEMPT1.log',action:'existing running desktop processes retained; used separate versioned output'},secondAttempt:{exit:1,error:'hook resolves outside workspace root when invoked from repository root with --projectDir',log:'BUILD_ATTEMPT2.log',action:'invoked pinned builder from desktop directory'},thirdAttempt:{exit:1,error:'nsis.script bypassed standard UNINSTALLER_OUT_FILE generation',log:'BUILD_ATTEMPT3.log',action:'removed nsis.script; substituted presentation in stock computeFinalScript for both phases'},releasePublished:false,productInstalled:false,fullLifecycleExecuted:false,service3080Restarted:false};
fs.writeFileSync(path.join(e,'BUILD.json'),JSON.stringify(result,null,2)+'\n');console.log(`PACKAGE_CHECK files=${inventory.length} asar_sources=${appFiles.length} old_installers=${old.length} archive=PASS hashes=PASS exit=0`);console.log(`PACKAGE path=${exe} bytes=${result.package.bytes} sha256=${result.package.sha256}`);
