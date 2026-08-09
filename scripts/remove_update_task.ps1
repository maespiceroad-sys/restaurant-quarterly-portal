param(
  [string]$TaskName = "RestaurantQuarterlyPortalUpdate"
)

$ErrorActionPreference = "Stop"
schtasks.exe /Delete /F /TN $TaskName | Out-Null
Write-Output "Task removed: $TaskName"
