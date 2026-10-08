@echo off
chcp 65001 >nul
setlocal
title 林夕的小站 · 专属后台
cd /d "%~dp0"

echo.
echo   ============================================
echo      林夕的小站 - 专属后台
echo   ============================================
echo.

rem ---- 1. 检查 Node.js ----
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] 没有找到 Node.js
  echo.
  echo   请先安装 Node.js 22 或更高版本： https://nodejs.org/
  echo   安装完关掉这个窗口，重新双击本文件。
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo   [OK] Node.js %NODEV%

rem ---- 2. 检查后台文件在不在 ----
if not exist "admin\server\admin-server.mjs" (
  echo   [X] 找不到 admin\server\admin-server.mjs
  echo       请确认本文件放在项目根目录（和 package.json 同一层）。
  echo.
  pause
  exit /b 1
)
echo   [OK] 后台程序就位

rem ---- 3. 端口是不是被占了 ----
set PORT=4322
netstat -ano | findstr /r /c:"LISTENING.*:%PORT% " >nul 2>nul
if not errorlevel 1 (
  echo   [!] 端口 %PORT% 已经被占用（可能是后台已经在运行了）
  echo       直接帮你打开浏览器。
  echo.
  start "" "http://127.0.0.1:%PORT%"
  timeout /t 3 >nul
  exit /b 0
)

echo   [..] 正在启动，稍等两三秒...
echo.
echo   ============================================
echo      地址： http://127.0.0.1:4322
echo      第一次打开会让你设置一个密码
echo      用完直接关掉这个黑窗口就行
echo   ============================================
echo.

rem ---- 4. 2 秒后自动打开浏览器 ----
start "" cmd /c "timeout /t 2 >nul & start "" http://127.0.0.1:4322"

rem ---- 5. 前台运行服务（关掉窗口就停止） ----
node admin\server\admin-server.mjs

echo.
echo   后台已经停止。按任意键关闭窗口。
pause >nul
