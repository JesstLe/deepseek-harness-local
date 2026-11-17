#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ "${1:-}" != "--test" ]]; then echo "Usage: ROLLBACK.sh --test (separate source copy only)" >&2; exit 2; fi
cd "$ROOT"
node scripts/unified-identity-evidence.mjs rollback --test
