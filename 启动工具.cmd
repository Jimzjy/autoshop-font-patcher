@echo off
chcp 65001 >nul
title AutoShop 字体切换工具
cd /d "%~dp0"

rem 优先用 PATH 里的 node；找不到就用 DeepSeek Harness 自带的
set "NODEEXE="
where node >nul 2>nul
if not errorlevel 1 set "NODEEXE=node"
if not defined NODEEXE (
  set "CANDIDATE=%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\runtime\bin\node.exe"
  if exist "%CANDIDATE%" set "NODEEXE=%CANDIDATE%"
)

if not defined NODEEXE (
  echo.
  echo   找不到 Node.js 运行环境。
  echo   请安装 Node.js 18+，或确保 DeepSeek Harness 安装完整。
  echo.
  pause
  exit /b 1
)

echo.
echo   AutoShop 字体切换工具
echo   界面会自动在浏览器打开；关闭本窗口即停止工具。
echo.

"%NODEEXE%" "%~dp0bin\autoshop-font-ui.mjs" --open

echo.
echo   工具已停止。
pause
