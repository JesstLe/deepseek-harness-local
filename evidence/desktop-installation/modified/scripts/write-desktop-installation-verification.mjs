import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';const e=path.resolve('evidence/desktop-installation'),read=f=>fs.readFileSync(path.join(e,f),'utf8'),pack=JSON.parse(read('PACKAGE.json'));for(const [file,count]of[['BASELINE_TESTS.log',315],['MODIFIED_TESTS.log',333],['ROLLBACK_TESTS.log',315]]){assert.match(read(file),new RegExp('tests '+count));assert.match(read(file),/fail 0/);}for(const file of['WORKSPACE_RECOVERY.json','NSIS_INSTALLATION.json','PACKAGE_CONTRACT.json','ROLLBACK_RESULT.json'])assert.equal(JSON.parse(read(file)).status,'PASS');
const report=`Naumi M5.4 - recoverable connection, isolated enterprise workspaces and NSIS normal-stop lifecycle
Branch: ${pack.branch}
Baseline commit: ${pack.baselineCommit}
Overall goal: active; no full release, crash/in-flight install, general schema or cross-workspace old-client downgrade claim.
Changed fields/branches:
${pack.changedFields.map(x=>'- '+x).join('\n')}

Four artifacts:
${['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'].map(f=>path.join(e,f)).join('\n')}
Original/modified SHA256: hashes.json (${pack.files} delivery files; ${pack.originalFiles} original snapshots, ${pack.newFiles} new files; unchanged baseline helper files also carried). No real employee credentials are input to source packaging.

BASELINE
Workdir: E:\\Workspace\\naumi-bot-lifecycle-fix at ${pack.baselineCommit}, before changes.
Command: node --test tests/*.test.mjs desktop/tests/*.test.cjs
Input: original source/tests. Literal output/result: tests 315; pass 315; fail 0. Exit status: 0.
Command: node scripts/repro-desktop-installation.mjs --baseline
Input: original direct connect path and controlled unavailable origin.
Literal output/result: ${read('BASELINE_REPRO.log').trim()}
Exit status: 0 (prior persisted wrong address/no precheck reproduced).
Command: node node_modules/electron-builder/cli.js --prepackaged ../runtime/naumi-desktop-release/win-unpacked --win nsis --x64
Workdir: desktop. Input: original verified 0.2.0 unpacked app and original config. Result: real baseline NSIS installer built, Exit status: 0. Baseline binary preserved under runtime/installer-baseline.

MODIFIED
Command: node --test tests/*.test.mjs desktop/tests/*.test.cjs
Input: modified source and 18 new workspace/production-package/NSIS observer tests; original frontend equivalence permits exactly one declared desktop-only connection action.
Literal output/result: tests 333; pass 333; fail 0. Exit status: 0.
Command: node scripts/repro-desktop-installation.mjs
Literal output/result: ${read('MODIFIED_REPRO.log').trim()}
Exit status: 0.
Command: Get-Content evidence/desktop-installation/STAGE_INPUT.mjs -Raw | node --input-type=module
Input: baseline full inventory hash gate; two exact client.js copies updated; full inventory regenerated; manifest version0.2.1. Literal output/result:
${read('STAGE.log').trim()}
Exit status: 0.
Command: node node_modules/electron-builder/cli.js --win --x64
Workdir: desktop. Result: real 0.2.1 unpacked and NSIS artifacts built. Exit status: 0. No code signing certificate configured; no verified-publisher claim.
Command: node scripts/verify-desktop-installation-package.mjs
Literal output/result:
${read('PACKAGE_CONTRACT.log').trim()}
Exit status: 0.
Command: node desktop/scripts/verify-desktop-workspaces.mjs
Input: isolated test userData; unavailable/HTML/stalled and two controlled enterprise origins; real hidden Electron; real SQLite and Chromium cookies; no development PATH.
Literal output/result:
${read('WORKSPACE_RECOVERY.log').trim()}
Exit status: 0.
Command: ${read('NSIS_FINAL_COMMAND.txt').trim()}
Input: real per-user product GUID/shortcuts, owned short .dsh application directory, separate test employee userData; original0.2.0 application payload rewrapped as ZIP control after only development artifacts were omitted, and candidate0.2.1 ZIP installer; normal shutdown observed before each replacement. No claim that the original7z wrapper passed.
Original7z note: 5-minute observer timed out while PID55212 remained live. It was revalidated by path/CPU/file progression and never restarted on observation timeout. That process later ended but the observer returned null exitCode, retained as UNKNOWN in NSIS_BASELINE_EXIT.json. Its created registration/standard shortcuts were uninstalled and existing environment restoration was verified. It is not counted as a successful native-exit test. The final ZIP runner pins a native SafeHandle and uses WaitForSingleObject/GetExitCodeProcess; the log must carry explicit native zero receipts.
Literal output/result:
${read('NSIS_INSTALLATION.log').trim()}
Exit status: 0 for the independent readonly reconciliation command. Original ZIP lifecycle command (node desktop/scripts/verify-nsis-installation.mjs) exited 1 on uninstall observation timeout, preserved verbatim in NSIS_INSTALLATION_ATTEMPT2.log with NSIS_ATTEMPT2_INPUT.mjs. It emitted successful install/upgrade/downgrade receipts before the timeout; the final uninstall state was verified independently, not inferred from launcher exit. A duplicate cleanup launcher was recorded, not hidden. The revised observer has 4 regression tests, a 300-second observation window, no duplicate retry after timeout, and durable stage checkpoints; the complete installed chain was not rerun with the revised observer. Original7z observer failure remains separately in NSIS_INSTALLATION_ATTEMPT1.log. New real registry and standard shortcuts removed by uninstall; existing custom shortcuts and real APPDATA metadata unchanged. Controlled employee persona/memory/schema1/device vault/login and explicit UNKNOWN sample retained.

ROLLBACK
Command: $env:NAUMI_NODE='D:/DEV/NodeJS/node.exe'; & 'D:/DEV/Git/bin/bash.exe' evidence/desktop-installation/ROLLBACK.sh --test
Input: separate source copy; hash-guarded original bytes and removal of new files only in that copy; real EmployeeStore seed retained.
Literal output/result:
${read('ROLLBACK.log').trim()}
Exit status: 0.
Restored behavior/status: original direct connection (no precheck), original absence of workspace selector, original315 tests PASS. Persona/memory/schema1 retained. New index is retained but ignored by the original client; this is explicitly not a cross-workspace installed downgrade guarantee. Modified working-tree files remain changed; real user data untouched.

Observed test corrections: hidden Playwright page.screenshot stalled; Electron native capturePage(stayHidden/stayAwake) produced the inspected PNG instead. Awaiting renderer IPC that deliberately navigates destroyed the old evaluation context; the test now awaits the target page navigation explicitly. No functional pass is inferred from those failed attempts. The first readonly reconciliation process filter matched its own PowerShell command; its failure remains in NSIS_RECONCILIATION_ATTEMPT1.log. The filter now excludes its own PID. Actual NSIS process liveness/exit are separate from a controller observation timeout; null is UNKNOWN, never zero. Final ZIP wrappers and all installed retained-resource hashes are separately verified. Long install/file-count evidence is in INSTALL_FOOTPRINT.json and NSIS_PROGRESS.jsonl; no short install-time claim.

Remaining gates: authenticated installer quiesce for orphan worker/running tasks/handles and failed-update recovery; cross-workspace downgrade compatibility; new business-schema migration/downgrade; install-performance optimization; real clean employee machine, remote HTTPS/account/model/supplier/price/budget/business acceptance; signing/dependency review. Overall goal remains active.
`;fs.writeFileSync(path.join(e,'VERIFICATION.txt'),report);console.log('VERIFICATION written=PASS baseline=315 modified=333 rollback=315 overall_goal=active');
