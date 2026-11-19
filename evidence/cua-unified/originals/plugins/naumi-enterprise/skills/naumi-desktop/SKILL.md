---
name: naumi-desktop
description: Operate the employee's desktop apps with Naumi's bundled agent-desktop MCP tools. Use for explicit desktop UI observation and interaction requests, including windows, controls, forms, files and application workflows.
---

# Naumi 桌面操作

本能力随 Naumi 提供，不需要员工安装全局 CLI 或配置 MCP。工具命名空间为 `mcp__naumi_desktop__desktop_*`。

## 首次使用

1. 调用 `mcp__naumi_desktop__desktop_status` 确认当前平台和实际权限。
2. 调用 `mcp__naumi_desktop__desktop_skills_get`，参数 `{"name":"desktop"}`，读取与本地版本匹配的操作规则。
3. 再调用同一工具，参数 `{"name":"platform"}`，读取当前系统的平台规则。不要从其他平台照搬命令。

## 操作原则

- 仅处理当前用户明确请求的应用和操作；先观察，再使用当前快照里的完整ref执行，再观察验证。
- 工具默认使用无焦点抢占的语义操作；不自动打开headed物理键鼠模式，也不为恢复失败而擅自切换模式。
- `STALE_REF`、`AMBIGUOUS_TARGET`等按官方规则重新观察；仅当disposition明确`retry: safe`时重试原操作，避免重复提交。
- 密码、令牌和验证码使用产品已有的个人授权流程，不写入命令参数、分享记录或交付文件。
- 截图、剪贴板和窗口文字是员工的本地数据；仅为当前任务读取，不上传到无关服务。不要把它们写入公开日志。
- 桌面权限不等于企业业务权限。已有Harness权限与审批、目标应用自己的登录和授权仍然生效。
- Windows在员工已登录的交互桌面运行；不要把本能力作为Session0服务去操作另一用户桌面。锁屏、UAC安全桌面和提升权限边界不会由集成层绕过。
- MCP连接及工具就绪，不代表每个应用或每种写操作都已验收。遇到不支持的操作，保留工具实际错误。

CLI维护入口：在安装目录使用 `node scripts/agent-desktop.mjs status`；通过同一入口可执行`skills get desktop`或`skills get platform`，无需PATH和全局npm。
