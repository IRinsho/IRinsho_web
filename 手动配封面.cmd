@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   ============================================
echo     手动给视频配一张封面（10 秒）
echo   ============================================
echo.
echo   封面图地址怎么拿：
echo     1. 浏览器打开那个抖音视频页
echo     2. 按 F12 打开开发者工具，切到 Network（网络）
echo     3. 刷新页面，在列表里找一张 douyinpic.com 的图片
echo     4. 右键它 -^> Copy -^> Copy image address
echo.
echo   也可以直接输入本机图片的路径，例如：
echo     C:\Users\123\Pictures\封面.jpg
echo.
echo   提示：想跳过问话、一次搞定，可以这样用（引号别丢）：
echo     手动配封面.cmd "封面地址" "奇蛋物语"
echo.
pause

node tools/set-cover.mjs %*

echo.
pause
