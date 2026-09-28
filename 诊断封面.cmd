@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   ============================================
echo     诊断：封面抓取到底拿到了什么
echo   ============================================
echo.
echo   会把抓取过程中请求到的原始页面 / 播放器页
echo   存到系统临时目录，并打印每个文件的路径和大小。
echo   看完可以直接删，不影响项目。
echo.
echo   什么时候用：
echo     - B 站 / YouTube 的封面没抓到
echo     - 想确认抖音是不是真的拿不到（结论：拿不到，
echo       抖音视频页是 JS 渲染 + 详情接口 403 签名墙）
echo.
echo   注意：会联网，大约几秒到几十秒。
echo.
pause

node tools/sync-covers.mjs --force --dump

echo.
echo   ============================================
echo     上面打印的 C:\...\Temp\irinsho-*.html
echo     就是产物。把其中任意一个（或把日志）
echo     发给助手即可。
echo   ============================================
echo.
pause
