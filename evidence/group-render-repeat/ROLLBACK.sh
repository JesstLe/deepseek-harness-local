#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
target="${1:?Usage: ROLLBACK.sh rollback-copy.js}"
test "$target" = rollback-copy.js
echo 'c36d6386367cd7e284051b7c3cb6693dbea40ee735cbaf38ae7273297f6cb846  original/bot-chat-markdown.js' | sha256sum -c - >/dev/null
cmp -s -- "$target" MODIFIED_FILE.js
cp -- original/bot-chat-markdown.js "$target"
echo 'c36d6386367cd7e284051b7c3cb6693dbea40ee735cbaf38ae7273297f6cb846  rollback-copy.js' | sha256sum -c - >/dev/null
echo 'ROLLBACK original_sha256=match modified_source=retained'
