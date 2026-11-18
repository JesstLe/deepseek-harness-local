@echo off
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0APPLY.ps1" -InstallRoot "F:\Naumi"
set "result=%ERRORLEVEL%"
pause
exit /b %result%
