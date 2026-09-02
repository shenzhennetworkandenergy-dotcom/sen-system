[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$SourceDatabaseUrl,
  [Parameter(Mandatory)][string]$SourceSupabaseUrl,
  [Parameter(Mandatory)][string]$SourceServiceRoleKey,
  [Parameter(Mandatory)][string]$BootstrapAdminEmail,
  [string]$InstallRoot = "C:\SEN Offline",
  [string]$PostgresBin = "C:\Program Files\PostgreSQL\17\bin"
)
$ErrorActionPreference = "Stop"
$settings = @{}
Get-Content -LiteralPath (Join-Path $InstallRoot ".env") | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { $settings[$matches[1]] = $matches[2] } }
$dump = Join-Path $env:TEMP ("sen-public-data-" + [guid]::NewGuid().ToString("N") + ".sql")
try {
  & (Join-Path $PostgresBin "pg_dump.exe") --dbname=$SourceDatabaseUrl --data-only --schema=public --exclude-table=public.local_user_credentials --exclude-table=public.local_user_sessions --file=$dump
  if ($LASTEXITCODE -ne 0) { throw "The read-only Supabase data export failed." }
  & (Join-Path $PostgresBin "psql.exe") --dbname=$settings.DATABASE_URL -v ON_ERROR_STOP=1 -f (Join-Path $InstallRoot "database\native\prepare-migration.sql")
  if ($LASTEXITCODE -ne 0) { throw "The local migration target is not empty or could not be prepared safely." }
  & (Join-Path $PostgresBin "psql.exe") --dbname=$settings.DATABASE_URL -v ON_ERROR_STOP=1 -f $dump
  if ($LASTEXITCODE -ne 0) { throw "The local data import failed." }
  $cashbookAuditCompatibilitySql = @'
update public.cashbook_days
set audit_status='PENDING_AUDIT'
where is_closed=true
  and (audit_status is null or audit_status='OPEN');

insert into public.permissions(
  module_id,key,name,description,action,is_sensitive,sort_order
)
select module.id,
  'accounting.audit_cashbook',
  'Audit cashbook days',
  'Review finalized Cash Book days and approve or request correction.',
  'audit_cashbook',
  true,
  60
from public.app_modules module
where module.key='accounting'
on conflict(key) do update set
  module_id=excluded.module_id,
  name=excluded.name,
  description=excluded.description,
  action=excluded.action,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  is_active=true;

do $$
begin
  if not exists (
    select 1
    from public.permissions
    where key='accounting.audit_cashbook' and is_active
  ) then
    raise exception 'The accounting audit permission could not be restored.';
  end if;
end $$;
'@
  & (Join-Path $PostgresBin "psql.exe") --dbname=$settings.DATABASE_URL --single-transaction -v ON_ERROR_STOP=1 -c $cashbookAuditCompatibilitySql
  if ($LASTEXITCODE -ne 0) { throw "The native Cashbook Audit compatibility step failed." }
  & (Join-Path $PostgresBin "psql.exe") --dbname=$settings.DATABASE_URL -v ON_ERROR_STOP=1 -c "insert into public.local_user_credentials(profile_id,password_hash,password_reset_required,source_provider) select id,null,true,'supabase-migration' from public.profiles on conflict(profile_id) do nothing;"
  & (Join-Path $InstallRoot "node.exe") (Join-Path $InstallRoot "scripts\migrate-supabase-storage.mjs") $SourceSupabaseUrl $SourceServiceRoleKey $settings.SEN_DATA_ROOT
  $secure = Read-Host "Set the first local administrator password" -AsSecureString
  $plain = [Net.NetworkCredential]::new("", $secure).Password
  $env:DATABASE_URL = $settings.DATABASE_URL
  $env:SEN_NEW_PASSWORD = $plain
  & (Join-Path $InstallRoot "node.exe") (Join-Path $InstallRoot "scripts\native-set-password.mjs") $BootstrapAdminEmail
  Write-Host "Migration completed. Supabase was read only and is no longer required by runtime."
} finally {
  Remove-Item -LiteralPath $dump -Force -ErrorAction SilentlyContinue
  Remove-Item Env:SEN_NEW_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
