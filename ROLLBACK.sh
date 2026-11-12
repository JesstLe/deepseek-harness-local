#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-$ROOT/config/local.json}"
cp -- "$ROOT/evidence/deployment.original.json" "$TARGET"
cmp -- "$ROOT/evidence/deployment.original.json" "$TARGET"
printf '%s\n' 'ROLLBACK_OK original configuration restored; application data retained'
