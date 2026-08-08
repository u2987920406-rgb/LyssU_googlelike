# Cadrage Session B — Ulysse enveloppe le backend Hermès complet

## Précision technique (vérifiée dans le code source réel, 2026-08-07)

Le Cowork et le Studio NE sont PAS dans `hermes serve` headless. Ils vivent
dans l'UI web (`web/src/`) qui doit être BUILDÉE (npm install + tsc + vite → dist/).
Le build est lancé par Claude Code Opus 5 en arrière-plan (pid 24244).

### Auth (loopback, bind 127.0.0.1) — RÉSOLUE
- En-tête `X-Hermes-Session-Token: <token>` (ou `Bearer <token>`).
- Le token = `HERMES_DASHBOARD_SESSION_TOKEN` (éphémère, généré au lancement).
- Ulysse le connaît (il lance le serve) et l'envoie sur chaque /api/*.
- Prouvé : sans token → 401, avec → passe le gate.

### Cowork (agent complet, outils) — route réelle + PROUVÉE EN RÉEL
- WebSocket `/api/ws` → JSON-RPC (même dialecte que le TUI Ink).
- PROUVÉ (2026-08-07) : handshake WS sur le dashboard buildé → `101
  Switching Protocols`, puis event `gateway.ready` reçu. Cowork = vivant.
- Auth WS en mode LOOPBACK (notre cas Ulysse) : `?token=<_SESSION_TOKEN>`
  direct (pas de ws-ticket). Le `/api/auth/ws-ticket` n'existe QU'EN mode
  gated OAuth (rejeté en loopback). → Source : web/src/lib/api.ts
  buildWsAuthParam() + test WS réussi avec ?token=.
- Méthodes JSON-RPC : session.create, prompt.submit, events message.delta…
- Le Chat terminal embarqué utilise `/api/pty` (WebSocket PTY) en plus.
- Ulysse = enveloppe : on ouvre le même `/api/ws?token=<token>`.

### Studio (plan VIVANT) — mécanisme réel
- PAS de page `StudioPage` séparée. Le plan = état de la session Cowork.
- Il est poussé via les EVENTS du gateway WS (ex. message.delta, tool_call…)
  et/ou lu via `/api/sessions` (liste, message_count, tokens…).
- Donc Studio = panneau qui écoute le même WS Cowork et reflète l'état réel.
  Conforme à la décision : miroir du plan vivant, PAS de fichier mocké.

### Routes /api déjà prouvées vivantes (headless, avec token)
- /api/status, /api/health (publics)
- /api/sessions (liste sessions : id, model, message_count, tokens)
- /api/memory (providers mémoire)
- /api/files?path=… (explorateur fichiers, racine = home user)
- /api/model/info, /api/model/set, /api/model/options
- /api/skills (liste skills installés)
- /api/config, /api/tools/toolsets
- /api/skills, /api/mcp, /api/cron, /api/messaging/* , /api/analytics

## Carte des endpoints Ulysse (Session B) — Entrée → Endpoint → Sortie

|cadre|entrée|endpoint Hermès|sortie|
|-----|-------|----------------|-------|
|Discussion (Session A, déjà fait)|saisie utilisateur|proxy :8645 /v1/chat/completions|bulle texte|
|Cowork|saisie + bouton "Travailler"|WS /api/ws (ticket /api/auth/ws-ticket)|réponses + outils en direct|
|Studio|panneau miroir|écoute WS /api/ws (events)|plan/état vivant|
|Sessions|clic liste|/api/sessions|liste + reprise|
|Fichiers|arbre|/api/files?path=|navigateur|
|Mémoire|onglet|/api/memory|providers|
|Skills|onglet|/api/skills|liste|
|Modèle|sélecteur|/api/model/set|changement modèle|
|Webhooks|onglet|gateway :8644 /webhooks/*|déclencheurs|
|Statut|bandeau|/api/status|état moteurs|

## Décision retenue (kuchu, 2026-08-07)
- Choix A : lancer `hermes dashboard` (UI buildée) comme moteur Session B.
- Ulysse enveloppe (wire-don't-rebuild), ne réécrit RIEN.
- Tout le code du projet est délégué à Claude Code Opus 5 (règle kuchu).
- Hermès (moi) garde : cadrage, archi, vérif, tests (règle : tester avant fini).

## BUG TROUVÉ (2026-08-07, test réel navigateur) — et solution

- Cowork (WS /api/ws) : PROUVÉ OK (réponse reçue « Bonjour ! Comment puis-je
  vous aider »). Studio (miroir) : OK.
- Onglets fetch /api/* (Sessions, Fichiers, Mémoire, Skills, Statut) :
  « Failed to fetch » dans le navigateur, ALORS QUE curl avec le même token
  + Origin répond 200.
- CAUSE (vérifiée) : le header custom `X-Hermes-Session-Token` rend la
  requête fetch NON-simple → le navigateur envoie un preflight OPTIONS.
  Le dashboard Hermès répond 401 sur ce OPTIONS (le gate auth l'intercepte
  au lieu de répondre 200 + CORS). Le navigateur bloque donc le fetch.
  Le WS n'a PAS ce problème (pas de preflight CORS strict sur upgrade WS).
- SOLUTION (wire-don't-rebuild, ne touche PAS au code Hermès) : faire de
  `serve.py` (serveur statique Ulysse) un reverse-proxy LÉGER pour /api/*
  et /api/ws vers le dashboard. La page appelle alors
  http://127.0.0.1:8080/api/... (MÊME origine que la page -> pas de
  preflight CORS), et serve.py relaie vers 127.0.0.1:9123 en ajoutant le
  token. WS : serve.py proxyfie aussi /api/ws (ou la page continue en
  direct, le WS marche déjà).
- À corriger par Opus : ajouter le reverse-proxy à serve.py (+ ajuster
  DASHBOARD_URL de ulysse-config.js vers 8080 au lieu de 9123).
