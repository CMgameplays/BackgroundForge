@echo off
title BackgroundForge
color 0A
echo.
echo  ============================================
echo   BackgroundForge - Background Removal Tool
echo  ============================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found. Please install Python 3.9+
    pause
    exit /b 1
)

REM Create venv if needed
if not exist "venv\" (
    echo  [Setup] Creating virtual environment...
    python -m venv venv
)

REM Activate
call venv\Scripts\activate.bat

REM Install requirements
echo  [Setup] Installing requirements (this may take a few minutes on first run)...
echo.
pip install -r requirements.txt --disable-pip-version-check

echo.
echo  [Ready] Opening http://localhost:5000
echo  [Info]  Press Ctrl+C to stop the server
echo.

REM Open browser after short delay
start /b cmd /c "timeout /t 2 >nul && start http://localhost:5000"

python app.py
pause
