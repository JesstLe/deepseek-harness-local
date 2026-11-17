#!/usr/bin/env bash
set -euo pipefail
node "$(dirname "$0")/rollback.mjs" "${1:?Usage: ROLLBACK.sh separate-copy-root}"
