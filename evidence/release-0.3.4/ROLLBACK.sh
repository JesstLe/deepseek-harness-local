#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Verify source rollback in a separate copy; keep the built/released installer unchanged.
node scripts/release-034-evidence.mjs rollback --test
