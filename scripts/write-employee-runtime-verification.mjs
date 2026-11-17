import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),e=path.join(root,'evidence/employee-package'),read=n=>fs.readFileSync(path.join(e,n),'utf8'),hashes=JSON.parse(read('hashes.json')),pack=JSON.parse(read('PACKAGE_TESTS.json')),rollback=JSON.parse(read('ROLLBACK_RESULT.json')),smoke=JSON.parse(read('DESKTOP_SMOKE.json'));
assert.match(read('BASELINE.log'),/tests 251/);assert.match(read('BASELINE.log'),/fail 0/);assert.match(read('MODIFIED.log'),/tests 268/);assert.match(read('MODIFIED.log'),/fail 0/);assert.equal(rollback.status,'PASS');assert.equal(smoke.dingtalk.healthy,true);
const totals=n=>read(n).split(/\r?\n/).filter(l=>/ℹ (tests|suites|pass|fail|cancelled|skipped|todo) /.test(l)).join('\n');
const paths=['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'].map(n=>path.join(e,n)).join('\n');
const body=`Naumi M5.1 formal package and bundled DingTalk verification — 2026-11-17
Branch: fix/naumi-bot-lifecycle-20261116
Baseline commit: d0061a45a475b37832e1332c76512710f0591829
Changed branch/fields: plugin npm files + direct runtime peerDependencies; pinned official DingTalk bundle; employee-local CLI config/native runtime cache; measured installed/local-auth/health state; stage import/inventory/private-path gate; electron-builder beforePack/current-source gate.
Protected: actual 3080 sessions/bots/home, enterprise account/device/upload/AI rules, model gateway routes, original UI/sidebar/model location. No live module deployment in this increment.
Artifacts:
${paths}
Original source bytes and hashes: original-hashes.json; originals=${rollback.restored}, new files=${rollback.removed}, manifest files=${hashes.length}. Actual worktree remains modified.

BASELINE
cwd=${root}
command=node --test tests/*.test.mjs desktop/tests/*.test.cjs
input=original tracked implementation at baseline commit, unchanged runtime fixture data
literal output/result:
${totals('BASELINE.log')}
exit=0
full log=BASELINE.log

MODIFIED
cwd=${root}
command=node --test tests/*.test.mjs desktop/tests/*.test.cjs
input=modified implementation; per-file SHA256 in hashes.json
literal output/result:
${totals('MODIFIED.log')}
exit=0
full log=MODIFIED.log

FORMAL PACKAGE / REAL CLI
command=node scripts/verify-employee-package.mjs
input=actual npm --ignore-scripts pack, staged backend, empty isolated employee profile, no development PATH; inherited fixture DWS token/config ignored
literal output/result:
${read('PACKAGE_TESTS.log').trim()}
exit=0
official CLI version=${pack.cli.version}
auth readonly literal JSON fields=${JSON.stringify(pack.cli.authOutput)}
installed/healthy do not prove remote access: networkVerified=false, connected=null. No employee login performed.
Verified official archive SHA512, platform archive SHA256, exe SHA256 and LICENSE/NOTICE. No upstream postinstall/global skill setup; resource files unchanged after native cache extraction.

UNPACKED DESKTOP BUILD
cwd=${path.join(root,'desktop')}
command=node node_modules/electron-builder/cli.js --win --x64 --dir
input=verified current stage; Electron44.11.3, internal Node24.19.0, logo ico, native Chromium webview, DingTalk1.0.68
literal output/result=STAGED_RUNTIME_VERIFIED ${JSON.stringify(pack.staged)}
exit=0
full log=BUILD_DIR.log
binary=${path.join(root,'runtime/naumi-desktop-release/win-unpacked/Naumi.exe')}
signing=no configured code signing certificate; builder skipped signing

UNPACKED DESKTOP SMOKE
command=node desktop/scripts/verify-employee-package.mjs
input=independent userData, port3082, restricted System32 PATH, local X-Frame-Options DENY browser fixture and fresh DingTalk config
literal output/result:
${read('DESKTOP_SMOKE.log').trim()}
exit=0
Electron embedded Node=${smoke.node}, Chromium=${smoke.chromium}; backend uses independent bundled Node24.19.0. No employee/device enrollment or user browser profile reuse.
This is an unpacked executable test, not an NSIS install/upgrade/uninstall test.

ROLLBACK
command=D:/DEV/Git/bin/bash.exe evidence/employee-package/ROLLBACK.sh --test
input=another source copy with modified files, persona/memory/schema fixture, original byte snapshots; active tree and live data excluded
literal output/result:
${read('ROLLBACK.log').trim()}
exit=0
restored behavior/status=pre-M5 packaging/capability implementation restored in copy; bundled DingTalk integration absent; 251 baseline tests pass; persona/memory/schema1 retained; active implementation remains modified. This is source/bundle-module rollback, not application data migration or installed-version downgrade acceptance.

LIVE READ-ONLY CHECK
command=node scripts/check-bot-runtime.mjs E:/Workspace/naumi-desktop 2
literal output/result=RUNTIME sessions=62 running=0 bots=3 revision=10 http=200 contract=2
exit=0

Remaining whole-goal gates: profile-instance/port isolation; owned junction upgrade; configurable remote enterprise origin and Electron session request bridge; first enrollment; schema/data migrations and installed-version rollback; actual NSIS install/upgrade/uninstall; employee authorization and business acceptance. Real gateway provider routes remain zero in last verified M4 deployment. M1-M5 objective stays active.
`;
fs.writeFileSync(path.join(e,'VERIFICATION.txt'),body);console.log('VERIFICATION_WRITTEN baseline=251 modified=268 rollback=251 desktop=unpacked_only');
