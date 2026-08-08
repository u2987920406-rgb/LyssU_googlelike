/* ============================================================================
 * ulysse-config.js — configuration locale d'Ulysse
 * ----------------------------------------------------------------------------
 * Ce fichier est lu DEUX fois, et pas pour les memes cles :
 *
 *   · serve.py, au demarrage : HERMES_URL, WEBHOOK_URL, PROXY_URL,
 *     SESSION_TOKEN, PROXY_TOKEN. C'est lui qui detient les secrets.
 *   · la page, au chargement : tout le reste. Elle ne recoit JAMAIS les
 *     secrets — serve.py les retire du fichier avant de le servir.
 *
 * Ou trouver le jeton de session
 * ------------------------------
 * Le dashboard protege /api/* par un jeton ephemere genere au lancement. Le
 * plus simple est de le FIXER soi-meme avant de lancer le dashboard, pour que
 * serve.py et le dashboard parlent du meme :
 *
 *   PowerShell :
 *     $env:HERMES_DASHBOARD_SESSION_TOKEN = "ulysse_" + [guid]::NewGuid().ToString("N")
 *     hermes dashboard --port 9123 --no-open
 *     # puis, dans la MEME fenetre : python serve.py
 *
 * Lance de cette facon, serve.py lit la variable d'environnement et il n'y a
 * RIEN a recopier ici — c'est le mode recommande : le jeton ne touche aucun
 * fichier. lancer_ulysse.bat fait exactement cela.
 *
 * Ordre de resolution du jeton dans serve.py :
 *   constante SESSION_TOKEN en tete de serve.py
 *   > variable d'environnement HERMES_DASHBOARD_SESSION_TOKEN
 *   > cle SESSION_TOKEN ci-dessous
 * ========================================================================== */

window.ULYSSE_CONFIG = {

  /* --- Lu par serve.py uniquement ---------------------------------------- */

  // Origine reelle du dashboard Hermes. Pas de slash final.
  HERMES_URL: "http://127.0.0.1:9123",

  // Gateway des webhooks. serve.py y relaie POST /webhooks/<nom> en posant
  // lui-meme la signature HMAC (le secret est lu dans le Hermes Home).
  WEBHOOK_URL: "http://127.0.0.1:8644",

  // Proxy Hermes pour le mode « chat pur ». serve.py relaie /proxy/chat
  // vers <PROXY_URL>/v1/chat/completions.
  PROXY_URL: "http://127.0.0.1:8645",

  // Laisser vide si tu passes par HERMES_DASHBOARD_SESSION_TOKEN (recommande).
  // Si tu remplis ces champs, ils ne descendent pas dans le navigateur :
  // serve.py les expurge avant de servir ce fichier.
  SESSION_TOKEN: "",
  PROXY_TOKEN: "ulysse",

  /* --- Lu par la page ----------------------------------------------------- */

  // Origine appelee par la PAGE. Vide = l'origine de la page elle-meme, ce qui
  // est toujours correct puisque c'est serve.py qui la sert et qui relaie.
  // Ne la renseigner que pour un montage inhabituel.
  DASHBOARD_URL: "",

  // Modele du mode « chat pur ».
  PROXY_MODEL: "tencent/hy3:free",
  PROXY_MAX_TOKENS: 800,

  // Dossier de travail passe a session.create (vide = dossier de lancement
  // du dashboard). Exemple : "%USERPROFILE%/Desktop/Projet Ulysse"
  SESSION_CWD: "",

  // Modele impose a la session Cowork (vide = modele par defaut du profil).
  SESSION_MODEL: "",

  // Dossier ouvert par defaut dans l'onglet Fichiers (vide = racine servie
  // par Hermes, c'est-a-dire le home utilisateur).
  START_PATH: "",

  // Nombre d'evenements conserves dans le journal du Studio.
  STUDIO_LOG_MAX: 300
};
