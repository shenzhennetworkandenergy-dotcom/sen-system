$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtimeRoot = Join-Path $projectRoot ".native-test-data"
$logRoot = Join-Path $runtimeRoot "logs"
$postgresBin = "C:\Program Files\PostgreSQL\17\bin"
$postgresData = Join-Path $runtimeRoot "stock-out-postgres"
$postgresLog = Join-Path $logRoot "local-review-postgres.log"
$postgrestExe = Join-Path $runtimeRoot "postgrest-runtime\postgrest.exe"
$postgrestConfig = ".native-test-data\postgrest-stock-out.conf"
$nodeExe = (Get-Command node.exe).Source
$stateLog = Join-Path $logRoot "local-review-state.log"
$errorLog = Join-Path $logRoot "local-review-errors.log"

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

function Test-LocalPort {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Wait-LocalPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalPort -Port $Port) { return }
    Start-Sleep -Milliseconds 250
  }

  throw "Local service did not start on port $Port."
}

try {
  if (-not (Test-Path -LiteralPath $postgresData)) { throw "Local PostgreSQL data is missing." }
  if (-not (Test-Path -LiteralPath $postgrestExe)) { throw "Local PostgREST runtime is missing." }

  if (-not (Test-LocalPort -Port 55433)) {
    $pgCtl = Join-Path $postgresBin "pg_ctl.exe"
    & $pgCtl start -D $postgresData -l $postgresLog -o "-p 55433 -h 127.0.0.1" -w -t 60 | Out-Null
    if ($LASTEXITCODE -ne 0 -and -not (Test-LocalPort -Port 55433)) {
      throw "Local PostgreSQL could not be started."
    }
  }
  Wait-LocalPort -Port 55433

  $env:PATH = "$postgresBin;$env:PATH"
  if (-not (Test-LocalPort -Port 3003)) {
    Start-Process -FilePath $postgrestExe `
      -ArgumentList @($postgrestConfig) `
      -WorkingDirectory $projectRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $logRoot "local-review-postgrest-output.log") `
      -RedirectStandardError (Join-Path $logRoot "local-review-postgrest-errors.log")
  }
  Wait-LocalPort -Port 3003

  $env:SEN_BACKEND = "native"
  $env:NEXT_PUBLIC_SEN_BACKEND = "native"
  $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:55433/sen_stock_out_test"
  $env:SEN_POSTGREST_URL = "http://127.0.0.1:3003"
  $env:SEN_PUBLIC_ORIGIN = "http://127.0.0.1:3100"

  if (-not (Test-LocalPort -Port 3100)) {
    Start-Process -FilePath $nodeExe `
      -ArgumentList @("node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100") `
      -WorkingDirectory $projectRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $logRoot "local-review-next-output.log") `
      -RedirectStandardError (Join-Path $logRoot "local-review-next-errors.log")
  }
  Wait-LocalPort -Port 3100 -TimeoutSeconds 60

  "$(Get-Date -Format o) Local SEN review site is ready at http://127.0.0.1:3100/login" | Set-Content -LiteralPath $stateLog
} catch {
  "$(Get-Date -Format o) $($_.Exception.Message)" | Add-Content -LiteralPath $errorLog
  exit 1
}
