.PHONY: start start-backend start-frontend

# This Makefile is an alternative to the run.bat script.
# On Windows, using run.bat is generally recommended because it naturally opens separate command windows.
# If you prefer 'make', you can run 'make start' to run both concurrently (requires something like concurrently or running in background).

start:
	@echo "Starting eTrade Platform..."
	@echo "Note: On Windows, it's recommended to just double-click 'run.bat'."
	start cmd /k "cd eta_backend && .\venv\Scripts\activate && python -m uvicorn server:app --reload --port 8000"
	start cmd /k "cd frontend && npm run dev"
	@echo "Frontend URL: http://localhost:5173"
	@echo "Backend URL: http://localhost:8000"

start-backend:
	cd eta_backend && .\venv\Scripts\activate && python -m uvicorn server:app --reload --port 8000

start-frontend:
	cd frontend && npm run dev
