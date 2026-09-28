@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   ============================================
echo     IRinsho 个人网站 - 本地预览
echo   ============================================
echo.

rem ---- 第一次运行需要装依赖 ----
if not exist "node_modules" (
  echo   第一次运行，正在安装依赖（需要联网，大约 1-3 分钟）...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [失败] 依赖安装失败。请确认：
    echo     1. 已安装 Node.js（命令行输入 node -v 能看到版本号）
    echo     2. 电脑能正常上网
    echo     3. 公司网络若有代理，先执行： npm config set proxy http://你的代理地址
    echo.
    pause
    exit /b 1
  )
  echo.
  echo   依赖安装完成。
  echo.
)

echo   正在构建内容并启动开发服务器...
echo.
echo     img  文件夹  -^>  图片压缩同步
echo     blog 文件夹  -^>  笔记构建
echo.
echo   浏览器地址： http://localhost:4321
echo   关闭这个黑窗口即可停止服务。
echo.

start "" http://localhost:4321
call npm run dev

pause
