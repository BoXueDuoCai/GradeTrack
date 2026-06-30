@echo off
chcp 65001 >nul
title 高中成绩分析系统

REM ============================================================
REM   高中成绩分析系统 - 启动脚本
REM   双击运行即可，首次运行会自动安装依赖并初始化数据库
REM ============================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   高中成绩分析系统 - 启动中...
echo ============================================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 18+ 
  echo 下载地址: https://nodejs.org/
  pause
  exit /b 1
)

REM 检查 Bun（推荐）或 npm
where bun >nul 2>nul
if errorlevel 1 (
  echo [提示] 未检测到 Bun，将使用 npm（速度较慢）
  echo 推荐安装 Bun: https://bun.sh/
  echo.
  set PKG_MANAGER=npm
) else (
  set PKG_MANAGER=bun
)

echo 使用包管理器: %PKG_MANAGER%
echo.

REM 安装依赖
if not exist "node_modules" (
  echo [1/4] 安装依赖中（首次较慢，请耐心等待）...
  %PKG_MANAGER% install
  if errorlevel 1 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
  )
) else (
  echo [1/4] 依赖已安装，跳过
)

REM 初始化数据库
echo [2/4] 初始化数据库...
if not exist "db\custom.db" (
  %PKG_MANAGER% run db:push
)
%PKG_MANAGER% run scripts:init-admin

REM 启动开发服务器
echo [3/4] 启动开发服务器...
echo.
echo ============================================================
echo   系统已启动！请在浏览器访问：
echo.
echo                    http://localhost:3000
echo.
echo   超级管理员: system / 123456(初始密码，需要修改)
echo.
echo   关闭此窗口将停止服务
echo ============================================================
echo.
echo [4/4] 服务运行中...按 Ctrl+C 停止
echo.

%PKG_MANAGER% run dev

pause
