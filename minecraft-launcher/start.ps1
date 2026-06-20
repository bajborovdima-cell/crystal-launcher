Write-Host "[Crystal Launcher] Starting friend server..." -ForegroundColor Cyan
$server = Start-Process -FilePath "node" -ArgumentList "server\index.js" -WindowStyle Hidden -PassThru
Write-Host "[Crystal Launcher] Waiting..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Write-Host "[Crystal Launcher] Starting launcher..." -ForegroundColor Cyan
npx.cmd electron .
