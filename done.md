# Ulysse — done

## 2026-08-07
- Fusion profil kuchu dans Hermes Home (Etape 1)
- Connexion Obsidian : junction vault Documents -> Hermes Home (Etape 3)
- Ossature dossiers coffre creee (Etape 2)

## 2026-08-07 (JALON 2) — Session A « Discussion »
- Page Discussion (web/discussion.html) : Material 3, fetch direct proxy :8645,
  historique multi-tour, gestion 403/erreurs connexion.
- Serveur statique (web/serve.py, port 8080) : livre la page HTTP 200.
- Lanceur (web/lancer_discussion.bat) : 1 clic ouvre serveur + page.
- Infra prouvee : proxy joint, CORS *, /v1/chat/completions OK.

## 2026-08-07 (JALON 3) — Session B « Cowork + Studio + onglets »
- Build complet dashboard Hermes : npm install + tsc + vite -> dist OK (Opus).
- session-b.html (Material 3, 7 onglets) : Discussion/Cowork/Studio/Sessions/
  Fichiers/Memoire/Skills. Cree par Opus, verifie par Hermes.
- ulysse-config.js : DASHBOARD_URL + SESSION_TOKEN + HERMES_URL.
- Cowork (WS /api/ws) : PROUVE en reel (reponse « Bonjour ! » recue).
- Studio : panneau miroir ecoute le meme WS, etat vivant.
- Sessions : PROUVE en reel (11 sessions Hermes listees dans le navigateur).
- Skills : PROUVE en reel (vraie liste affichee).
- Fichiers/Memoire/Statut : proxy OK (meme mecanisme que Sessions/Skills).
- Bug CORS /api/* resolu : serve.py = reverse-proxy leger 8080 -> 9123
  (injecte token, plus de preflight). Prouve en reel.
- Tout le code Session B delegue a Claude Code Opus 5 (regle kuchu).
