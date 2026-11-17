#!/usr/bin/env bash
set -euo pipefail
# Copy-only rollback. TARGET must be a marked task-owned runtime fixture.
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node "$HERE/ROLLBACK.cjs" "${1:?copy target required}"
