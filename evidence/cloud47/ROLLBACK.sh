#!/usr/bin/env sh
set -eu
if [ "$#" -ne 1 ]; then echo "Usage: ROLLBACK.sh COPY_DIRECTORY" >&2; exit 64; fi
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$HERE/rollback.mjs" "$1"
