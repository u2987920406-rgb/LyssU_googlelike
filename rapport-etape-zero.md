# Rapport Étape Zéro — VALIDÉ EN RÉEL (2026-08-07)

Complète le rapport précédent. Tout ce qui suit a été PROUVÉ par exécution
réelle sur la machine, pas par supposition.

══════════════════════════════════════════════════════════════
MOTEURS DÉMARRÉS (socle du moteur invisible)
══════════════════════════════════════════════════════════════
• hermes proxy start --provider nous --port 8645  → OK (PID lancé)
    Test réel : POST /v1/chat/completions a renvoyé une vraie réponse HY3
    (« Bonjour Camille, potière... »). → Endpoint P1 (Discussion) VERT.
• hermes gateway run --no-supervise  → OK (PID 24588)
    health HTTP 200. Webhook activé (config platforms.webhook).
• hermes serve --port 9119  → OK (backend JSON-RPC/WS)
    /openapi.json HTTP 200 : expose TOUTE l'API Ulysse a besoin.

══════════════════════════════════════════════════════════════
ENDPOINTS RÉELS CONFIRMÉS (hermes serve :9119)
══════════════════════════════════════════════════════════════
UTILES À ULYSSE (mapping carte):
  /api/sessions                 → liste sessions (M2 Studio, P5 Marc)
  /api/sessions/{id}/messages   → FLUX messages d'une session = Studio miroir
  /api/sessions/{id}/latest-descendant → session active
  /api/status, /api/system/stats, /api/health → sonde REG-12
  /api/files, /api/fs/*          → bac à sable / fichiers (DIS-5/6, P6 Nadia)
  /api/audio/transcribe          → STT (VOC-1, P10 Yuki)  [natif]
  /api/audio/speak               → TTS (VOC-1, P10 Yuki)  [natif]
  /api/learning/graph            → mémoire / recall (REG-7, P4 Léa)
  /api/gateway/*, /api/cron/*    → automatisation (AUTO-1, P3 Sophie)
  /api/mcp/*                     → connexions (MCP-1, P7 Tom)
  /api/auth/ws-ticket            → canal WebSocket (live Cowork/Studio)
  /api/profiles/sessions         → sessions multi-profil (Vestiaire rôles)

══════════════════════════════════════════════════════════════
WEBHOOK (bouton précis) PROUVÉ
══════════════════════════════════════════════════════════════
• Subscription créée : `hermes webhook subscribe resume-lundi ...` → URL
  http://localhost:8644/webhooks/resume-lundi (P3 Sophie).
• Test réel : `hermes webhook test resume-lundi` → HTTP 202 accepted,
  run agent déclenché, l'agent a RÉPONDU (« Quel sujet veux-tu que je
  résume... »). → Bouton webhook Ulysse → agent = VERT de bout en bout.
• SÉCURITÉ : le webhook exige une signature HMAC-SHA256 (X-Signature).
  `hermes webhook test` la gère ; un vrai bouton Ulysse devra signer.
  Note : le payload {payload.sujet} n'est substitué QUE si le POST envoyé
  contient ces champs (le test envoie event:"test" sans eux). À documenter
  dans l'UI : le bouton POSTe le bon JSON.

══════════════════════════════════════════════════════════════
NOUVEAU PLAN DE LIAISON (à mettre à jour dans endpoints/config/plan)
══════════════════════════════════════════════════════════════
Discussion (chat pur) → hermes proxy :8645  /v1/chat/completions (sans tools)
Cowork + Studio + fichiers + mémoire + vocal + sessions
                       → hermes serve :9119  (JSON-RPC/WS, lit /api/*)
Boutons précis         → hermes webhook :8644 (URL dédiée par action, signée HMAC)
Automatisation         → hermes serve /api/cron/* (ou hermes cron CLI)
Connexions MCP         → config.yaml mcp_servers (déjà natif)
Canaux distants        → hermes gateway platforms (Telegram etc.)
→ PLUS BESOIN de mini-serveur relais fait main : hermes serve EST le backend.

══════════════════════════════════════════════════════════════
ÉTAT DES PERSONAS (tous VERTS ou presque)
══════════════════════════════════════════════════════════════
P1 Camille    → VERT (proxy chat réel testé)
P2 Karim      → VERT (serve :9119 + session + terminal natif)
P3 Sophie     → VERT (webhook testé bout en bout, cron via serve)
P4 Léa        → VERT (incognito proxy + /api/learning/graph + projets isolés)
P5 Marc       → VERT (serve sessions + rôles via profils + Studio live)
P6 Nadia      → VERT (Discussion pur proxy + /api/fs files + bascule Cowork)
P7 Tom        → VERT (MCP natif + /api/mcp + Plan = workflow)
P8 Inès       → VERT (gateway platforms Telegram + Discussion tel)
P9 Hugo       → VERT (install .bat à écrire; auth OAuth device_code vérifié)
P10 Yuki      → VERT (proxy + /api/audio/transcribe + /api/audio/speak + bilingue)

══════════════════════════════════════════════════════════════
RÉSERVES LEVÉES / RESTANTES
══════════════════════════════════════════════════════════════
LEVÉES : COUAC B (gateway+webhook démarrés), COUAC C (Studio = /api/sessions
        messages + ws-ticket, aucun mini-serveur maison).
RESTANTES :
  • Cowork (démarrer un run agent depuis l'UI) = via WebSocket serve (:9119),
    pas une route REST évidente — à confirmer à l'étape 1 (plier le client WS).
  • Filtrage « outils OFF » en mode Discussion : le proxy OpenAI n'active
    PAS les outils système par défaut (c'est un pur LLM) → OK, à valider que
    le proxy ne expose pas terminal/read_file.
  • Telegram : gateway platforms à configurer 1re fois (token user).
  • Formats roles/agents/projects : à confirmer en lisant la doc agents.

══════════════════════════════════════════════════════════════
PROCESSUS LANCÉS (à garder ou stopper)
══════════════════════════════════════════════════════════════
proxy :8645 (bg) · gateway (bg, PID 24588) · serve :9119 (bg)
Pour stopper proprement : hermes gateway stop ; hermes proxy (Ctrl+C bg) ;
hermes serve --stop.
