@echo off
setlocal
if not exist "%~dp0.venv\Scripts\pythonw.exe" (
  echo Once tools\setup-ai.ps1 ile yerel kurulumu tamamlayin.
  pause
  exit /b 1
)
"%~dp0.venv\Scripts\pythonw.exe" "%~dp0tools\ai_prepare_gui.py"
