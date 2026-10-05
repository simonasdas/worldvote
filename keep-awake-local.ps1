# WorldVote – lokaler Wachhalter (Backup-Ebene)
# Pingt den Render-Server, damit er nie in den Sleep gerät.
# Läuft als Windows-Aufgabe "WorldVote-KeepAwake" alle 10 Minuten.
$url = 'https://worldvote.onrender.com'
$log = Join-Path $PSScriptRoot 'keep-awake-local.log'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

try {
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60
  $line = "$stamp  HTTP $($r.StatusCode)"
} catch {
  $line = "$stamp  FEHLER $($_.Exception.Message)"
}

Add-Content -Path $log -Value $line -Encoding UTF8

# Log klein halten (max. ~500 Zeilen)
try {
  if ((Get-Content $log | Measure-Object -Line).Lines -gt 500) {
    Get-Content $log -Tail 300 | Set-Content $log -Encoding UTF8
  }
} catch {}
