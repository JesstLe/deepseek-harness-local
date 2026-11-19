#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
exec "${NAUMI_NODE:-node}" "$HERE/rollback-weixin-primary.mjs" --test "${1:?repository root required}"
