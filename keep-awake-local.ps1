# WorldVote - lokaler Wachhalter (Backup-Ebene)
# Pingt den Render-Server alle 5 Minuten, damit er nie in den Sleep geraet.
# Laeuft als Windows-Aufgabe "WorldVote-KeepAwake".
# Robust: curl.exe mit harten Timeouts (haengt nicht bei DNS-/Netzproblemen).
$url = 'https://worldvote.onrender.com'
$log = Join-Path $PSScriptRoot 'keep-awake-local.log'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

# curl: max. 45s warten, Verbindung max. 10s, HTTP-Code + Gesamtzeit ausgeben
$result = & curl.exe -sS -o NUL --max-time 45 --connect-timeout 10 -w '%{http_code} %{time_total}' $url 2>&1
$exit = $LASTEXITCODE
$parts = ("$result") -split '\s+', 2
$code = $parts[0]
$secs = if ($parts.Count -gt 1) { $parts[1] } else { '?' }

if ($exit -eq 0 -and $code -eq '200') {
    $line = "$stamp  HTTP 200 ($([math]::Round([double]$secs,2))s)"
} else {
    $msg = ("$result") -replace '[\r\n]+', ' '
    if ($msg.Length -gt 120) { $msg = $msg.Substring(0,120) }
    $line = "$stamp  FEHLER exit=$exit code=$code $msg"
}

try { Add-Content -Path $log -Value $line -Encoding UTF8 } catch {}

# Log klein halten (max. ~500 Zeilen)
try {
    if (Test-Path $log -and (Get-Content $log | Measure-Object -Line).Lines -gt 500) {
        Get-Content $log -Tail 300 | Set-Content $log -Encoding UTF8
    }
} catch {}
