#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Restore and test only a second isolated copy; retain the working update entry.
node scripts/desktop-update-evidence.mjs rollback --test
