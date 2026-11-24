param(
    [Parameter(Mandatory = $true)][string]$AdbPath,
    [Parameter(Mandatory = $true)][string]$Serial,
    [Parameter(Mandatory = $true)][string]$ApkPath,
    [Parameter(Mandatory = $true)][string]$EvidenceDirectory
)

$ErrorActionPreference = 'Stop'
$package = 'bd.com.sen.erp.mobile'
if ((& $AdbPath -s $Serial shell getprop ro.kernel.qemu | Out-String).Trim() -ne '1') {
    throw 'Use an isolated emulator: this test installs an APK and clears its test crash log.'
}
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$installed = & $AdbPath -s $Serial install -r $ApkPath 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $installed -notmatch 'Success') { throw "APK installation failed: $installed" }
& $AdbPath -s $Serial shell am force-stop $package
& $AdbPath -s $Serial logcat -b crash -c
# Do not use am start -W: a crashing translucent launcher can wait indefinitely.
$launch = & $AdbPath -s $Serial shell am start -n "$package/.SenLauncherActivity" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER 2>&1 | Out-String
$launch | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'launch.txt')
if ($LASTEXITCODE -ne 0 -or $launch -match 'Error:|Exception') { throw "Activity launch failed: $launch" }
Start-Sleep -Seconds 8
$crash = & $AdbPath -s $Serial logcat -d -b crash -v threadtime | Out-String
$crash | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'crash.txt')
& $AdbPath -s $Serial shell dumpsys activity activities | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'activities.txt')
& $AdbPath -s $Serial shell dumpsys package $package | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'package.txt')
if ($crash -match [regex]::Escape($package)) { throw 'SEN crashed on startup; see crash.txt.' }
'PASS: installed APK starts without a SEN process crash. Inspect the browser screen separately.'
