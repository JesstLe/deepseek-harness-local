#!/usr/bin/env bash
set -euo pipefail
[ "$#" -eq 1 ] || { echo 'Usage: ROLLBACK.sh COPY_OF_MODIFIED_AGENTS'; exit 2; }
here="$(cd -- "$(dirname -- "$0")" && pwd)"
actual="$(sha256sum -- "$1" | cut -d ' ' -f 1)"
[ "$actual" = '71113b7b86f2c204394473fd6cfb8c75841816ac737b31b9025ad296f434516c' ] || { echo 'ROLLBACK_HASH_MISMATCH'; exit 3; }
[ "$(sha256sum -- "$here/BASELINE_AGENTS.md" | cut -d ' ' -f 1)" = '4833458b9b74d486f81968a5d8b54fa89edcf35600c4d29d93800c2db59aab35' ] || { echo 'BASELINE_HASH_MISMATCH'; exit 4; }
cp -- "$here/BASELINE_AGENTS.md" "$1"
echo 'ROLLBACK_RESTORED original_hash=PASS'
