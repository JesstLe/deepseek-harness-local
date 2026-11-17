import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const e=path.resolve('evidence/desktop-enterprise'),text=file=>fs.readFileSync(path.join(e,file),'utf8'),pack=JSON.parse(text('PACKAGE.json')),rollback=JSON.parse(text('ROLLBACK_RESULT.json'));
for(const [file,count]of [['BASELINE_TESTS.log',293],['MODIFIED_TESTS.log',315],['ROLLBACK_TESTS.log',293]]){assert.match(text(file),new RegExp('tests '+count));assert.match(text(file),/fail 0/);}
for(const file of ['DESKTOP_ENTERPRISE.json','PACKAGE_CONTRACT.json','lifecycle/DESKTOP_LIFECYCLE.json'])assert.equal(JSON.parse(text(file)).status,'PASS');assert.equal(rollback.status,'PASS');
const result=`Naumi M5.3 - enterprise first connection/session bridge and instance protocol2
Branch: ${pack.branch}
Baseline commit: ${pack.baselineCommit}
Status: module + unpacked Electron controlled fixture PASS; overall goal active.
Changed fields/branches:
${pack.changedFields.map(v=>'- '+v).join('\n')}

Four artifacts:
${['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'].map(f=>path.join(e,f)).join('\n')}
Original/modified hashes: hashes.json (${pack.files} files; originals ${pack.originalFiles}, new ${pack.newFiles}); additive identity migration keeps original UUID/key.

BASELINE
Workdir: E:\\Workspace\\naumi-bot-lifecycle-fix before modifications at ${pack.baselineCommit}
Command: node --test tests/*.test.mjs desktop/tests/*.test.cjs
Input: original source and original test suite; no live employee data.
Literal output/result: tests 293; pass 293; fail 0. Exit status: 0.
Command: node scripts/repro-desktop-enterprise.mjs --baseline
Input: original desktop identity/profile/backend modules; controlled real loopback listener + forwarding relay + cloned identity fixture.
Literal output/result: ${text('BASELINE_REPRO.log').trim()}
Exit status: 0 (old missing endpoint/home binding reproduced).

MODIFIED
Command: node --test tests/*.test.mjs desktop/tests/*.test.cjs
Input: changed source; original tests + 22 new tests, including real relay, home/issuer binding, finite session bridge, request/response/admission, expired/RBAC/application-no-replay/stable operation UUID and DPAPI clean PATH.
Literal output/result: tests 315; pass 315; fail 0. Exit status: 0.
Command: node scripts/repro-desktop-enterprise.mjs
Literal output/result: ${text('MODIFIED_REPRO.log').trim()}
Exit status: 0.
Command: $env:NAUMI_DINGTALK_ARCHIVE=(Resolve-Path evidence/employee-package/research/dingtalk-workspace-cli-1.0.68.tgz).Path; node desktop/scripts/prepare-runtime.mjs
Input: pinned official CLI archive, source plugins and runtime dependencies, no employee state.
Literal output/result: ${text('STAGE.log').trim().split(/\r?\n/).at(-1)}
Exit status: 0.
Command: node node_modules/electron-builder/cli.js --win --x64 --dir
Workdir: E:\\Workspace\\naumi-bot-lifecycle-fix\\desktop
Result: unpacked Naumi.exe/resources/app.asar built. Exit status: 0. No signing certificate configured; no signed/NSIS acceptance claimed.
Command: node scripts/verify-desktop-enterprise-package.mjs
Literal output/result:
${text('PACKAGE_CONTRACT.log').trim()}
Exit status: 0.
Command: node desktop/scripts/verify-desktop-enterprise.mjs
Input: two isolated test userData directories; clean system PATH; controlled enterprise fixture; real Electron login HttpOnly cookie; explicit fixture registration with Ed25519 proof/signature and DPAPI.
Literal output/result:
${text('DESKTOP_ENTERPRISE.log').trim()}
Exit status: 0.
Command: $env:NAUMI_LIFECYCLE_EVIDENCE='E:/Workspace/naumi-bot-lifecycle-fix/evidence/desktop-enterprise/lifecycle'; node desktop/scripts/verify-desktop-lifecycle.mjs
Input: original dual-profile/native-browser/crash-recovery scenario with protocol2 and configured fixture origin. Windows metadata reader handoff has bounded atomic-rename retry.
Literal output/result:
${text('DESKTOP_LIFECYCLE.log').trim()}
Exit status: 0.

ROLLBACK
Command: $env:NAUMI_NODE='D:/DEV/NodeJS/node.exe'; & 'D:/DEV/Git/bin/bash.exe' evidence/desktop-enterprise/ROLLBACK.sh --test
Input: a separate copy; hash-guarded original bytes restore; new-source files removed only in the copy; new-version identity/EmployeeStore seed retained.
Literal output/result:
${text('ROLLBACK.log').trim()}
Exit status: 0.
Restored behavior/status: original protocol1 proof, prior relay/clone behavior, original293 tests PASS, UUID/key/persona/memory/schema1 retained. Actual modified files remain changed and active employee profiles are untouched. This is source-copy rollback, not installed-version or business-schema downgrade.

Actual-service read-only probe:
Command: node scripts/check-bot-runtime.mjs E:/Workspace/naumi-desktop 2
Literal output/result: RUNTIME sessions=62 running=0 bots=3 revision=10 http=200 contract=2
Exit status: 0. Actual3080 source/service not replaced by this module.

Observed test corrections: ATTEMPT1/2 enterprise fixture omitted UTF-8 charset; ATTEMPT3 navigation was correctly prevented and Playwright click had to use noWaitAfter. Enterprise ATTEMPT4 kept Playwright pending-navigation bookkeeping after a correctly blocked external link; that check is now last with explicit test teardown. ATTEMPT5 exposed native Chromium wire retransmission on dropped connections; POST now requires the original operationId and the fixture matches the actual enterprise transaction-receipt dedup authority. The test measures wire attempts separately from effects and explicitly reconciles the UNKNOWN operation with the same UUID. Enterprise ATTEMPT6 completed login/data/dedup/restart/isolation but stalled on quitting with a login window; that attempt was explicitly aborted, not PASS. The owned test backend was already stopped. Main now closes the login popup before flush and suppresses teardown reload/bootstrap; final E2E checks actual GUI PID exit. Enterprise ATTEMPT7 used Playwright.process() after its handle was disposed; the launcher reference is now captured before close and the GUI/backend PIDs are independently observed. Lifecycle ATTEMPT1 exposed real Windows EPERM receipt rename; production profile.cjs now retries only the fsynced atomic rename for a bounded interval, with a real FileShare.Read lock regression test. These earlier attempts are not recorded as passes.

Remaining overall gates: real remote HTTPS employee onboarding/binding/model policy, real supplier/account/price/budget use, enterprise/home migration UX, business schema/installed version downgrade, NSIS clean install/upgrade/uninstall, signing/dependency review and employee business acceptance. Overall goal remains active.
`;
fs.writeFileSync(path.join(e,'VERIFICATION.txt'),result);console.log('VERIFICATION written=PASS baseline=293 modified=315 rollback=293 overall_goal=active');
