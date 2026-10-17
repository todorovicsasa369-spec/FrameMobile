@echo off
setlocal
title FrameMobile
cd /d "%~dp0"

set PORT=8080

where python >nul 2>nul
if errorlevel 1 (
  echo [FEHLER] Python wurde nicht gefunden. Bitte Python installieren: https://www.python.org/downloads/
  pause
  exit /b 1
)

rem LAN-IP ermitteln, damit das Handy die App im gleichen WLAN oeffnen kann
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1).IPAddress"`) do set LANIP=%%i

echo.
echo  ==========================================
echo   FrameMobile laeuft
echo  ==========================================
echo   Am PC:    http://localhost:%PORT%
if defined LANIP echo   Am Handy: http://%LANIP%:%PORT%   (gleiches WLAN)
echo.
echo   Handy: Seite oeffnen, dann im Browser-Menue
echo   "Zum Startbildschirm hinzufuegen" waehlen.
echo.
echo   Beenden: dieses Fenster schliessen oder Strg+C
echo  ==========================================
echo.

start "" http://localhost:%PORT%
python -m http.server %PORT% --bind 0.0.0.0
