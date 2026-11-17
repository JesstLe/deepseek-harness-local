#!/usr/bin/env bash
set -euo pipefail
# Copy-only rollback: never touches the design module or running application.
cd "$(dirname "$0")"
target="${1:?Usage: ROLLBACK.sh copy.mjs}"
case "$target" in */*|*\\*|ORIGINAL_FILE.mjs|MODIFIED_FILE.mjs) echo 'COPY_TARGET_REQUIRED'; exit 2;; esac
test -f "$target"
expected='3e2b01cad958a86ce39d24ecd3638bda4d9d80c9211a772c7462f41dbd37664c'
echo "$expected  ORIGINAL_FILE.mjs" | sha256sum -c - >/dev/null
cp -- ORIGINAL_FILE.mjs "$target"
echo "$expected  $target" | sha256sum -c - >/dev/null
echo 'ROLLBACK original_sha256=match copy_only=true'
