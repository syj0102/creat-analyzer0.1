@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0douyin-crawler-gui.ps1"
if errorlevel 1 (
  echo.
  echo 程序启动失败，请把上面的错误截图发给我。
  pause
)
