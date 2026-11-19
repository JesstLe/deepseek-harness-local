---
name: naumi-desktop
description: Use Naumi CUA to operate desktop apps from screenshots. One Session owns the desktop. Observe before every action and inspect the returned image.
---
# Naumi CUA

Use only `naumi_cua` for desktop UI actions. The previous agent-desktop tools are removed. Naumi creation, Blender and the native browser remain dedicated integrations, not alternate desktop input engines.

1. `{"action":"status"}` checks the local Driver connection. A vision-capable model and native attachments are required to operate.
2. `{"action":"list_windows","app":"..."}` discovers exact pid/window_id. Never guess them.
3. `{"action":"observe","pid":PID,"window_id":WINDOW_ID}` returns a real screenshot, dimensions and observationId. Omit both IDs for the visible primary desktop. Window captures contain no accessibility tree.
4. Inspect that image. Call click/double_click/right_click/type_text/press_key/hotkey/scroll/drag with its observationId. Coordinates refer to the returned PNG, not original desktop size. Do not pass another target: the host binds the observed target and Session. Scroll requires x/y. Each ID expires in 30 seconds and is consumed before dispatch.
5. Every action returns a fresh screenshot. Inspect it to verify the requested effect; a native dispatch receipt is not proof of success. Use the NEW observationId for the next action.
6. `{"action":"release"}` ends the visible session and frees the desktop. A different Bot sees CUA_DESKTOP_BUSY, not a fallback engine. Normal idle leases expire after 120 seconds; unknown actions must be reconciled by fresh observation first.

Exact-window actions default to background delivery. Only after the driver reports background_unavailable or a fresh screenshot verifies a no-op, explicitly request foreground delivery using a NEW observationId. Never automatically repeat an uncertain click, payment, send or submit.

CUA_ACTION_UNKNOWN / driver error / cancellation means OBSERVE before any further action. Do not claim success or replay. Stale IDs require new observation. Lock screen/UAC stays with the user. Existing Harness tool permissions, enterprise admission, account login and approvals remain authoritative. Screenshots are admitted through the original native durable attachment channel; do not fabricate cards or upload them elsewhere. Never use raw shell/DOM/UIA scripts to evade a denied CUA operation.

Maintenance: `npm run desktop:prepare` provisions only the pinned signed binary at build time; `npm run desktop:status` checks it locally. Employee runtime is offline and does not install scheduled tasks, global PATH entries, cloud relay, optional perception models or another model backend.

## Screenshot readiness

The status result includes imageAdmission for the exact active provider/model and native attachment service. Driver/UIA/PostMessage readiness alone does not prove image input readiness. On CUA_MODEL_IMAGE_INPUT_REQUIRED, inspect that exact model connection's input capability; use a verified text+image declaration for the configured gateway, not a guess based on the model name. CUA_ATTACHMENT_STORE_REQUIRED and CUA_MODEL_METADATA_UNAVAILABLE identify distinct host failures. Never remove the image guard or operate without a delivered screenshot.
