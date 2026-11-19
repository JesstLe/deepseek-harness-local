#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd -W)"
python -X utf8 - "$HERE" "${1:?Pass an absolute marked rollback-copy directory}" <<'PY'
import pathlib,json,hashlib,sys
e=pathlib.Path(sys.argv[1]).resolve();r=pathlib.Path(sys.argv[2]).resolve();assert (r/'.naumi-unified-runtime-rollback-copy').is_file(),'COPY_MARKER_REQUIRED';assert r!=e.parents[1],'ACTIVE_WORKSPACE_DENIED'
m=json.loads((e/'manifest.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
for row in m['files']:
 p=(r/row['path']).resolve();assert r in p.parents,'PATH_ESCAPE';assert sha(p.read_bytes())==row['after'],'MODIFIED_COPY_DRIFT'
 if row['before']:assert sha((e/'original'/row['path']).read_bytes())==row['before'],'ORIGINAL_DRIFT'
for row in m['files']:
 p=r/row['path']
 if row['before']:p.write_bytes((e/'original'/row['path']).read_bytes());assert sha(p.read_bytes())==row['before']
 else:p.unlink();assert not p.exists()
print('UNIFIED_ROLLBACK_PASS restored='+str(sum(bool(x['before']) for x in m['files']))+' removed='+str(sum(not x['before'] for x in m['files']))+' source=UNCHANGED')
PY
