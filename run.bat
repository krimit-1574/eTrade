@echo off
title eTrade Platform Launcher
color 0A

echo ==============================================================
echo                 Starting eTrade Web Application
echo ==============================================================
echo.

echo [1/2] Starting Backend Server (FastAPI)...
:: Open a new command prompt, activate the virtual environment, and run uvicorn
start "eTrade Backend" cmd /k "cd eta_backend && .\venv\Scripts\activate && python -m uvicorn server:app --reload --port 8000"

:: Adding a small timeout to give the backend a head start
timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Server (React/Vite)...
:: Open another command prompt and run the frontend dev script
start "eTrade Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ==============================================================
echo     Servers are starting in their respective windows!
echo ==============================================================
echo.
echo The Frontend will be available at: http://localhost:5173
echo The Backend API is running on: http://localhost:8000
echo.
echo Press any key to exit this launcher (the servers will keep running)...
pause >nul
