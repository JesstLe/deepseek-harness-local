#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
exec "D:/DEV/NodeJS/node.exe" "$HERE/rollback-model-gateway.mjs" "${1:---test}"
