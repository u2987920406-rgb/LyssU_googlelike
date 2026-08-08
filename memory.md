# memory.md — Projet Ulysse

Mémoire du projet : décisions, faits durables, et leçons. Complémentaire à
`plan-ulysse.md` (la feuille de route) et `endpoints-ulysse.md` (la carte).
À tenir à jour à chaque avancée.

══════════════════════════════════════════════════════════════
PRINCIPE FONDAMENTAL
══════════════════════════════════════════════════════════════
Ulysse = MASQUE / version desktop VISUELLE de Hermes Agent.
• Rien à réinventer : on RELIE des points d'entrée/sortie vers ce que Hermès
  sait DÉJÀ faire (gateway, proxy, webhooks, MCP, profil, cron, slash commands).
• On ne réécrit PAS le moteur, on câble.
• ZÉRO friction pour l'utilisateur final (grand public, non technique).
• Tout modifiable avec marge (ne pas durcir les choix dans le code).

══════════════════════════════════════════════════════════════
FAITS DU RABLES (environnement)
══════════════════════════════════════════════════════════════
• Utilisateur : kuchu, sur Windows 10, bureau %USERPROFILE%\Desktop.
• Modèle de fond utilisé en ce moment : tencent/hy3:free (via provider nous).
• Hermès est lancé en CLI/terminal ; Ulysse sera sa couche visuelle.
3. L'utilisateur final s'authentifie via Portal OAuth (device_code) PAR DÉFAUT —
   il ouvre son navigateur, AUCUNE clé à coller (vérifié 2026-08-07 : auth active
   = Nous Portal OAuth, pas de clé dans .env). Clé API Nous en alternative (.env).
   Jamais de clé dans l'UI. Le proxy utilise l'auth Hermès.

══════════════════════════════════════════════════════════════
DÉCISIONS D'ARCHITECTURE (validées en discussion)
══════════════════════════════════════════════════════════════
1. Moteur invisible = `hermes gateway run` + `hermes proxy` (API locale
   OpenAI-compatible sur localhost). L'UI appelle le proxy, pas la clé.
2. Studio = MIROIR TEMPS RÉEL du plan/script de l'agent. AUCUNE data fictive
   (la maquette actuelle a du faux : à remplacer par le flux gateway live).
3. Vestiaire = 6 RÔLES (PAS des agents) :
     Orchestrateur · Généraliste · Raisonnement · Codage · Appel d'outil · Garde-fou
   Garde-fou contient les « 3 fantômes ».
   Cerveau d'un rôle = local / natif Hermès (même que CLI, ex. hy3) / API.
   Dans chaque rôle : agents spécialisés (skills + personnalité + propre soul.md).
4. Mémoire = via Obsidian. Fichier « coffre-mémoire » dans un dossier « Mère ».
   Toute skill apprise / notion modifiée dans Ulysse est retranscrite indexée
   là. L'installateur inclura un pack Obsidian + ce coffre. (À brancher PLUS TARD.)
5. Permissions en 2 couches :
     COUCHE 1 — Surface : Discussion (chat pur, AUCUN outil ordi, ne peut que
       parler/liens/plans) vs Cowork (comme CLI : fichiers/terminal). Basculer
       en Cowork est OBLIGATOIRE pour toucher l'ordinateur.
     COUCHE 2 — 4 sous-modes (uniquement en Cowork, au choix user, JAMAIS imposés) :
       Auto (valide tout invisiblement, toute la séance)
       Accept-edit (smart : risque faible auto, risque fort demandé)
       Manuel (toujours demander)
       Plan (propose un plan, attend validation avant d'exécuter)
     Mapping Hermès : Discussion = proxy sans tools ; Cowork = agent complet ;
       sous-modes = approvals.mode (off/smart/manual) + workflow « plan ».
6. Raccourcis ergonomiques (ex. « / » pour skills, liste, approval mode) =
   reprennent les slash commands Hermès EXISTANTES + palette ⌘K. Pas d'invention.
7. Automatisations (cron) : à placer selon l'ergonomie, pas forcé dans un panneau.

══════════════════════════════════════════════════════════════
COMPOSANTS HERMÈS RÉUTILISÉS (rien à coder from scratch)
══════════════════════════════════════════════════════════════
gateway run · proxy (/v1/chat/completions) · webhook subscribe (1 URL/bouton) ·
config.yaml mcp_servers (MCP/API/plugins) · profil $HERMES_HOME (fichiers +
agents + projets) · cron / delegate_task / kanban · slash commands + palette ⌘K ·
approvals.mode (smart/manual/off) · STT/TTS natifs · redaction de secrets.

══════════════════════════════════════════════════════════════
RÉSERVES HONNÊTES (à lever par test réel, pas encore vérifiées)
══════════════════════════════════════════════════════════════
• CORS : navigateur localhost fetch un autre port localhost → risque de blocage
  si le proxy ne renvoie pas les bons en-têtes. Sécurité max = servir Ulysse
  depuis le même petit serveur et proxyfier /api/* vers Hermès.
• `hermes proxy` récupère-t-il bien la clé user dans .env ?
• Studio : le gateway expose-t-il un flux live (WebSocket/SSE) de l'état de
  session ? Sinon, mini-serveur relais host.onEvent → Ulysse en SSE/WS.
• Sous-mode PLAN : pas un flag natif, à câbler comme workflow « propose+attend ».

══════════════════════════════════════════════════════════════
PERSONAS DE TEST (voir personas-ulysse.md)
══════════════════════════════════════════════════════════════
P1 Camille (potière, grand public) · P2 Karim (dev) · P3 Sophie (automate) ·
P4 Léa (notes/recherche, mémoire isolée) · P5 Marc (manager, rôles+Studio) ·
P6 Nadia (rédactrice, Discussion pur) · P7 Tom (analyste, MCP/API) ·
P8 Inès (Telegram-first) · P9 Hugo (onboarding/install) · P10 Yuki (vocal, bilingue).
Matrice de couverture : chaque surface de la carte est testée par ≥1 persona.

══════════════════════════════════════════════════════════════
JOURNAL DE SÉANCE
══════════════════════════════════════════════════════════════
[2026-08-07] Session de cadrage (discussion pure, aucun code).
  - Défini Ulysse = masque visuel de Hermès, loi d'or « zéro friction / rien
    à réinventer ».
  - Dressé la carte des endpoints (Menu, Discuter, Studio, Vestiaire, Projets,
    Réglages + blocs transverses : Auto, MCP, Permissions, Canaux, Vocal, Skills,
    Raccourcis).
  - Clarifié : Studio = miroir réel ; Vestiaire = 6 rôles (pas agents) ;
    mémoire via Obsidian (plus tard) ; permissions 2 couches (Discussion/Cowork
    + 4 sous-modes au choix).
  - Créé 10 personas de test + dossier « Projet Ulysse » avec maquette, personas,
    endpoints, plan, memory.
  - Prochaine étape (quand on passe à la technique) : Étape 1 du plan = valider
    le flux Hermès réel (gateway/proxy/webhook) et lever les réserves.
