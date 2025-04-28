# PowerShell script to run both the scheduler and web server in separate windows
# Activate virtual environment and run scheduler
Start-Process powershell -ArgumentList "-NoExit", "-Command", ".\.venv\Scripts\Activate.ps1; python -m topchef_agent.scheduler"

# Activate virtual environment and run waitress (for Flask/WSGI on Windows)
Start-Process powershell -ArgumentList "-NoExit", "-Command", ".\.venv\Scripts\Activate.ps1; waitress-serve --host 0.0.0.0 --port 5000 topchef_agent.main:app"
