import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {parse} from 'acorn';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
import {productCopy,installProductIdentity,PRODUCT_COPY_KEYS} from '../plugins/naumi-enterprise/assets/product-identity.js';
import {buildProductCopyKeys} from '../scripts/audit-product-identity.mjs';
import {PRODUCT_VERSION} from '../plugins/naumi-enterprise/product-version.js';
const languages=['zh','en','ja','es','fr','de','ru','pt'];
test('all eight languages preserve real plugin trust and Office guidance while replacing product identity',()=>{for(const [pkg,ns,key]of [['dsh-client-ui-plugin-manager','pluginManager','installGuideSafety'],['dsh-client-ui-sidebar-documentpreview','sidebarOffice','unavailable']]){
 const ast=parse(fs.readFileSync('node_modules/@deepseek-ai/'+pkg+'/lib/client.js','utf8'),{ecmaVersion:'latest'}),values=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='Property'&&(n.key.name??n.key.value)===key&&n.value.type==='Literal'&&/DeepSeek Harness/.test(n.value.value))values.push(n.value.value);for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}walk(ast);assert.equal(values.length,8);values.forEach((s,i)=>{const result=productCopy(ns,key,s,languages[i],PRODUCT_VERSION);assert.equal(result,s.replaceAll('DeepSeek Harness','Naumi'));assert(!result.includes('DeepSeek'));});
}});
test('expired vendor-account errors direct users to API keys rather than inventing a Naumi supplier login',()=>{for(const locale of languages)for(const key of ['message.failure.accountSignedOut','message.failure.accountSignInRequired']){const s=productCopy('chat',key,'DeepSeek',locale,PRODUCT_VERSION);assert(!/DeepSeek|登录|Sign in|log in/.test(s));assert(/API/.test(s));}});
test('brand scope never edits user messages, supplier IDs, code, templates, links or model names',()=>{for(const ns of ['conversation','models','tools','user','pluginManager'])for(const value of ['DeepSeek Harness','deepseek-chat','https://api.deepseek.com/v1','DEEPSEEK_API_KEY','@deepseek-ai/dsh','用户正在讨论DeepSeek'])assert.equal(productCopy(ns,'user.content',value,'zh',PRODUCT_VERSION),value);assert(Object.values(PRODUCT_COPY_KEYS).reduce((n,s)=>n+s.size,0)>=9);});
test('native bound translators created before installation see branding and interpolation, then recover on disposal',()=>{const locale={active:'zh-Naumi',getSnapshot(){return {active:this.active};},translate(ns,key,params){const text=key==='chat.deepDivingFor'?'深度求索中，用时 {duration} ···':'原标签';return params?text.replace('{duration}',params.duration):text;},bind(ns){return (key,params)=>this.translate(ns,key,params);}},t=locale.bind('chat'),original=locale.translate;const dispose=installProductIdentity({locale},{version:PRODUCT_VERSION});assert.equal(t('chat.deepDivingFor',{duration:'3秒'}),'Naumi 正在处理，用时 3秒 ···');assert.equal(locale.translate('settings','general.currentVersion',{version:'0.2.2-rc.1'}),'Naumi '+PRODUCT_VERSION);assert.equal(t('other'),'原标签');dispose();assert.equal(locale.translate,original);assert.equal(t('chat.deepDivingFor',{duration:'3秒'}),'深度求索中，用时 3秒 ···');});
test('disposing branding does not clobber a later translation decorator',()=>{const locale={translate:()=>'',getSnapshot:()=>({active:'zh'})},dispose=installProductIdentity({locale});const later=()=> 'later';locale.translate=later;dispose();assert.equal(locale.translate,later);});
test('product version is generated from the desktop manifest and packaged without losing peer modules',()=>{assert.equal(PRODUCT_VERSION,JSON.parse(fs.readFileSync('desktop/package.json')).version);const pkg=JSON.parse(fs.readFileSync('plugins/naumi-enterprise/package.json'));for(const f of ['product-version.js','model-connections.js','bot-deliverables.js'])assert(pkg.files.includes(f));const host=fs.readFileSync('plugins/naumi-enterprise/host.js','utf8');for(const f of ['product-identity.js','product-identity.css'])assert(host.includes(f));});
test('running logo changes are scoped, reuse the Naumi SVG and honor reduced motion without DOM rewriting',()=>{const css=fs.readFileSync('plugins/naumi-enterprise/assets/product-identity.css','utf8'),js=fs.readFileSync('plugins/naumi-enterprise/assets/product-identity.js','utf8');assert(css.includes('[data-chat-running] [class$="_runningIcon"]'));assert(css.includes('/naumi/assets/symbol.svg'));assert(css.includes('prefers-reduced-motion:reduce'));for(const x of ['MutationObserver','innerHTML','textContent','localStorage','fetch(','setInterval'])assert(!js.includes(x));});
test('maintenance entry points and smoke checks use real Naumi identity, not the engine branding',()=>{for(const f of ['deploy-bot-communication.ps1','deploy-bot-lifecycle.ps1','deploy-employee-center.ps1','deploy-employee-foundation.ps1','deploy-employee-sync.ps1']){const s=fs.readFileSync('scripts/'+f,'utf8');assert(!/Start-DeepSeek|Stop-DeepSeek/.test(s));assert(s.includes('Start-Naumi.ps1'));assert(s.includes('Stop-Naumi.ps1'));}assert(!fs.readFileSync('scripts/verify-http.mjs','utf8').includes('/DeepSeek|deepseek/'));assert(!fs.readFileSync('Start-Naumi.ps1','utf8').includes("'DeepSeek|deepseek"));});

test('desktop shortcut migrates to a GUI launcher and keeps rollback targets usable', {skip: process.platform !== 'win32'}, () => {
  const folder = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'naumi shortcut test-')));
  const desktop = path.join(folder, 'Desktop');
  const startScript = path.join(folder, 'Start-NaumiDesktop.ps1');
  const icon = path.join(folder, 'desktop', 'app', 'assets', 'naumi.ico');
  const shortcut = path.join(desktop, 'Naumi.lnk');
  const legacy = path.join(desktop, 'Naumi 企业协作.lnk');
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const powershell = args => execFileSync('pwsh.exe', ['-NoProfile', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: 20000,
  });
  const runCommand = lines => powershell([
    '-EncodedCommand', Buffer.from(lines.join('; '), 'utf16le').toString('base64'),
  ]);
  const createShortcut = (file, args) => runCommand([
    '$ErrorActionPreference = "Stop"',
    '$w = New-Object -ComObject WScript.Shell',
    '$s = $w.CreateShortcut(' + quote(file) + ')',
    '$s.TargetPath = (Get-Process -Id $PID).Path',
    '$s.Arguments = ' + quote(args),
    '$s.Save()',
  ]);
  const install = () => powershell(['-File', 'scripts/install-naumi-shortcut.ps1', '-Root', folder, '-DesktopPath', desktop]);
  const readLink = () => JSON.parse(runCommand([
    '$w = New-Object -ComObject WScript.Shell',
    '$s = $w.CreateShortcut(' + quote(shortcut) + ')',
    '$s | Select-Object TargetPath, Arguments, WorkingDirectory | ConvertTo-Json -Compress',
  ]));
  try {
    fs.mkdirSync(desktop);
    fs.mkdirSync(path.dirname(icon), {recursive: true});
    fs.copyFileSync('desktop/app/assets/naumi.ico', icon);
    fs.writeFileSync(startScript, '[IO.File]::WriteAllText((Join-Path $PSScriptRoot "started"), (Get-Location).Path)\n');
    createShortcut(shortcut, '-NoProfile');
    const unrelated = fs.readFileSync(shortcut);
    assert.throws(install, {stderr: /NAUMI_SHORTCUT_ALREADY_OWNED/});
    assert.deepEqual(fs.readFileSync(shortcut), unrelated);
    fs.unlinkSync(shortcut);

    createShortcut(legacy, '-File "' + startScript + '"');
    const legacyBytes = fs.readFileSync(legacy);
    assert.match(install(), /NAUMI_SHORTCUT canonical=1 legacy_removed=1 logo=1 rollback_copy=PASS/);
    assert(!fs.existsSync(legacy));
    const first = readLink();
    const firstBackup = path.dirname(first.TargetPath);
    assert.equal(path.basename(first.TargetPath), 'NaumiLauncher.exe');
    assert.deepEqual(fs.readFileSync(path.join(firstBackup, 'rollback-copy', path.basename(legacy))), legacyBytes);
    const image = fs.readFileSync(first.TargetPath);
    const optionalHeader = image.readUInt32LE(0x3c) + 24;
    assert.equal(image.readUInt16LE(optionalHeader + 68), 2, 'Windows GUI subsystem');

    const args = [...first.Arguments.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.equal(args.length, 2);
    assert(fs.statSync(args[0]).isFile(), 'launcher uses one executable, not concatenated PATH matches');
    assert.equal(args[1], startScript);
    execFileSync(first.TargetPath, args, {cwd: first.WorkingDirectory, windowsHide: true, timeout: 10000});
    assert.equal(fs.readFileSync(path.join(folder, 'started'), 'utf8'), folder);

    const firstShortcut = fs.readFileSync(shortcut);
    assert.match(install(), /legacy_removed=0 logo=1 rollback_copy=PASS/);
    const next = readLink();
    assert.notEqual(next.TargetPath, first.TargetPath);
    assert(fs.existsSync(first.TargetPath));
    assert.deepEqual(fs.readFileSync(path.join(path.dirname(next.TargetPath), 'rollback-copy', 'Naumi.lnk')), firstShortcut);
  } finally {
    fs.rmSync(folder, {recursive: true, force: true});
  }
});

test('generated brand allowlist covers every scanned active dictionary key without mutating interpolation values',()=>{const report=buildProductCopyKeys({write:false});assert(report.modules>30);for(const[ns,keys]of Object.entries(report.namespaces))for(const key of keys){assert(PRODUCT_COPY_KEYS[ns]?.has(key),ns+':'+key);assert(!/DeepSeek Harness|深度求索|\bDSH\b/.test(productCopy(ns,key,'DeepSeek Harness / DSH / 深度求索中','zh',PRODUCT_VERSION)));}const locale={translate:()=> 'DeepSeek Harness {value}',getSnapshot:()=>({active:'zh'})},dispose=installProductIdentity({locale});assert.equal(locale.translate('pluginManager','installGuideSafety',{value:'DeepSeek Harness DSH'}),'Naumi DeepSeek Harness DSH');dispose();});

test('installed shell version wins over linked backend version without changing ordinary browser identity',()=>{
 const prior=globalThis.naumiDesktop;const locale={translate:()=> 'old',getSnapshot:()=>({active:'zh'})};
 try{globalThis.naumiDesktop={appVersion:'0.3.9'};const off=installProductIdentity({locale},{version:'0.3.7'});assert.equal(locale.translate('settings','general.currentVersion'),'Naumi 0.3.9');off();delete globalThis.naumiDesktop;const browser=installProductIdentity({locale},{version:'0.3.7'});assert.equal(locale.translate('settings','general.currentVersion'),'Naumi 0.3.7');browser();}finally{if(prior===undefined)delete globalThis.naumiDesktop;else globalThis.naumiDesktop=prior;}
});
