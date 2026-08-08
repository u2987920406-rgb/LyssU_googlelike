# Plan — Projet Ulysse (masque visuel de Hermes Agent)

## Vision
Ulysse est la version DESKTOP VISUELLE de Hermes Agent. L'utilisateur final
(grand public, non technique) ne voit qu'une icône sur le bureau : il double-clique,
une interface web s'ouvre dans son navigateur, et Hermès travaille en arrière-plan,
invisible. ZÉRO friction. On ne réinvente RIEN : on relie la coquille UI aux
éléments DÉJÀ existants de Hermès.

## Décisions d'architecture (validées en discussion)
1. Ulysse = masque. Le moteur est Hermès (gateway run + proxy).
2. L'utilisateur final s'authentifie via Portal OAuth (device_code) PAR DÉFAUT —
   il ouvre son navigateur, AUCUNE clé à coller (vérifié 2026-08-07). Clé API
   Nous en alternative (.env).
3. Studio = miroir TEMPS RÉEL du plan/script de l'agent (aucune data fictive).
4. Vestiaire = 6 RÔLES (pas des agents) : Orchestrateur, Généraliste, Raisonnement,
   Codage, Appel d'outil, Garde-fou (+3 fantômes). Cerveau = local / natif / API.
   Dans chaque rôle : agents spécialisés (skills + personnalité + soul.md).
5. Mémoire via Obsidian (coffre-mémoire, dossier « Mère ») — brancher PLUS TARD.
6. Permissions en 2 couches :
     • Surface : Discussion (chat pur, aucun outil ordi) vs Cowork (comme CLI).
       Basculer en Cowork est OBLIGATOIRE pour toucher l'ordinateur.
     • 4 sous-modes (uniquement Cowork, au choix user, jamais imposés) :
       Auto / Accept-edit / Manuel / Plan → mapping approvals.mode Hermès.
7. Tout est modifiable avec marge ; les raccourcis (ex. « / ») reprennent les
   slash commands Hermès existantes.

## Composants Hermès réutilisés (rien à coder from scratch)
• hermes gateway run      → moteur invisible en arrière-plan
• hermes proxy            → API locale OpenAI-compatible (/v1/chat/completions)
• hermes webhook subscribe → 1 endpoint par bouton/action précise
• config.yaml mcp_servers → connexions MCP / API / plugins
• Profil $HERMES_HOME     → fichiers user/soul/MEMORY/ACQUIS, agents, projets
• cron / delegate / kanban → automatisation, sous-agents, file de travail
• slash commands + palette ⌘K → raccourcis ergonomiques
• approvals.mode          → niveaux de permission (smart/manual/off + plan)

## Ordre de construction proposé (quand on passe à la technique)
Étape 1 — Valider le flux Hermès réel (lancer les commandes : gateway, proxy,
          webhook) pour confirmer les endpoints et lever les réserves (CORS…).
Étape 2 — Relier le 1er composant : DISCUTER (chat proxy, mode Discussion pur).
Étape 3 — Boutons précis via webhooks (image, résumé, recherche…).
Étape 4 — Réglages → écriture des 3 fichiers dans le profil Hermès.
Étape 5 — Studio miroir (flux live de l'état de session).
Étape 6 — Vestiaire (rôles, cerveaux, agents, soul.md, skills).
Étape 7 — Projets (dossiers isolés + mémoire).
Étape 8 — Permissions Discussion/Cowork + 4 sous-modes.
Étape 9 — Connexions MCP/API, canaux distants, vocal.
Étape 10 — Installateur .bat from-scratch (Python/uv/Node/Playwright/Hermes/webui)
           + raccourci bureau + premier lancement (auth OAuth Portal par défaut,
           clé API en alternative).
Étape 11 (plus tard) — Mémoire Obsidian (pack + coffre-mémoire).

## Personas de test
Voir personas-ulysse.md (10 profils P1–P10 couvrant toutes les surfaces).
À chaque étape, on prend le persona qui exerce le composant branché.

## Fichiers du dossier
• maquette-ulysse-google-33.html  → coquille UI actuelle (front-only, à relier)
• personas-ulysse.md              → 10 personas de test + matrice de couverture
• endpoints-ulysse.md             → carte des endpoints (entrée→endpoint→sortie)
• plan-ulysse.md                  → ce document
