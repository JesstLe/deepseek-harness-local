#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ "${1:-}" != "--test" ]]; then echo 'Usage: ROLLBACK.sh --test (restores only a separate source copy)' >&2; exit 2; fi
cd "$ROOT"
node scripts/installer-ui-evidence.mjs rollback --test
