/* ============================================================================
 * ulysse-config.js — configuration locale de la page Ulysse Session B
 * ----------------------------------------------------------------------------
 * EXEMPLE. Ce fichier est lu par session-b.html au chargement. Il n'est PAS
 * destine a etre publie : il contient le jeton de session ephemere du
 * dashboard Hermes.
 *
 * Comment obtenir DASHBOARD_URL et SESSION_TOKEN
 * ----------------------------------------------
 * Le backend se lance avec :
 *
 *     hermes dashboard --port 9122 --no-open
 *
 * En mode loopback (bind 127.0.0.1) le serveur protege /api/* par un jeton
 * ephemere genere au lancement et expose dans la variable d'environnement
 * HERMES_DASHBOARD_SESSION_TOKEN du processus. Le plus simple est donc de
 * FIXER ce jeton soi-meme avant de lancer le dashboard :
 *
 *   PowerShell :
 *     $env:HERMES_DASHBOARD_SESSION_TOKEN = "ulysse_" + [guid]::NewGuid().ToString("N")
 *     $env:HERMES_DASHBOARD_SESSION_TOKEN            # <- a recopier ci-dessous
 *     hermes dashboard --port 9122 --no-open
 *
 *   bash :
 *     export HERMES_DASHBOARD_SESSION_TOKEN="ulysse_$(uuidgen | tr -d - )"
 *     echo "$HERMES_DASHBOARD_SESSION_TOKEN"
 *     hermes dashboard --port 9122 --no-open
 *
 * Puis recopier la valeur dans SESSION_TOKEN ci-dessous, RELANCER serve.py
 * (il lit ce fichier au demarrage pour alimenter son proxy) et recharger la
 * page.
 * Sans jeton valide, chaque appel /api/* repond 401 et le WebSocket /api/ws
 * se ferme avec le code 4401 (la page l'affiche explicitement).
 *
 * Si le dashboard tourne sans authentification (champ auth_required=false sur
 * /api/health ET aucun jeton configure), laisser SESSION_TOKEN vide fonctionne.
 * ========================================================================== */

window.ULYSSE_CONFIG = {

  /* --- Backend Hermes (dashboard) ---------------------------------------- */

  // Origine appelee par la PAGE pour /api/*. C'est serve.py (meme origine que
  // la page), qui relaie vers HERMES_URL. Passer par la meme origine evite le
  // preflight OPTIONS que le gate d'auth du dashboard rejetait en 401.
  // Pas de slash final.
  DASHBOARD_URL: "http://127.0.0.1:8080",

  // Origine reelle du dashboard Hermes, lue par serve.py au demarrage (la
  // page ne s'en sert pas). Pas de slash final.
  HERMES_URL: "http://127.0.0.1:9123",

  // Jeton de session ephemere (HERMES_DASHBOARD_SESSION_TOKEN).
  // Lu par serve.py, qui l'injecte en en-tete X-Hermes-Session-Token sur les
  // requetes relayees et en ?token= sur le WebSocket /api/ws (le handshake WS
  // ne peut pas porter d'en-tete).
  SESSION_TOKEN: "ulysse_TEST_999",

  // Style d'en-tete d'authentification pour les appels /api/* :
  //   "x-token" -> X-Hermes-Session-Token: <token>   (defaut, mode loopback)
  //   "bearer"  -> Authorization: Bearer <token>
  //   "both"    -> les deux
  AUTH_HEADER_STYLE: "x-token",

  /* --- Onglet Discussion, mode "chat pur" (sans outils) ------------------- */
  // Reprend le cablage de la Session A (discussion.html) : le proxy Hermes.
  // Sert uniquement quand on bascule Discussion sur "Chat pur".

  PROXY_URL: "http://127.0.0.1:8645/v1/chat/completions",
  PROXY_TOKEN: "ulysse",
  PROXY_MODEL: "tencent/hy3:free",
  PROXY_MAX_TOKENS: 800,

  /* --- Options d'affichage / de session ----------------------------------- */

  // Dossier de travail passe a session.create (vide = dossier de lancement
  // du dashboard). Exemple : "C:/Users/kuchu/Desktop/Projet Ulysse"
  SESSION_CWD: "",

  // Modele impose a la session Cowork (vide = modele par defaut du profil).
  SESSION_MODEL: "",

  // Dossier ouvert par defaut dans l'onglet Fichiers (vide = racine servie
  // par Hermes, c'est-a-dire le home utilisateur).
  START_PATH: "",

  // Nombre d'evenements conserves dans le journal du Studio.
  STUDIO_LOG_MAX: 300
};
