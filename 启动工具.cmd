@echo off
chcp 65001 >nul
title AutoShop 字体切换工具
cd /d "%~dp0"

rem 需要用户自行安装 Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   找不到 Node.js。请先安装 Node.js 18 或更高版本：
  echo     https://nodejs.org/
  echo   安装后重新运行本脚本。
  echo.
  pause
  exit /b 1
)

echo.
echo   AutoShop 字体切换工具
echo   界面会自动在浏览器打开；关闭本窗口即停止工具。
echo.

node "%~dp0bin\autoshop-font-ui.mjs" --open

echo.
echo   工具已停止。
pause
