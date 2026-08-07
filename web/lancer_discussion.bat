@echo off
REM Lance le serveur statique Ulysse (Discussion) et ouvre la page.
cd /d "%~dp0"
start "" python serve.py
timeout /t 1 >nul
start "" http://127.0.0.1:8080/discussion.html
