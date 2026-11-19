#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -W)
exec node "$ROOT/scripts/verify-cua-state.mjs" "${1:-rollback-test}" "${2:-}"
