@echo off
rem Phai Lang (based on Apsi by ATEC) on Windows 10/11 without installing:  phai.bat run examples\01_hello.apsi
rem Uses this folder's .venv when it exists, otherwise the first Python whose NumPy loads (same order as apsi.bat).
setlocal EnableDelayedExpansion
chcp 65001 >nul
set "APSI_DIR=%~dp0"
set "PYTHONPATH=%APSI_DIR%;%PYTHONPATH%"
set "PYTHONUTF8=1"
set "APSI_PROG=phai"
set "PY="
if exist "%APSI_DIR%.venv\Scripts\python.exe" set "PY="%APSI_DIR%.venv\Scripts\python.exe""
for %%P in ("python" "py -3.14" "py -3.13" "py -3.12" "py -3") do (
    if not defined PY (
        %%~P -c "import numpy" >nul 2>nul && set "PY=%%~P"
    )
)
if not defined PY (
    echo phai: no Python with a working NumPy was found. Install Python 3.12-3.14 from python.org ^(not the free-threaded build^), then: py -m pip install numpy 1>&2
    endlocal & exit /b 1
)
!PY! -m apsi %*
endlocal & exit /b %ERRORLEVEL%
