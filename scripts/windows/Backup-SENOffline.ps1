[CmdletBinding()]
param([string]$InstallRoot = "C:\SEN Offline", [string]$PostgresBin = "C:\Program Files\PostgreSQL\17\bin")
$ErrorActionPreference = "Stop"
$envFile = Join-Path $InstallRoot ".env"
if (-not (Test-Path -LiteralPath $envFile)) { throw "SEN Offline configuration was not found." }
$settings = @{}
Get-Content -LiteralPath $envFile | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { $settings[$matches[1]] = $matches[2] } }
$dataRoot = $settings.SEN_DATA_ROOT
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $dataRoot "backups\$stamp"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
& (Join-Path $PostgresBin "pg_dump.exe") --dbname=$settings.DATABASE_URL --format=custom --file=(Join-Path $backupRoot "sen.database.dump")
Copy-Item -LiteralPath (Join-Path $dataRoot "storage") -Destination (Join-Path $backupRoot "storage") -Recurse -Force
Write-Host "Backup completed: $backupRoot"
