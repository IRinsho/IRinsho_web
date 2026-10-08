@echo off
chcp 65001 >nul
title 关闭后台
echo.
echo   正在关闭「林夕的小站 · 专属后台」...
echo.
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:"LISTENING.*:4322 "') do (
  taskkill /f /pid %%a >nul 2>nul
  echo   已停止进程 %%a
)
echo.
echo   后台已关闭。按任意键退出。
pause >nul
