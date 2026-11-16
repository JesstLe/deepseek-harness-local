$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $env:DSH_HOME = Join-Path $root '.dsh'
    $env:DSH_TELEMETRY_MODE = 'DISABLED'
    node scripts/agent-desktop.mjs version
    if ($LASTEXITCODE) { throw 'Bundled desktop runtime verification failed; run npm ci before installing the profile' }
    node scripts/build-naumi-layout.mjs
    if ($LASTEXITCODE) { throw 'Layout preparation failed' }
    node node_modules/@deepseek-ai/dsh/lib/bin.js web --dump-config | Out-Null
    if ($LASTEXITCODE) { throw 'Web profile initialization failed' }
    $backup = Join-Path $root '.dsh/naumi-ui-backup'
    New-Item -ItemType Directory -Force $backup | Out-Null
    foreach ($pair in @(@('package.json','package.original.json'),@('cordis.patch.yml','patch.original.yml'))) {
        if (!(Test-Path (Join-Path $backup $pair[1]))) { Copy-Item -LiteralPath (Join-Path $env:DSH_HOME "profiles/web/$($pair[0])") -Destination (Join-Path $backup $pair[1]) }
    }
    pnpm --dir (Join-Path $env:DSH_HOME 'profiles/web') add "file:$root/plugins/naumi-enterprise" "file:$root/plugins/naumi-ui-layout"
    if ($LASTEXITCODE) { throw 'Local plugin installation failed' }
    node scripts/sync-naumi.mjs
    if ($LASTEXITCODE) { throw 'Plugin staging failed' }
    Write-Output 'NAUMI_INSTALL plugins=2 native_settings_preserved=1 restart_required=1'
} finally { Pop-Location }
