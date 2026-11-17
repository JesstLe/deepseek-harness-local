#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -W)"
python -X utf8 - "$SCRIPT_DIR" "${1:?Pass the absolute marked rollback-copy directory}" <<'PY'
import pathlib,json,hashlib,sys
e=pathlib.Path(sys.argv[1]).resolve();root=pathlib.Path(sys.argv[2]).resolve()
assert (root/'.naumi-blender-rollback-copy').is_file(), 'COPY_MARKER_REQUIRED'
assert root!=e.parents[1], 'ACTIVE_WORKSPACE_DENIED'
m=json.loads((e/'artifact-manifest.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
for r in m['files']:
 p=(root/r['path']).resolve();assert root in p.parents, 'PATH_ESCAPE'
 assert sha(p.read_bytes())==r['after'], 'COPY_DRIFT '+r['path']
 if r['before']:assert sha((e/'original'/r['path']).read_bytes())==r['before'], 'ORIGINAL_DRIFT'
for r in m['files']:
 p=root/r['path']
 if r['before']:p.write_bytes((e/'original'/r['path']).read_bytes());assert sha(p.read_bytes())==r['before']
 else:p.unlink();assert not p.exists()
print('BLENDER_ROLLBACK_PASS restored='+str(sum(bool(r['before']) for r in m['files']))+' removed='+str(sum(not r['before'] for r in m['files']))+' source=UNCHANGED')
PY
