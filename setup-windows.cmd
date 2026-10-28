@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
set "setup_exit=%errorlevel%"
if not "%setup_exit%"=="0" pause
exit /b %setup_exit%
