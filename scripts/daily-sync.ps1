# Daily sync: ingest, commit data/usage.json if it changed, and push so Vercel redeploys.
# Run by the "Claude Usage Monitor Sync" scheduled task (see register-sync-task.ps1).
# Safety rules:
#   - only ever commits data/usage.json (other local edits are left untouched)
#   - only pushes when every unpushed commit is a snapshot-only commit
#   - only runs on the main branch
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'sync.log'
function Write-Log([string]$msg) { Add-Content $log "$(Get-Date -Format s) $msg" }

Push-Location $repo
try {
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -ne 'main') { Write-Log "skip: on branch '$branch', not main"; exit 0 }

    $out = & node (Join-Path $repo 'node_modules/tsx/dist/cli.mjs') 'scripts/ingest.ts' 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { Write-Log "ingest failed: $($out.Trim())"; exit 1 }
    Write-Log "ingest: $($out.Trim())"

    git diff --quiet -- data/usage.json
    if ($LASTEXITCODE -ne 0) {
        git commit -q -m "Refresh usage snapshot $(Get-Date -Format yyyy-MM-dd)" -- data/usage.json
        if ($LASTEXITCODE -ne 0) { Write-Log 'commit failed'; exit 1 }
        Write-Log "committed $((git rev-parse --short HEAD).Trim())"
    } else {
        Write-Log 'no data changes'
    }

    git fetch -q origin main 2>&1 | Out-Null
    $unpushed = @(git log origin/main..HEAD --format=%h)
    if ($unpushed.Count -eq 0) { Write-Log 'nothing to push'; exit 0 }

    $files = @(git diff --name-only origin/main HEAD) | Where-Object { $_ }
    $other = @($files | Where-Object { $_ -ne 'data/usage.json' })
    if ($other.Count -gt 0) {
        Write-Log "skip push: unpushed commits also change $($other -join ', '). Push manually."
        exit 0
    }

    $pushOut = git push -q origin main 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { Write-Log "push failed: $($pushOut.Trim())"; exit 1 }
    Write-Log "pushed $($unpushed.Count) commit(s)"
} catch {
    Write-Log "error: $($_.Exception.Message)"
    exit 1
} finally {
    Pop-Location
    $lines = Get-Content $log -ErrorAction SilentlyContinue
    if ($lines.Count -gt 500) { $lines | Select-Object -Last 500 | Set-Content $log }
}
