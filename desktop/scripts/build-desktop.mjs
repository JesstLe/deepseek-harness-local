// Keep electron-builder's stock two-pass uninstaller/signing/size validation.
// Its nsis.script option bypasses that pipeline, so substitute presentation only
// at the pinned computeFinalScript boundary, in this build process, never on disk.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
export function installPathBudget(files){
 if(!Array.isArray(files)||!files.length)throw Error('NSIS_PATH_INVENTORY_REQUIRED');
 // nsisunz's Win32 destination buffer is MAX_PATH, including the NUL. Compute
 // admission from the longest real shipped backend path, not a guessed UX cap.
 const longest=Math.max(...files.map(file=>path.win32.join('resources','backend',file.path).length),48);
 const maxInstallDirChars=259-1-longest;
 if(!Number.isInteger(maxInstallDirChars)||maxInstallDirChars<32)throw Error('NSIS_PAYLOAD_PATH_BUDGET_EXHAUSTED');
 return {maxInstallDirChars,longestPayloadPathChars:longest,maxDestinationChars:259};
}
export function presentationScript(raw,engine,metadata){
 const normalized=raw.replaceAll('\r\n','\n');
 if(sha(normalized)!==metadata.originalEngineSHA256 || sha(engine)!==metadata.modifiedEngineSHA256 ||
 engine!==normalized.replace('!include "assistedInstaller.nsh"','!include "${NAUMI_WIZARD_DIR}\\pages.nsh"').replace('!include "installUtil.nsh"','!include "${NAUMI_WIZARD_DIR}\\install-util.nsh"'))throw Error('NSIS_PRESENTATION_SOURCE_CHANGED');
 return engine;
}
export function installPresentationHook(Target,engine,metadata){
 const original=Target.prototype.computeFinalScript;
 if(typeof original!=='function'||original.length!==3)throw Error('NSIS_BUILD_INTERFACE_CHANGED');
 Target.prototype.computeFinalScript=function(raw,isInstaller,archs){
  return original.call(this,presentationScript(raw,engine,metadata),isInstaller,archs);
 };
 return ()=>{Target.prototype.computeFinalScript=original;};
}
export async function buildDesktop(args=process.argv.slice(2)){
 const require=createRequire(import.meta.url),{build,Platform,Arch}=require('electron-builder');
 const {NsisTarget}=require('app-builder-lib/out/targets/nsis/NsisTarget.js');
 const dir=path.join(root,'desktop/installer'),metadata=JSON.parse(fs.readFileSync(path.join(dir,'UPSTREAM.json')));
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'desktop/package.json')));
 if(pkg.build.nsis.script)throw Error('NSIS_CUSTOM_SCRIPT_BYPASSES_STOCK_UNINSTALLER');
 if(require('app-builder-lib/package.json').version!==metadata.version)throw Error('NSIS_BUILDER_VERSION_CHANGED');
 for(const arg of args)if(arg!=='--dir'&&arg!=='--reuse-packaged'&&arg!=='--internal-trial'&&!arg.startsWith('--output='))throw Error('UNKNOWN_BUILD_ARGUMENT '+arg);
 const output=args.find(a=>a.startsWith('--output='))?.slice('--output='.length);
 const stockUtil=fs.readFileSync(require.resolve('app-builder-lib/templates/nsis/include/installUtil.nsh'),'utf8').replaceAll('\r\n','\n'),modifiedUtil=fs.readFileSync(path.join(dir,'install-util.nsh'),'utf8');if(sha(stockUtil)!==metadata.installUtilOriginalSHA256||sha(modifiedUtil)!==metadata.installUtilModifiedSHA256)throw Error('NSIS_SHORTCUT_POLICY_SOURCE_CHANGED');
 const trial=args.includes('--internal-trial'),manifest=JSON.parse(fs.readFileSync(path.join(root,'runtime/desktop-backend/runtime-manifest.json')));
 if(trial!==(manifest.edition==='internal-trial'))throw Error('TRIAL_BUILD_EDITION_MISMATCH');
 if(trial&&args.includes('--reuse-packaged'))throw Error('TRIAL_REUSE_FORBIDDEN');
 const callerCwd=process.cwd();
 const budget=installPathBudget(JSON.parse(fs.readFileSync(path.join(root,'runtime/desktop-backend/runtime-files.json'))));
 fs.writeFileSync(path.join(root,'runtime/installer-path-budget.nsh'),'!define NAUMI_MAX_INSTALLDIR_CHARS '+budget.maxInstallDirChars+'\n');
 console.log('NSIS_PATH_BUDGET '+JSON.stringify(budget));
 const restore=installPresentationHook(NsisTarget,fs.readFileSync(path.join(dir,'engine.nsi'),'utf8'),metadata);
 try{
  process.chdir(path.join(root,'desktop'));
  console.log('NAUMI_BUILDER stock_uninstaller=1 stock_signing=1 stock_size_check=1 engine_delta=2');
  return await build({...args.includes('--reuse-packaged')?{prepackaged:path.join(root,'runtime/naumi-desktop-release/win-unpacked')}:{},projectDir:path.join(root,'desktop'),targets:Platform.WINDOWS.createTarget(args.includes('--dir')?'dir':'nsis',Arch.x64),publish:'never',...((output||trial)?{config:{...output?{directories:{output}}:{},...trial?{win:{artifactName:'Naumi-Test-Setup-${version}-${arch}.${ext}'},extraMetadata:{naumiEdition:'internal-trial'}}:{}}}:{})});
 }finally{restore();process.chdir(callerCwd);}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await buildDesktop();
