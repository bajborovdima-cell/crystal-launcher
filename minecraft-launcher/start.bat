@echo off
cd /d "%~dp0"

set "LOG_FILE=launcher.log"
echo Starting... > "%LOG_FILE%"

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.22.0/node-v22.22.0-win-x64.zip' -OutFile '%TEMP%\node.zip' -UseBasicParsing"
    powershell -Command "Expand-Archive -Path '%TEMP%\node.zip' -DestinationPath '%TEMP%\node-portable' -Force"
    set "PATH=%TEMP%\node-portable\node-v22.22.0-win-x64;%PATH%"
)

if not exist "node_modules" (
    call npm install
    if %ERRORLEVEL% neq 0 (
        pause
        exit /b 1
    )
)

"node_modules\.bin\electron.cmd" . >> "%LOG_FILE%" 2>&1
echo.
echo Done. Check %LOG_FILE% for output.
pause
