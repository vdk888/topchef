# PowerShell script to run both the scheduler and web server in separate windows
# Activate virtual environment and run scheduler
Start-Process powershell -ArgumentList "-NoExit", "-Command", ".\.venv\Scripts\Activate.ps1; python -m topchef_agent.scheduler"

# Activate virtual environment and run uvicorn (instead of gunicorn, for Windows compatibility)
Start-Process powershell -ArgumentList "-NoExit", "-Command", ".\.venv\Scripts\Activate.ps1; uvicorn topchef_agent.main:app --host 0.0.0.0 --port 5000 --timeout-keep-alive 120"
