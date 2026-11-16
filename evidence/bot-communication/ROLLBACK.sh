#!/usr/bin/env bash
set -euo pipefail
HERE="${BASH_SOURCE[0]//\\//}"
HERE="${HERE%/*}"
NODE="${NAUMI_NODE_EXE:-node}"
NODE="${NODE//\\//}"
exec "$NODE" "$HERE/rollback.mjs" "${1:?Supply the explicit enterprise-plugin directory to restore}"
