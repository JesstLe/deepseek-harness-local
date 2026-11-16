#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
exec "${NAUMI_NODE:-node}" "$HERE/rollback-desktop-installation.mjs" "${1:---test}"
