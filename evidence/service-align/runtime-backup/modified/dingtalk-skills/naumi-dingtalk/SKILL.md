---
name: naumi-dingtalk
description: Use the bundled DingTalk Workspace CLI for enterprise contacts, chats, documents, tasks and calendars.
---

# Naumi DingTalk

The desktop package provides `dws` on the managed backend PATH. Do not install another CLI,
run npx, download a replacement, or install global Agent skills. The pinned package is
`dingtalk-workspace-cli` 1.0.68, not the unrelated `dingtalk-cli` package.

1. Inspect `dws auth status --readonly --format json`. Installed, local account present,
   remote access and current Bot tool approval are separate facts. A local auth status
   does not verify current remote scopes or permission.
2. If not logged in, ask the employee to authorize their own account. Only an explicit
   employee login action should start `dws auth login`. Never export/import credentials,
   print tokens, copy another employee's configuration, or change the app's pinned CLI.
3. Discover the exact command with `dws schema --cli-path "<service command>" --compact -f json`.
   Read `effect`, confirmation, required parameters and idempotency before executing.
4. Read operations use JSON output. Preview changes with `--dry-run` where supported.
   Messages, edits, creates and deletes require the existing Harness write-action approval
   for the exact command and arguments. `--yes` only accompanies that exact employee-approved
   write through the normal permission pipeline; it never replaces approval. Do not bypass
   a pending or denied approval through a different shell, native tool, script or Agent.
5. A cancelled/timed-out write is UNKNOWN. Inspect its original receipt/resource before
   any retry. Do not infer business completion from a process exit or heartbeat.

The launcher isolates configuration under `DSH_HOME/integrations/dingtalk`, disables
automatic updates, telemetry and global skills, and removes inherited DWS/DINGTALK secrets.
The official native payload unpacks only into the employee's versioned runtime cache,
not the read-only installation directory.
Existing developer DingTalk configuration is not a source. Use business commands, not
`auth export/import/reset`, `config`, `profile`, `plugin`, `upgrade`, or `skills setup`.
