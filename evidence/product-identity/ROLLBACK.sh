#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
exec "${NAUMI_NODE:-node}" scripts/product-identity-evidence.mjs rollback "$@"
