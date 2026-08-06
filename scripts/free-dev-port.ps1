# Frees the Vite dev port before `dev` starts, so a stale dev server left over
# from a previous `tauri dev` that didn't shut down cleanly doesn't block the
# new run with "Port 3000 is already in use". Invoked as the `predev` script.
# Always exits 0 — a missing/empty port is the normal case, not an error.

param(
  [int]$Port = 3000
)

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
  exit 0
}

foreach ($procId in ($conns.OwningProcess | Sort-Object -Unique)) {
  try {
    $proc = Get-Process -Id $procId -ErrorAction Stop
    Write-Host "Freeing port ${Port}: stopping $($proc.ProcessName) (PID $procId)"
    Stop-Process -Id $procId -Force -ErrorAction Stop
  } catch {
    Write-Host "Could not stop PID ${procId}: $($_.Exception.Message)"
  }
}

exit 0
