@echo off
REM ============================================================================
REM  lancer_ulysse.bat — demarre l'enveloppe web Ulysse en un clic.
REM
REM  Nouveau (2026-08-30) : verification des ports AVANT tout lancement.
REM  verif_ports.py sonde 8644/8645/9123/8080 et resout les conflits :
REM    - port libre            -> on le prend
REM    - backend Hermes actif  -> on le REUTILISE (on ne relance pas par-dessus)
REM    - port occupe inconnu   -> CONFLIT : le script bloque, on arrete ici
REM  Les ports resolus sont ecrits dans ulysse_ports.bat ; les flags de
REM  reuse dans ulysse_flags.bat. Ce .bat les lit et agit en consequence.
REM ============================================================================

SETLOCAL ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

REM --- 0. Verification des ports (garde-fou) --------------------------------
echo Verification des ports Hermes / Ulysse...
python verif_ports.py
if errorlevel 1 (
    echo.
    echo *** ARRET : conflit de port bloquant. Liberez le port puis relancez. ***
    pause
    goto :eof
)

REM --- Lire les ports resolus et les flags de reuse -------------------------
call ulysse_ports.bat
call ulysse_flags.bat

REM --- Chemins --------------------------------------------------------------
SET HERMES=hermes

REM --- 1. Jeton de session ephemere ----------------------------------------
FOR /F "usebackq tokens=*" %%G IN (`powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')"`) DO SET TOKEN=ulysse_%%G
IF "%TOKEN%"=="" SET TOKEN=ulysse_fallback_%RANDOM%%RANDOM%

REM --- 2. La variable AVANT les lancements : ils en heritent ----------------
SET HERMES_DASHBOARD_SESSION_TOKEN=%TOKEN%

echo Demarrage du dashboard Hermes sur le port %DASH_PORT%...
start "Ulysse-Dashboard" /MIN cmd /c "%HERMES% dashboard --port %DASH_PORT% --no-open"

REM --- 3. Gateway (webhooks) : ne le lance QUE s'il n'est pas deja actif ----
if "%GW_DEJA_UP%"=="1" (
    echo Gateway deja actif (8644) : on le reutilise, pas de relance.
) else (
    echo Demarrage du gateway Hermes...
    start "Ulysse-Gateway" /MIN cmd /c "%HERMES% gateway run"
)

REM --- 3b. Proxy Hermes (port 8645) : idem, reuse si deja actif ------------
if "%PX_DEJA_UP%"=="1" (
    echo Proxy deja actif (8645) : on le reutilise, pas de relance.
) else (
    echo Demarrage du proxy Hermes (port 8645)...
    start "Ulysse-Proxy" /MIN cmd /c "%HERMES% proxy start --provider nous --port 8645"
)

REM Laisser les backends ouvrir leurs ports.
timeout /t 5 >nul

REM --- 4. Serveur Ulysse (statique + proxy authentifie) --------------------
echo Demarrage du serveur Ulysse sur le port %ULYSSE_PORT%...
start "Ulysse-Serve" /MIN cmd /c "python serve.py"

timeout /t 2 >nul

REM --- 5. Ouverture du navigateur ------------------------------------------
start http://127.0.0.1:%ULYSSE_PORT%/

echo.
echo Ulysse est lance sur http://127.0.0.1:%ULYSSE_PORT%/
echo Le jeton de session vit uniquement en memoire des processus lances ici.
echo.
echo Pour arreter : fermez les fenetres "Ulysse-Dashboard", "Ulysse-Gateway",
echo "Ulysse-Proxy" et "Ulysse-Serve". Ce terminal peut etre ferme.
echo.

REM --- Nettoyage des fragments (ne servent qu'au lancement) ----------------
if exist ulysse_ports.bat del /q ulysse_ports.bat
if exist ulysse_flags.bat del /q ulysse_flags.bat

pause
ENDLOCAL
