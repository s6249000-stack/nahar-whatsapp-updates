# Nahar Shalom WhatsApp Scheduler - public GitHub updater
# Checks the installed manifest itself, not only the cached version stamp.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Join-Path $env:LOCALAPPDATA 'NaharShalom\WhatsAppScheduler'
$target = Join-Path $root 'extension'
$stamp = Join-Path $root 'updater-version.txt'
$base = 'https://raw.githubusercontent.com/s6249000-stack/nahar-whatsapp-updates/main'
$files = @('manifest.json','background.js','bridge.js','whatsapp.js')
function Get-FreshText([string]$path) {
    $url = $base + '/' + $path + '?nocache=' + [guid]::NewGuid().ToString('N')
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -Headers @{'Cache-Control'='no-cache';'Pragma'='no-cache'}
    if ($response.StatusCode -ne 200) { throw "GitHub HTTP $($response.StatusCode): $path" }
    $value = [string]$response.Content
    if ($value.Length -lt 10 -or $value -match '(?i)<!doctype|<html|cloudflare access') { throw "Invalid response: $path" }
    return $value
}
$stage = Join-Path $root ('pending-' + [guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    Write-Host 'Checking public GitHub updates...' -ForegroundColor Cyan
    $latest = Get-FreshText 'latest.json' | ConvertFrom-Json
    if ($latest.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid latest version' }
    $installed = ''
    $currentManifest = Join-Path $target 'manifest.json'
    if (Test-Path $currentManifest) {
        try { $installed = (Get-Content $currentManifest -Raw -Encoding UTF8 | ConvertFrom-Json).version } catch {}
    }
    $needs = $installed -ne $latest.version
    foreach ($file in $files) { if (!(Test-Path (Join-Path $target $file))) { $needs = $true } }
    if (!$needs) {
        Write-Host ("Already up to date: " + $installed) -ForegroundColor Green
    } else {
        New-Item -ItemType Directory -Path $stage -Force | Out-Null
        foreach ($file in $files) {
            $value = Get-FreshText ('extension/' + $file)
            if ($file -eq 'manifest.json') {
                $manifest = $value | ConvertFrom-Json
                if ($manifest.manifest_version -ne 3 -or $manifest.version -ne $latest.version) { throw 'Manifest version differs from latest.json' }
            }
            [IO.File]::WriteAllText((Join-Path $stage $file),$value,(New-Object System.Text.UTF8Encoding($false)))
        }
        if (!(Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
        foreach ($file in $files) { Copy-Item (Join-Path $stage $file) (Join-Path $target $file) -Force }
        [IO.File]::WriteAllText($stamp,[string]$latest.version,[Text.Encoding]::ASCII)
        $verified = (Get-Content $currentManifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
        if ($verified -ne $latest.version) { throw 'Post-install version verification failed' }
        Write-Host ("Updated extension from " + $installed + " to " + $verified) -ForegroundColor Green
        Write-Host 'Now press Reload for this extension at chrome://extensions' -ForegroundColor Yellow
    }
} catch {
    Write-Host ('Update failed: ' + $_.Exception.Message) -ForegroundColor Red
} finally {
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
}
