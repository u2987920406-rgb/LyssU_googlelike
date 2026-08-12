@echo off
REM ============================================================================
REM  lancer_bancs.bat — la serie des quatre bancs, d'un double-clic.
REM ----------------------------------------------------------------------------
REM  Tout est dans lancer_bancs.py : ce fichier ne fait que l'appeler depuis son
REM  propre dossier et garder la fenetre ouverte pour qu'on puisse LIRE.
REM
REM    lancer_bancs.bat              tout
REM    lancer_bancs.bat --rapide     sans banc_reel.js (le seul qui coute des
REM                                  tours de modele)
REM
REM  Les bancs contre le vrai Hermes ont besoin que lancer_ulysse.bat tourne.
REM  Sans lui ils sont IGNORES, pas rouges : une pile eteinte n'est pas un
REM  defaut du produit.
REM ============================================================================
cd /d "%~dp0"
python lancer_bancs.py %*
echo.
echo Code de sortie : %ERRORLEVEL%
pause
