# Daily sync: ingest, commit data/usage.json if it changed, and push so Vercel redeploys.
# Run by the "Claude Usage Monitor Sync" scheduled task (see register-sync-task.ps1).
# Safety rules:
#   - only ever commits data/usage.json (other local edits are left untouched)
#   - only pushes when every unpushed commit is a snapshot-only commit
#   - only runs on the main branch
# The task also fires whenever a network connects (e.g. after wake), so a run that
# already succeeded today makes later runs that day a no-op. Pass -Force to sync anyway.
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'sync.log'
$stamp = Join-Path $logDir 'last-sync.txt'
function Write-Log([string]$msg) { Add-Content $log "$(Get-Date -Format s) $msg" }
function Set-Synced { Set-Content $stamp (Get-Date -Format yyyy-MM-dd) }

$today = Get-Date -Format yyyy-MM-dd
if (-not $Force -and (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $today)) { exit 0 }

# Runs a git command, retrying with exponential backoff (10s, 20s, 40s, 80s) so a run
# that starts just after wake, before the network is up, still succeeds. Worst case
# ~2.5 min of waiting per command, well inside the task's 10-minute limit.
function Invoke-GitWithRetry([string]$name, [string[]]$gitArgs, [int]$attempts = 5, [int]$baseDelay = 10) {
    for ($i = 1; $i -le $attempts; $i++) {
        $out = git @gitArgs 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) {
            if ($i -gt 1) { Write-Log "$name succeeded on attempt $i" }
            return $true
        }
        if ($i -eq $attempts) {
            Write-Log "$name failed after $attempts attempts: $($out.Trim())"
            return $false
        }
        $delay = $baseDelay * [math]::Pow(2, $i - 1)
        Write-Log "$name attempt $i failed, retrying in ${delay}s: $($out.Trim())"
        Start-Sleep -Seconds $delay
    }
}

Push-Location $repo
try {
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -ne 'main') { Write-Log "skip: on branch '$branch', not main"; exit 0 }

    # Several machines push to this repo, so each cycle first moves onto origin/main and ingests
    # on top of it (ingest merges, so other machines' data is kept). If another machine pushed
    # in between, the push is rejected and the cycle is retried.
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        if (-not (Invoke-GitWithRetry 'fetch' @('fetch', '-q', 'origin', 'main'))) { exit 1 }

        git merge-base --is-ancestor origin/main HEAD; $behindOrDiverged = $LASTEXITCODE -ne 0
        git merge-base --is-ancestor HEAD origin/main; $aheadOrDiverged = $LASTEXITCODE -ne 0
        if ($behindOrDiverged -or $aheadOrDiverged) {
            $unpushed = @(git log origin/main..HEAD --format=%h)
            $other = @(@(git diff --name-only origin/main HEAD) | Where-Object { $_ -and $_ -ne 'data/usage.json' })
            if ($unpushed.Count -gt 0 -and $other.Count -gt 0) {
                Write-Log "skip: unpushed commits also change $($other -join ', '). Push manually."
                exit 0
            }
            # Local snapshot changes are dropped: ingest rebuilds them on top of the latest snapshot.
            git checkout -q -- data/usage.json
            $out = git reset -q --keep origin/main 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) { Write-Log "skip: could not move to origin/main: $($out.Trim())"; exit 1 }
        }

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

        $unpushed = @(git log origin/main..HEAD --format=%h)
        if ($unpushed.Count -eq 0) { Write-Log 'nothing to push'; Set-Synced; exit 0 }

        $out = git push -q origin main 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) { Write-Log "pushed $($unpushed.Count) commit(s)"; Set-Synced; exit 0 }
        git fetch -q origin main 2>&1 | Out-Null
        git merge-base --is-ancestor origin/main HEAD
        if ($LASTEXITCODE -ne 0) { Write-Log "push rejected (another machine pushed first), retrying: $($out.Trim())"; continue }
        if (-not (Invoke-GitWithRetry 'push' @('push', '-q', 'origin', 'main'))) { exit 1 }
        Write-Log "pushed $($unpushed.Count) commit(s)"
        Set-Synced
        exit 0
    }
    Write-Log 'gave up after 3 push races'
    exit 1
} catch {
    Write-Log "error: $($_.Exception.Message)"
    exit 1
} finally {
    Pop-Location
    $lines = Get-Content $log -ErrorAction SilentlyContinue
    if ($lines.Count -gt 500) { $lines | Select-Object -Last 500 | Set-Content $log }
}
