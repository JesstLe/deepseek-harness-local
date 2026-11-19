#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node "$HERE/ROLLBACK.cjs" "${1:?marked source copy required}"
