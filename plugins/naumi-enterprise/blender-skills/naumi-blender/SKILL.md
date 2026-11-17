---
name: naumi-blender
description: Use Naumi's bundled Blender MCP for local 3D scene inspection, bpy modeling, materials, rendering, and exports. Requires a Blender connection; no global Python, uv or manual MCP setup.
---

# Blender

1. Call `mcp__naumi_blender__blender_status`. Bundled MCP, installed engine and actual connected session are separate facts. If disconnected, direct the user to Settings → Blender → 启动 Blender. Never provision a paid generation service or switch models for this integration.
2. Call `mcp__naumi_blender__get_scene_info`, then inspect exact objects before edits. Preserve unrelated objects and unsaved work. The managed Blender window is independent from other existing Blender processes.
3. `execute_blender_code` runs full Python/bpy on Blender's main thread and uses the normal tool permission/approval lifecycle; it is not a Python sandbox. Use small, explicit operations and a stable UUID `requestId` for each distinct mutation.
4. On timeout or lost reply, call `operation_status` with that UUID. Do not rerun the same effect with a new UUID. An unknown receipt is not a failed operation. A receipt from a preceding Blender instance does not prove the new scene contains that result.
5. `render_preview` requires an existing camera, returns an image, and restores the scene's render configuration. It is not final file delivery. Save requested .blend, exported meshes and rendered images in the task's actual workspace and use the existing native `present` tool to deliver verified files.
6. Blender may be installed separately. Prefer the detected local version; do not silently download another multi-hundred-megabyte engine. The main Naumi installer does not bundle Blender itself. No telemetry or paid asset generation is included in this bridge.
