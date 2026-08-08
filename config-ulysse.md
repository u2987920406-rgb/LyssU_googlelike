# Schéma de config — Projet Ulysse

Contrat CONCRET entre l'UI Ulysse et le moteur Hermès. Forme des fichiers que
Ulysse écrit/lit dans le profil Hermès ($HERMES_HOME, par défaut ~/.hermes/).
Rien n'est inventé : on utilise les emplacements et clés QUE HERMÈS CONNAÎT.
À valider par test réel (Étape 1 du plan) avant de coder le câblage.

══════════════════════════════════════════════════════════════
0. EMPLACEMENTS + MOTEURS (VÉRIFIÉ ÉTAPE ZÉRO, 2026-08-07)
══════════════════════════════════════════════════════════════
HERMES_HOME = %USERPROFILE%\.hermes  (cf. ci-dessus)

TROIS moteurs à démarrer par l'installateur (le « moteur invisible ») :
  • hermes proxy start --provider nous --port 8645
      → API OpenAI-compatible PUBLIQUE. Sert le mode DISCUSSION (chat pur).
  • hermes gateway run  (webhook activé en config)
      → reçoit les boutons webhook (:8644). Requis pour webhooks + canaux.
  • hermes serve --port 9119
      → BACKEND COMPLET JSON-RPC/WebSocket. Ulysse l'appelle pour :
        Cowork, Studio (flux /api/sessions/{id}/messages + ws-ticket),
        fichiers (/api/fs/*), mémoire (/api/learning/graph), vocal
        (/api/audio/transcribe + /api/audio/speak), cron (/api/cron/*),
        MCP (/api/mcp/*), statut (/api/health, /api/status).
      → PAS BESOIN de mini-serveur relais fait main : hermes serve EST le backend.

IMPORTANT : Ulysse (navigateur) appelle proxy:8645 et serve:9119 (mêmes
origines loopback). CORS : à vérifier ; sécurité max = servir la page Ulysse
depuis un petit serveur statique qui proxyfie /api/* vers :9119 et /v1 vers :8645.
    config.yaml            ← outils de config (approvals, mcp, models, platforms)
    .env                   ← secrets (CLÉ API Nous de l'utilisateur, jamais dans UI)
    user.md                ← REG-1 (profil utilisateur)
    soul.md                ← REG-2 (caractère Ulysse)
    MEMORY.md              ← REG-3 (à retenir)
    ACQUIS.md              ← REG-4 (il retient)
    roles\                 ← VES : 6 rôles
    agents\                ← VES : agents spécialisés
    projects\              ← PRO : un dossier par projet
    logs\                  ← REG-10 (diagnostic)

══════════════════════════════════════════════════════════════
1. AUTH (premier lancement) — ÉTAPE ZÉRO : OAuth PAR DÉFAUT
══════════════════════════════════════════════════════════════
RÉALITÉ VÉRIFIÉE (2026-08-07) : Hermès utilise Portal OAuth (device_code),
PAS de clé dans .env. L'utilisateur final s'authentifie via son navigateur
(ouvre une URL, confirme) → zéro friction, AUCUNE clé à coller.

Deux chemins gérés par l'installateur :
  • DÉFAUT (recommandé) : `hermes portal` / `hermes auth` device_code →
    l'utilisateur ouvre son navigateur, pas de clé. C'est ça « Ulysse ».
  • ALTERNATIVE : s'il possède une clé API Nous, on la met dans .env
    (NOUS_API_KEY=sk-...).
Règle absolue : jamais de clé dans le code HTML/JS d'Ulysse ni dans l'UI.
Le proxy utilise la config/auth Hermès, pas la clé de l'UI.

PRÉREQUIS SOCLE (couac B) : `hermes gateway start` + webhook activé
(config platforms.webhook) doivent tourner pour que webhook/Studio vivent.

══════════════════════════════════════════════════════════════
2. config.yaml — éléments pilotés par Ulysse (C)
══════════════════════════════════════════════════════════════
# --- Permissions (PERM-1) : reflète les 4 sous-modes en Cowork ---
approvals:
  mode: smart            # smart | manual | off
                        # Auto→off, Accept-edit→smart, Manuel→manual
                        # Plan = pas un flag : workflow « propose+attend »

# --- Provider / cerveau général (REG-8) ---
model: tencent/hy3:free           # cerveau GÉNÉRAL (natif)
# cerveau de RELATION : voir roles\ si distinct

# --- Connexions MCP / API (MCP-1) ---
mcp_servers:
  mon_api:
    url: "https://..."           # ou command/args pour stdio
    headers: { Authorization: "Bearer sk-..." }
    # la clé va dans env/headers, JAMAIS exposée au LLM (redaction Hermès)

# --- Canaux distants (DIST-1) ---
platforms:
  telegram:
    enabled: true
    # token fourni par l'utilisateur dans l'UI, stocké ici

# --- Mémoire / recall (REG-7, futur Obsidian) ---
# Le coffre Obsidian est en DEHORS de $HERMES_HOME ; Ulysse y retranscrit.
obsidian:
  vault: "C:\\Users\\kuchu\\Documents\\Mère\\coffre-mémoire"
  enabled: false        # branché PLUS TARD

══════════════════════════════════════════════════════════════
3. RÔLES (VES) — structure dans roles\
══════════════════════════════════════════════════════════════
roles\
  00-orchestrateur.yaml
  01-generaliste.yaml
  02-raisonnement.yaml
  03-codage.yaml
  04-appel-outil.yaml
  05-gardefou.yaml        ← contient les 3 fantômes (05a/05b/05c)
Chaque fichier de rôle :
  id: codage
  nom: "Codage"
  cerveau: natif           # local | natif | api
  provider: tencent        # si api
  model: hy3               # si natif/api
  agents:                 # agents spécialisés DANS ce rôle
    - python
    - frontend

agents\
  python.yaml
    role: codage
    skills: [python, testing]        # skills Hermès existantes
    soul: agents/python.soul.md      # sa personnalité propre
  frontend.yaml
    role: codage
    skills: [html, css, js]
    soul: agents/frontend.soul.md

Note : le format exact (yaml vs json, clés) sera confirmé par lecture de la
doc Hermès agents/profiles à l'Étape 1. Ce schéma est la CIBLE.

══════════════════════════════════════════════════════════════
4. PROJETS (PRO) — structure dans projects\
══════════════════════════════════════════════════════════════
projects\
  poterie\
    MEMORY.md             ← mémoire isolée du projet
    ACQUIS.md
    .closed               ← présent = projet clos (pas effacé)
    travail\              ← LE bac à sable (working dir de l'agent)
Règle : l'agent n'écrit QUE dans projects\<nom>\travail\. Rien dehors.

══════════════════════════════════════════════════════════════
5. STUDIO (miroir) — source du flux
══════════════════════════════════════════════════════════════
Studio n'écrit RIEN. Il LIT l'état d'une session agent :
  - nœuds = étapes du plan
  - arêtes = flux entre étapes
  - statut = en attente / en cours (néon) / fini
Source : flux gateway (host.onEvent 'plan-update') relayé vers Ulysse.
Format attendu (à confirmer) : JSON { nodes:[{id,titre,equipe,statut}],
edges:[{from,to}], active:id }.

══════════════════════════════════════════════════════════════
6. SURFACE Discussion vs Cowork (MODE-1)
══════════════════════════════════════════════════════════════
Discussion : Ulysse appelle `hermes proxy` /v1/chat/completions SANS tools.
            → l'agent ne peut rien exécuter (pas d'outils système).
Cowork      : Ulysse démarre/relie une session Hermès COMPLÈTE (tools actifs).
            → soumis à approvals.mode (PERM-1).
Basculer en Cowork est OBLIGATOIRE pour toute action sur l'ordi.

══════════════════════════════════════════════════════════════
7. RÉSERVES — ÉTAT ÉTAPE ZÉRO (2026-08-07)
══════════════════════════════════════════════════════════════
LEVÉES :
  • COUAC B : gateway + webhook démarrés en réel (health 200, webhook OK).
  • COUAC C : Studio = lit /api/sessions/{id}/messages (+ ws-ticket) sur
    hermes serve :9119. AUCUN mini-serveur maison nécessaire.
RESTANTES :
  • Cowork (run agent depuis UI) = via WebSocket serve (:9119), pas route
    REST évidente — à confirmer (plier client WS) à l'étape 1.
  • Filtrage "outils OFF" Discussion : le proxy OpenAI n'active pas les
    outils système par défaut (pur LLM) → OK, à valider que terminal/read_file
    ne sont pas exposés par le proxy.
  • Telegram : gateway platforms à configurer 1re fois (token user).
  • Formats roles/agents/projects : à confirmer en lisant la doc agents.
  • CORS localhost (proxy:8645 / serve:9119) : à vérifier au 1er vrai fetch.
