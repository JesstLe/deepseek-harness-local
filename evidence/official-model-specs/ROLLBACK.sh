#!/usr/bin/env bash
set -euo pipefail
node "$(cd -- "$(dirname -- "$0")" && pwd)/rollback.mjs" "${1:?Pass an explicit source copy path}"
