#!/usr/bin/env bash
set -euo pipefail
[ "$#" -eq 1 ] || { echo "Usage: ROLLBACK.sh EXPLICIT_SOURCE_COPY"; exit 2; }
here="$(cd -- "$(dirname -- "$0")" && pwd)"
node "$here/rollback.mjs" "$1"
