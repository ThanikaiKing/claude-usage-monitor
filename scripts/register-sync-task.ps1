# Registers (or updates) the daily sync as a Windows scheduled task for the current user.
#   pwsh -File scripts/register-sync-task.ps1            # daily at 10:00
#   pwsh -File scripts/register-sync-task.ps1 -At 21:00  # another time
#   Unregister-ScheduledTask -TaskName 'Claude Usage Monitor Sync'   # remove
# If the laptop is off or asleep at that time, StartWhenAvailable runs it once
# as soon as it is back on, and RunOnlyIfNetworkAvailable waits for a connection.
param([string]$At = '10:00')
$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'daily-sync.ps1'
$pwsh = (Get-Command pwsh).Source

$action = New-ScheduledTaskAction -Execute $pwsh `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName 'Claude Usage Monitor Sync' -Description 'Ingest Claude Code usage and push data/usage.json so Vercel redeploys.' `
    -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Get-ScheduledTask -TaskName 'Claude Usage Monitor Sync' | Select-Object TaskName, State
