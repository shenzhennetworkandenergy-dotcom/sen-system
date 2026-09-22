[CmdletBinding()]
param([string]$OutputPath = (Join-Path $PSScriptRoot "..\..\sen-offline-release"))
$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $projectRoot
try {
  $requiredVendorFiles = @(
    "vendor\postgresql\postgresql-17.10-1-windows-x64.exe",
    "vendor\postgrest\postgrest.exe",
    "vendor\winsw\WinSW.exe"
  )
  foreach ($requiredVendorFile in $requiredVendorFiles) {
    if (-not (Test-Path -LiteralPath $requiredVendorFile -PathType Leaf)) {
      throw "Offline runtime asset is missing: $requiredVendorFile"
    }
  }

  # Build the standalone server with the native adapter selected. These are
  # build-time defaults only; the installer writes the real local values.
  $nativeBuildEnvironment = @{
    SEN_BACKEND = "native"
    NEXT_PUBLIC_SEN_BACKEND = "native"
    DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql://postgres@127.0.0.1:5432/sen" }
    SESSION_SECRET = if ($env:SESSION_SECRET) { $env:SESSION_SECRET } else { "offline-build-session-secret-" + ([guid]::NewGuid().ToString("N")) }
    SEN_DATA_ROOT = if ($env:SEN_DATA_ROOT) { $env:SEN_DATA_ROOT } else { Join-Path $projectRoot ".offline-test\data" }
    SEN_PUBLIC_ORIGIN = if ($env:SEN_PUBLIC_ORIGIN) { $env:SEN_PUBLIC_ORIGIN } else { "http://127.0.0.1:3000" }
    SEN_POSTGREST_URL = if ($env:SEN_POSTGREST_URL) { $env:SEN_POSTGREST_URL } else { "http://127.0.0.1:3002" }
    SEN_BIND_HOST = if ($env:SEN_BIND_HOST) { $env:SEN_BIND_HOST } else { "127.0.0.1" }
    HOSTNAME = if ($env:HOSTNAME) { $env:HOSTNAME } else { "127.0.0.1" }
    PORT = if ($env:PORT) { $env:PORT } else { "3000" }
  }
  $originalNativeBuildEnvironment = @{}
  foreach ($name in $nativeBuildEnvironment.Keys) {
    $originalNativeBuildEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, [string]$nativeBuildEnvironment[$name], "Process")
  }

  npm run native:schema
  if ($LASTEXITCODE -ne 0) { throw "Native schema generation failed." }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
  if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Recurse -Force }
  New-Item -ItemType Directory -Path $OutputPath | Out-Null
  Copy-Item -Path ".next\standalone\*" -Destination $OutputPath -Recurse -Force
  New-Item -ItemType Directory -Path (Join-Path $OutputPath ".next") -Force | Out-Null
  Copy-Item -LiteralPath ".next\static" -Destination (Join-Path $OutputPath ".next\static") -Recurse -Force
  if (Test-Path public) { Copy-Item -LiteralPath "public" -Destination (Join-Path $OutputPath "public") -Recurse -Force }
  foreach ($folder in @("database", "vendor")) { Copy-Item -LiteralPath $folder -Destination (Join-Path $OutputPath $folder) -Recurse -Force }
  New-Item -ItemType Directory -Path (Join-Path $OutputPath "scripts\windows") -Force | Out-Null
  Copy-Item -LiteralPath "scripts\windows\Install-SENOffline.ps1" -Destination (Join-Path $OutputPath "scripts\windows\Install-SENOffline.ps1")
  Copy-Item -LiteralPath "scripts\windows\Backup-SENOffline.ps1" -Destination (Join-Path $OutputPath "scripts\windows\Backup-SENOffline.ps1")
  Copy-Item -LiteralPath "scripts\windows\Migrate-FromSupabase.ps1" -Destination (Join-Path $OutputPath "scripts\windows\Migrate-FromSupabase.ps1")
  Copy-Item -LiteralPath "scripts\native-set-password.mjs" -Destination (Join-Path $OutputPath "scripts\native-set-password.mjs")
  Copy-Item -LiteralPath "scripts\migrate-supabase-storage.mjs" -Destination (Join-Path $OutputPath "scripts\migrate-supabase-storage.mjs")
  Copy-Item -LiteralPath (Get-Command node).Source -Destination (Join-Path $OutputPath "node.exe")
  Set-Content -LiteralPath (Join-Path $OutputPath "VERSION.txt") -Value ("Built " + (Get-Date).ToString("o")) -Encoding utf8
  Write-Host "Offline bundle ready at $OutputPath"
} finally {
  if ($originalNativeBuildEnvironment) {
    foreach ($name in $originalNativeBuildEnvironment.Keys) {
      [Environment]::SetEnvironmentVariable($name, $originalNativeBuildEnvironment[$name], "Process")
    }
  }
  Pop-Location
}
