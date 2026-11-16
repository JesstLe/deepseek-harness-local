$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$dir=Join-Path $root 'evidence/naumi-desktop'
$manifest=Get-Content -Raw -LiteralPath (Join-Path $dir 'change-manifest.json') | ConvertFrom-Json
$zipPath=Join-Path $dir 'MODIFIED_FILE.zip'
if (Test-Path -LiteralPath $zipPath) { throw 'Evidence ZIP exists; preserve it before regenerating.' }
$zip=[System.IO.Compression.ZipFile]::Open($zipPath,[System.IO.Compression.ZipArchiveMode]::Create)
try { foreach($item in $manifest) { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $root $item.path),$item.path,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null } } finally {$zip.Dispose()}
$zip=[System.IO.Compression.ZipFile]::OpenRead($zipPath)
try { foreach($item in $manifest) { $entry=$zip.GetEntry($item.path);if(!$entry){throw 'ZIP entry missing'};$stream=$entry.Open();try {$hash=[Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($stream)).ToLower()} finally {$stream.Dispose()};if($hash -ne $item.modifiedSHA256){throw ('ZIP hash mismatch: '+$item.path)} } } finally {$zip.Dispose()}
Write-Output "MODIFIED_FILE_REOPEN entries=$($manifest.Count) hashes=PASS"
