# DeepSeek Harness Local

## 开发协作

开工前阅读 [项目规则](AGENTS.md)、[协作与交接说明](docs/AGENT_COLLABORATION.md) 及相关模块文档。规则适用于本仓库；文档变更不触发业务发布。

## Naumi 定制工作空间

当前运行 Naumi 企业协作定制插件，入口仍是本机3080；桌面快捷方式为 `Naumi 企业协作`。工作台、项目与需求、交付中心、设计中心和系统连接使用原生面板，不替换原会话/模型/工具内核。实现、已验证范围与真实账号待验收项见 [定制记录](docs/implementation/NAUMI_CUSTOMIZATION.md)。

```powershell
.\Start-Naumi.ps1 -Open
npm run naumi:test
```

Official `@deepseek-ai/dsh@0.2.2-rc.1`, pinned for a Windows local deployment.

```powershell
npm ci --no-audit --no-fund
npm start
npm run verify
npm stop
```

The PowerShell launcher runs the official Web profile in the background at `http://127.0.0.1:3080`, stores application data in `.dsh`, and keeps logs and launch-token shortcuts out of Git. Use `./Start-DeepSeek.ps1 -Open` for the authenticated browser link.

Copy `config/cordis.patch.yml` to `.dsh/cordis.patch.yml` on a fresh installation to select the light theme and disable DeepSeek session-log uploads. Existing application preferences are not overwritten by the launcher. OpenTelemetry is disabled by the launcher environment.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Chinese setup and operation notes and [VERIFICATION.txt](VERIFICATION.txt) for command-level results. Configure a model key in Settings → Models; credentials never belong in Git.

The current installation includes eight CC Switch groups and 38 Harness-verified model routes; see [CCSWITCH.md](CCSWITCH.md). Only credential references are versioned. Actual keys and the rollback credential snapshots remain in the ignored local application home.

Upstream: https://github.com/deepseek-ai/deepseek-harness
