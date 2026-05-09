@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-sync-report.ps1" %*
exit /b %ERRORLEVEL%
