[CmdletBinding()]
param(
  [string]$InstallRoot = "C:\SEN Offline",
  [string]$DataRoot = "C:\SEN Data",
  [string]$PostgresBin = "C:\Program Files\PostgreSQL\17\bin",
  [string]$LanHost = "127.0.0.1",
  [int]$Port = 3000,
  [pscredential]$PostgresAdministrator
)
$ErrorActionPreference = "Stop"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Run this installer from an elevated PowerShell window." }
$bundleRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$psql = Join-Path $PostgresBin "psql.exe"
$createdb = Join-Path $PostgresBin "createdb.exe"
if (-not (Test-Path -LiteralPath $psql)) {
  $postgresInstaller = Join-Path $bundleRoot "vendor\postgresql\postgresql-17.10-1-windows-x64.exe"
  if (-not (Test-Path -LiteralPath $postgresInstaller)) { throw "The bundled PostgreSQL 17 installer is missing." }
  $postgresPassword = -join ((1..48) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) })
  $postgresData = Join-Path $DataRoot "PostgreSQL"
  New-Item -ItemType Directory -Path $postgresData -Force | Out-Null
  $install = Start-Process -FilePath $postgresInstaller -ArgumentList @("--mode", "unattended", "--unattendedmodeui", "none", "--superpassword", $postgresPassword, "--servicepassword", $postgresPassword, "--serverport", "5432", "--prefix", "C:\Program Files\PostgreSQL\17", "--datadir", $postgresData) -WindowStyle Hidden -Wait -PassThru
  if ($install.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $psql)) { throw "PostgreSQL 17 installation failed with exit code $($install.ExitCode)." }
  $securePostgresPassword = ConvertTo-SecureString $postgresPassword -AsPlainText -Force
  $PostgresAdministrator = [pscredential]::new("postgres", $securePostgresPassword)
}
if (-not $PostgresAdministrator) { $PostgresAdministrator = Get-Credential -UserName postgres -Message "Enter the PostgreSQL administrator password" }
$env:PGPASSWORD = $PostgresAdministrator.GetNetworkCredential().Password
$appPassword = -join ((1..48) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) })
$sessionSecret = -join ((1..96) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) })
try {
  & $psql -h 127.0.0.1 -U $PostgresAdministrator.UserName -d postgres -v ON_ERROR_STOP=1 -c "select 1" | Out-Null
  $exists = & $psql -h 127.0.0.1 -U $PostgresAdministrator.UserName -d postgres -tAc "select 1 from pg_database where datname='sen'"
  if (-not $exists) {
    & $createdb -h 127.0.0.1 -U $PostgresAdministrator.UserName sen
    & $psql -h 127.0.0.1 -U $PostgresAdministrator.UserName -d sen -v ON_ERROR_STOP=1 -f (Join-Path $bundleRoot "database\native\schema.sql")
    & $psql -h 127.0.0.1 -U $PostgresAdministrator.UserName -d sen -v ON_ERROR_STOP=1 -f (Join-Path $bundleRoot "database\native\seed.sql")
  }
  & $psql -h 127.0.0.1 -U $PostgresAdministrator.UserName -d sen -v ON_ERROR_STOP=1 -c "alter role sen_app login password '$appPassword';"
} finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $InstallRoot,$DataRoot,(Join-Path $DataRoot "storage"),(Join-Path $DataRoot "logs"),(Join-Path $DataRoot "backups") -Force | Out-Null
Copy-Item -Path (Join-Path $bundleRoot "*") -Destination $InstallRoot -Recurse -Force
$databaseUrl = "postgresql://sen_app:$appPassword@127.0.0.1:5432/sen"
@"
SEN_BACKEND=native
NEXT_PUBLIC_SEN_BACKEND=native
DATABASE_URL=$databaseUrl
SESSION_SECRET=$sessionSecret
SEN_DATA_ROOT=$DataRoot
SEN_PUBLIC_ORIGIN=http://${LanHost}:$Port
SEN_POSTGREST_URL=http://127.0.0.1:3002
SEN_BIND_HOST=0.0.0.0
HOSTNAME=0.0.0.0
PORT=$Port
"@ | Set-Content -LiteralPath (Join-Path $InstallRoot ".env") -Encoding utf8
@"
db-uri = "$databaseUrl"
db-schemas = "public, murshida_manzil"
db-anon-role = "service_role"
server-host = "127.0.0.1"
server-port = 3002
db-pool = 20
"@ | Set-Content -LiteralPath (Join-Path $InstallRoot "postgrest.conf") -Encoding utf8
$serviceWrapper = Join-Path $InstallRoot "vendor\winsw\WinSW.exe"
Copy-Item -LiteralPath $serviceWrapper -Destination (Join-Path $InstallRoot "SENPostgREST.exe") -Force
Copy-Item -LiteralPath $serviceWrapper -Destination (Join-Path $InstallRoot "SENWebsite.exe") -Force
@"
<service><id>SENPostgREST</id><name>SEN Database Gateway</name><description>Local-only SEN PostgreSQL query gateway.</description><executable>$InstallRoot\vendor\postgrest\postgrest.exe</executable><arguments>$InstallRoot\postgrest.conf</arguments><workingdirectory>$InstallRoot</workingdirectory><env name="PATH" value="$PostgresBin;%PATH%"/><logpath>$DataRoot\logs</logpath><log mode="roll"/><startmode>Automatic</startmode><onfailure action="restart" delay="10 sec"/></service>
"@ | Set-Content -LiteralPath (Join-Path $InstallRoot "SENPostgREST.xml") -Encoding utf8
@"
<service><id>SENWebsite</id><name>SEN Website</name><description>SEN offline LAN website.</description><executable>$InstallRoot\node.exe</executable><arguments>$InstallRoot\server.js</arguments><workingdirectory>$InstallRoot</workingdirectory><logpath>$DataRoot\logs</logpath><log mode="roll"/><startmode>Automatic</startmode><depend>SENPostgREST</depend><onfailure action="restart" delay="10 sec"/></service>
"@ | Set-Content -LiteralPath (Join-Path $InstallRoot "SENWebsite.xml") -Encoding utf8
foreach ($service in @("SENPostgREST", "SENWebsite")) {
  $exe = Join-Path $InstallRoot "$service.exe"
  & $exe stop 2>$null
  & $exe uninstall 2>$null
  & $exe install
  & $exe start
}
Write-Host "SEN Offline is installed and running at http://${LanHost}:$Port"
