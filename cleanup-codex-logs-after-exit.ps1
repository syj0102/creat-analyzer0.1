$codexHome = Join-Path $env:USERPROFILE ".codex"
$targets = @(
  "logs_2.sqlite",
  "logs_2.sqlite-wal",
  "logs_2.sqlite-shm"
)

foreach ($name in $targets) {
  $path = Join-Path $codexHome $name
  if (Test-Path -LiteralPath $path) {
    try {
      Remove-Item -LiteralPath $path -Force -ErrorAction Stop
      Write-Host "Removed $path"
    } catch {
      Write-Host "Could not remove ${path}: $($_.Exception.Message)"
    }
  }
}

Write-Host "Done. If a file was locked, close Codex completely and run this script again."
