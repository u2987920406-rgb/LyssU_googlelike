# Ulysse — done

## 2026-08-07
- Fusion profil kuchu dans Hermes Home (Étape 1)
- Connexion Obsidian : junction vault Documents -> Hermes Home (Étape 3)
- Ossature dossiers coffre créée (Étape 2)

## 2026-08-07 (JALON 2) — Session A « Discussion »
- Page Discussion (web/discussion.html) : Material 3, fetch direct proxy :8645,
  historique multi-tour, gestion 403/erreurs connexion.
- Serveur statique (web/serve.py, port 8080) : livre la page HTTP 200, body
  identique au source (vérifié).
- Lanceur (web/lancer_discussion.bat) : 1 clic ouvre serveur + page.
- Infra prouvée : proxy joint, CORS *, route /v1/chat/completions OK,
  logique 403 correcte (proxy renvoie bien le 403 upstream).
- Bout-en-bout TEXTE en attente : tous models gratuits 403 (upstream saturé),
  payants 404 crédits insuffisants. Bloquant EXTERNE (pas notre code).
