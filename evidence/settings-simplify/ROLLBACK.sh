#!/usr/bin/env sh
set -eu
[ "$#" -eq 1 ] || { echo "Usage: ROLLBACK.sh COPY_DIRECTORY" >&2; exit 64; }
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$HERE/rollback.mjs" "$1"
