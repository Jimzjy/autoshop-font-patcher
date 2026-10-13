@echo off
chcp 65001 >nul
title AutoShop 字体工具 - 端口清理
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0清理残留服务.ps1"
pause
