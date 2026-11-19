#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd -W)"
python -X utf8 - "$HERE" "${1:?Pass marked isolated source-copy path}" <<'PY'
import pathlib,json,hashlib,sys
o=pathlib.Path(sys.argv[1]).resolve();r=pathlib.Path(sys.argv[2]).resolve();assert (r/'.desktop-model-import47-copy').is_file(),'COPY_REQUIRED';assert r!=o.parents[1],'ACTIVE_SOURCE_DENIED'
m=json.loads((o/'manifest.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
for row in m['files']:
 p=(r/row['file']).resolve();assert r in p.parents;assert sha(p.read_bytes())==row['after'],'SOURCE_DRIFT'
for row in m['files']:(r/row['file']).unlink()
print('DESKTOP_MODEL_SOURCE_ROLLBACK restored=0 removed='+str(len(m['files']))+' active=UNCHANGED')
PY
