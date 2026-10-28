param([switch]$InstallOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$tools = Join-Path $PSScriptRoot '.tools'
$nodeDir = Join-Path $tools 'node'
$env:Path = "$nodeDir;$env:Path"
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$supported = $false
if ($nodeCommand) {
    $nodeVersion = & $nodeCommand.Source -p 'process.versions.node.match(/^\d+/)[0]'
    $supported = $LASTEXITCODE -eq 0 -and [int]$nodeVersion -ge 22
}
if (-not $supported) {
    $osArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $arch = switch ($osArch) { 'ARM64' { 'arm64' } 'AMD64' { 'x64' } default { throw 'Use 64-bit Windows (x64 or ARM64).' } }
    New-Item -ItemType Directory -Force -Path $tools | Out-Null
    $checksums = (Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt').Content
    $line = ($checksums -split "`n" | Where-Object { $_ -match " node-v[0-9.]+-win-$arch\.zip\s*$" } | Select-Object -First 1).Trim()
    if (-not $line) { throw 'Cannot find the Node 22 download checksum.' }
    $fields = $line -split '\s+'
    $archiveName = $fields[1]
    $archive = Join-Path $tools $archiveName
    Write-Host "Installing project-local $archiveName..."
    Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/latest-v22.x/$archiveName" -OutFile $archive
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -ne $fields[0]) { throw 'Node download checksum mismatch.' }
    $unpack = Join-Path $tools 'node-unpack'
    Expand-Archive -LiteralPath $archive -DestinationPath $unpack -Force
    $extracted = Join-Path $unpack ($archiveName -replace '\.zip$', '')
    New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
    Copy-Item -Path (Join-Path $extracted '*') -Destination $nodeDir -Recurse -Force
    Remove-Item -LiteralPath $archive -Force
    Remove-Item -LiteralPath $unpack -Recurse -Force
}
$setupArgs = @('scripts/setup.cjs')
if ($InstallOnly) { $setupArgs += '--install-only' }
& node.exe @setupArgs
exit $LASTEXITCODE
