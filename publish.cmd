@echo off
rem Push the site to GitHub in one step:  publish.cmd "what changed"
rem Works from any folder and by double-click. Git is called by full path.
cd /d "%~dp0"

set "GIT=C:\Program Files\Git\cmd\git.exe"
if not exist "%GIT%" (
  echo Git not found: %GIT%
  goto :end
)

set "MSG=%~1"
if "%MSG%"=="" set "MSG=Update site"

"%GIT%" add -A
"%GIT%" diff --cached --quiet
if errorlevel 1 (
  "%GIT%" commit -q -m "%MSG%"
  echo Saved changes: %MSG%
) else (
  echo No new changes.
)

"%GIT%" push -q
if errorlevel 1 (
  echo.
  echo ERROR: push to GitHub failed. Check internet and GitHub login.
) else (
  echo.
  echo DONE: https://github.com/kutcollcenter-oss/kutarlen
)

:end
rem Double-click (no message given): keep the window open
if "%~1"=="" pause
