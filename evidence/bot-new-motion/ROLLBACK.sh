#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
target="${1:?Usage: ROLLBACK.sh rollback-copy.css}"
case "$target" in rollback-copy.css) ;; *) echo 'SEPARATE_COPY_REQUIRED'; exit 2;; esac
echo 'f80d0fdc7ae2747cf8c2bc0271813d088bf0fbea39234465c627c5cc0d28a764  original/bot-task.css' | sha256sum -c - >/dev/null
cmp -s -- "$target" MODIFIED_FILE.css
cp -- original/bot-task.css "$target"
echo 'f80d0fdc7ae2747cf8c2bc0271813d088bf0fbea39234465c627c5cc0d28a764  rollback-copy.css' | sha256sum -c - >/dev/null
echo 'ROLLBACK original_sha256=match legacy_frame=restored modified_source=retained'
