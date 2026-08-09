param(
  [string]$TaskName = "RestaurantQuarterlyPortalUpdate",
  [string]$RunTime = "09:00"
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "run_scheduled_update.ps1"
if (-not (Test-Path $scriptPath)) {
  throw "Scheduled update script not found: $scriptPath"
}

$parsedTime = [DateTime]::ParseExact($RunTime, "HH:mm", $null)
$now = Get-Date
$firstRun = Get-Date -Hour $parsedTime.Hour -Minute $parsedTime.Minute -Second 0

if ($firstRun -le $now) {
  $firstRun = $firstRun.AddDays(1)
}

$startDate = $firstRun.ToString("MM/dd/yyyy")
$startTime = $parsedTime.ToString("HH:mm")
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -DaysInterval 5 -At $parsedTime
$trigger.StartBoundary = $firstRun.ToString("s")
$userId = if ($env:USERDOMAIN) { "$($env:USERDOMAIN)\$($env:USERNAME)" } else { $env:USERNAME }
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null

Write-Output "Task created."
Write-Output "Task name: $TaskName"
Write-Output "First run: $($firstRun.ToString("yyyy-MM-dd HH:mm"))"
Write-Output "Repeat: every 5 days"
