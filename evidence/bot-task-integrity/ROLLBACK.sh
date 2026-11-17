#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/bin:/bin:$PATH"
HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
node "$HERE/rollback.mjs" "$@"
