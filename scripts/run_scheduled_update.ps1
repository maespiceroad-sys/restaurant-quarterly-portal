$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot "logs\task-history"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $logDir "update_$timestamp.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Push-Location $projectRoot
try {
  "[$(Get-Date -Format s)] Scheduled update started." | Tee-Object -FilePath $logFile -Append | Out-Null
  & npm.cmd run update *>&1 | Tee-Object -FilePath $logFile -Append

  if ($LASTEXITCODE -ne 0) {
    throw "npm.cmd run update failed with exit code $LASTEXITCODE"
  }

  "[$(Get-Date -Format s)] Scheduled update finished successfully." | Tee-Object -FilePath $logFile -Append | Out-Null
}
finally {
  Pop-Location
}
