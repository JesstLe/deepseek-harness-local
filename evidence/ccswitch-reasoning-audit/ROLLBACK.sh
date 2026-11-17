#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node "$HERE/rollback.mjs" "${1:?usage: ROLLBACK.sh PATH_TO_MARKED_COPY}"
