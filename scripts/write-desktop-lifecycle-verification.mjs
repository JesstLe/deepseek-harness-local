import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),e=path.join(root,'evidence/desktop-lifecycle'),read=p=>fs.readFileSync(path.join(e,p),'utf8'),manifest=JSON.parse(read('hashes.json')),r=JSON.parse(read('ROLLBACK_RESULT.json')),desktop=JSON.parse(read('DESKTOP_LIFECYCLE.json'));
assert.equal(r.status,'PASS');assert.equal(desktop.status,'PASS');assert.equal(desktop.reattachedShutdownObserved,true);assert.match(read('BASELINE.log'),/tests 268/);assert.match(read('MODIFIED.log'),/tests 293/);assert.match(read('MODIFIED.log'),/fail 0/);
const totals=p=>read(p).split(/\r?\n/).filter(s=>/ℹ (tests|suites|pass|fail|cancelled|skipped|todo) /.test(s)).join('\n'),gate=read('BUILD_DIR.log').split(/\r?\n/).find(s=>s.startsWith('STAGED_RUNTIME_VERIFIED'));
assert.equal(JSON.parse(read('PACKAGE_CONTRACT.json')).status,'PASS');
assert(gate);assert.equal(manifest.length,12);
fs.writeFileSync(path.join(e,'VERIFICATION.txt'),`Naumi M5.2 desktop instance / profile dependency lifecycle — 2026-11-17
Branch: fix/naumi-bot-lifecycle-20261116
Baseline commit: c1f555e1c923028ae90a5352127359c3485597ce
Changed branch/fields: persistent profileVersion=1 / identityProtocol=1; fresh HMAC instance+PID+bundle proof; detached owned worker and finish-based authenticated stop; async quit reentry gate; bootstrap URL readiness; starting/ready receipt and bounded port conflict retry; owned dependency-junction transaction and crash recovery; employee-private first-use workspace; runtime inventory/Node/private-metadata gates.
Artifacts:
${['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'].map(p=>path.join(e,p)).join('\n')}
Code files=12; original files=8; new files=4. Original byte hashes in original-hashes.json; old/new source hashes and safe gitattributes snapshot names in hashes.json. Actual worktree retains the modified implementation. No live 3080 deployment in this increment.

BASELINE
cwd=${root}
command=node --test tests/*.test.mjs desktop/tests/*.test.cjs
input=tracked baseline implementation c1f555e, existing deterministic test fixtures
literal output/result:
${totals('BASELINE.log')}
exit=0

BASELINE REPRODUCTION
command=node scripts/repro-desktop-lifecycle-baseline.mjs
input=original byte-preserved backend.cjs, owned temporary home and controlled identical-logo HTTP server
literal output/result:
${read('BASELINE_REPRO.log').trim()}
exit=0

MODIFIED
command=node --test tests/*.test.mjs desktop/tests/*.test.cjs
input=modified code; 12 source hashes in hashes.json; real local process/HTTP/SQLite fixtures
literal output/result:
${totals('MODIFIED.log')}
exit=0
Coverage includes 25 new tests: profile-bound/replayed proof, known failed spawn versus UNKNOWN, parallel real port bind race, proven reattachment/stop, live old-bundle upgrade refusal, employee SQLite/browser bytes, read-only future contracts, private metadata links, legacy boundaries and exact-loopback token lookup.
Hard-exit inputs=prepared/detached/switched/committed checkpoints; actual independent child process exit=73 at each checkpoint. Recovery restores the old junction before commit or retains the new one after commit; persona/memory/schema and other employee files are not reset. This is dependency-mount migration, not an application-schema downgrade claim.

STALE PACKAGE GATE
command=node desktop/scripts/verify-staged-runtime.cjs
input=previous staged identity module after authoritative source changed
literal output/result=${read('STALE_GATE.log').trim()}
exit=1 (expected rejection)
Corrected by hash-guarded increment of two identity-module copies and full inventory regeneration:
${read('STAGE_REFRESH.log').trim()}
exit=0

UNPACKED BUILD
cwd=${path.join(root,'desktop')}
command=node node_modules/electron-builder/cli.js --win --x64 --dir
input=current verified stage, profile contract1, identity protocol1, existing Naumi logo resources, bundled native browser/Node/DingTalk
literal output/result=${gate}
exit=0
full log=BUILD_DIR.log
binary=${path.join(root,'runtime/naumi-desktop-release/win-unpacked/Naumi.exe')}
Signing status=builder skipped signing because no certificate is configured; no NSIS installation was performed here.

PACKAGE / ASAR CONTRACT
command=node scripts/verify-desktop-lifecycle-package.mjs
input=actual npm --ignore-scripts pack and unpacked resources/app.asar + bundled backend
literal output/result:
${read('PACKAGE_CONTRACT.log').trim()}
exit=0

REAL DESKTOP LIFECYCLE
command=node desktop/scripts/verify-desktop-lifecycle.mjs
input=two independent temporary userData directories, pure System32 PATH, one controlled identical-logo server on the preferred port, native browser fixture, retained EmployeeStore schema1 and explicit UNKNOWN data fixture
literal output/result:
${read('DESKTOP_LIFECYCLE.log').trim()}
exit=0
Confirmed=profiles/ports separated; foreign service left intact; browser cookie retained and not leaked to other profile; normal shutdown observed; normal restart preserved identity/persona/memory; parent-only crash retained a proven backend; new desktop reused original backend PID and gracefully stopped it on close. UNKNOWN refers to a retained explicit data fixture; real proactive AI and gateway hard-kill receipts were independently verified in M4, not re-executed here.

ROLLBACK
command=D:/DEV/Git/bin/bash.exe evidence/desktop-lifecycle/ROLLBACK.sh --test
input=another source copy, old source snapshots and retained persona/memory fixture; active application/user data excluded
literal output/result:
${read('ROLLBACK.log').trim()}
exit=0
restored behavior/status=8 original files restored, 4 new files removed, original Logo-only attachment behavior restored in the copy, instance protocol absent; 268 baseline tests pass; persona/memory/schema1 retained; live profile untouched and modified implementation retained. Source-module rollback only: installed-version/application-schema downgrade remains a whole-M5 gate.

LIVE READ-ONLY CHECK
command=node scripts/check-bot-runtime.mjs E:/Workspace/naumi-desktop 2
literal output/result=${read('LIVE_RUNTIME.log').trim()}
exit=0

Remaining full-goal gates=remote enterprise connection/session bridge and first enrollment; business-schema upgrade and installed-version rollback; NSIS install/upgrade/uninstall; signing/dependency review; employee authorization/real model routes/business acceptance. Full M1-M5 objective remains active.
`);console.log('VERIFICATION_WRITTEN baseline=268 modified=293 rollback=268 desktop_profiles=2 full_goal=active');
