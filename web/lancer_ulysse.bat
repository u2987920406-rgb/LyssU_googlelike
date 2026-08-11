@echo off
REM ============================================================================
REM  lancer_ulysse.bat — demarre l'enveloppe web Ulysse en un clic.
REM
REM  1. Genere un jeton de session ephemere.
REM  2. Le pose dans HERMES_DASHBOARD_SESSION_TOKEN, puis lance le dashboard
REM     ET serve.py DEPUIS CETTE VARIABLE : les deux processus en heritent, le
REM     jeton n'est ecrit dans aucun fichier. (L'ancienne version l'injectait
REM     dans ulysse-config.js, donc sur le disque, dans un dossier servi par
REM     le serveur web.)
REM  3. Lance le gateway si besoin — c'est lui qui recoit les webhooks.
REM  4. Lance serve.py (port 8080, ecoute 127.0.0.1 uniquement).
REM  5. Ouvre http://127.0.0.1:8080/ dans le navigateur.
REM
REM  Ne touche pas aux binaires Hermes : on enveloppe uniquement.
REM ============================================================================

SETLOCAL ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

REM --- Chemins --------------------------------------------------------------
SET DASH_PORT=9123
SET ULYSSE_PORT=8080
SET HERMES=hermes

REM --- 1. Jeton de session ephemere ----------------------------------------
FOR /F "usebackq tokens=*" %%G IN (`powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')"`) DO SET TOKEN=ulysse_%%G
IF "%TOKEN%"=="" SET TOKEN=ulysse_fallback_%RANDOM%%RANDOM%

REM --- 2. La variable AVANT les deux lancements : ils en heritent -----------
SET HERMES_DASHBOARD_SESSION_TOKEN=%TOKEN%

echo Demarrage du dashboard Hermes sur le port %DASH_PORT%...
start "Ulysse-Dashboard" /MIN cmd /c "%HERMES% dashboard --port %DASH_PORT% --no-open"

REM --- 3. Gateway (webhooks, canaux distants) -------------------------------
REM  Sans lui, l'onglet Webhooks liste les routes mais le declenchement echoue.
echo Demarrage du gateway Hermes...
start "Ulysse-Gateway" /MIN cmd /c "%HERMES% gateway run"

REM --- 3b. Proxy Hermes (port 8645) -----------------------------------------
REM  C'est LUI que le mode Discussion appelle. Sans lui, Ulysse repond
REM  « Le proxy Hermes ne repond pas » une fois sur deux — le bug signale par
REM  kuchu. Les anciennes versions du BAT ne le lançaient pas : on le demarre
REM  ici, en arriere-plan, comme les autres backends.
echo Demarrage du proxy Hermes (port 8645)...
start "Ulysse-Proxy" /MIN cmd /c "%HERMES% proxy start --provider nous --port 8645"

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
pause
ENDLOCAL
