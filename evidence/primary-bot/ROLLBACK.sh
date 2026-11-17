#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
node "$DIR/restore-source.mjs" "${1:?Pass a marked source-copy directory}"
