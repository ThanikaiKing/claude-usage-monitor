# Claude Code SessionEnd hook: refresh data/usage.json locally. Never commits or pushes.
# Registered in ~/.claude/settings.json as an async hook, so it doesn't delay session exit.
$ErrorActionPreference = 'Stop'
$null = [Console]::In.ReadToEnd()   # hook payload on stdin; not needed

$repo = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'ingest.log'

Push-Location $repo
try {
    $out = & node (Join-Path $repo 'node_modules/tsx/dist/cli.mjs') 'scripts/ingest.ts' 2>&1 | Out-String
    $status = if ($LASTEXITCODE -eq 0) { 'ok' } else { "failed ($LASTEXITCODE)" }
    Add-Content $log "$(Get-Date -Format s) [hook] $status $($out.Trim())"
} catch {
    Add-Content $log "$(Get-Date -Format s) [hook] error $($_.Exception.Message)"
} finally {
    Pop-Location
}

# Keep the log short.
$lines = Get-Content $log -ErrorAction SilentlyContinue
if ($lines.Count -gt 500) { $lines | Select-Object -Last 500 | Set-Content $log }
exit 0
