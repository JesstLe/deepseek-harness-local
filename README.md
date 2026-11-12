# DeepSeek Harness Local

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
