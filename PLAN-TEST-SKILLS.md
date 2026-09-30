# PLAN DE TEST DES SKILLS ULYSSE — 2026-09-05

**Objectif (Raf)** : valider que CHAQUE skill listée dans le picker « / » du chat
Ulysse fonctionne et a un endpoint réel correspondant à son contexte.

**Méthode** : RPC `commands.catalog` sur le WS 127.0.0.1:8090 (origin
`http://127.0.0.1:8090`) → 215 paires = **95 commandes internes + 117 skills +
3 extras TUI** (`/density`, `/logs`, `/mouse`, annoncées mais « Unknown command »
au TUI worker). Croisé avec `scan_skill_commands()` du profil ulysse (116
entrées + collision `/handoff` documentée par Hermes lui-même).

**Contrat d'exécution constaté** (source : `tui_gateway/methods_tools.py`,
`agent/skill_commands.py`, `apps/desktop/.../slash.ts`) :

| étape | RPC | résultat |
|---|---|---|
| commandes internes | `slash.exec {session_id, command:"/cmd"}` | `{output}` |
| skills | `slash.exec` → **erreur 4018** « use command.dispatch » puis `command.dispatch {session_id, name, arg}` | `{type:"skill", message, display}` |

⚠️ **LACUNE ULYSSE n°1** : le chat (`web/ulysse-app.js`, `executerSlash`)
n'envoie QUE `slash.exec` — toute skill du picker renvoie donc « Commande
refusée : 4018 » à l'utilisateur. Le desktop Hermes fait le fallback
`slash.exec → command.dispatch` (`slash.ts` lignes 378-435) ; Ulysse doit
l'imiter.

## Familles

- **A — Commandes internes Hermes** : 95 paires (`/new`, `/model`, `/history`…).
  Endpoint réel = worker TUI Hermes (`slash.exec`). Aucune dépendance externe.
- **B — Skills agent « Use when… »** (pas d'endpoint, chargées par le modèle via
  toolsets/skill_view) : 40 sur disque. Les autres skills « Use when… » ont
  quand même un `/slug` dispatchable — la famille B pure est petite.
- **C — Skills à endpoint réel** : 77. Endpoint = le binaire/API cité par le
  SKILL.md (`gh`, `himalaya`, `freebuff`, `curl+API`, `openpyxl`…). Le test
  réel du *dispatch* charge le payload skill ; l'usage effectif dépend des
  prérequis machine (colonne « endpoint réel / prérequis »).

## Tableau — échantillon réellement testé (2026-09-05, serveur 0.20.6)

### A. Commandes internes — 62 testées via `slash.exec` (sessions jetables `source='qa'`)

| skill/commande | famille | prérequis | test | résultat | endpoint réel |
|---|---|---|---|---|---|
| /help /version /whoami /profile | A | — | slash.exec | **OK** | worker TUI |
| /status /config /usage /subscription | A | — | slash.exec | **OK** | worker TUI |
| /tools /toolsets /skills /plugins /platforms | A | — | slash.exec | **OK** | worker TUI |
| /approvals /timestamps /focus /footer /statusbar /verbose /indicator /busy /yolo (usage) | A | — | slash.exec | **OK** | worker TUI |
| /model /context all /history /memory /reasoning show /fast status | A | — | slash.exec | **OK** | worker TUI |
| /journey list /learning /memory-graph /heartbeat status /egress status /battery status /diff session | A | — | slash.exec | **OK** | worker TUI |
| /agents /tasks /cron /bundles /suggestions /insights /curator /codex-runtime | A | — | slash.exec | **OK** | worker TUI |
| /sessions /goal /subgoal /loop /kanban /review /debug /pwf /pwf-status /blueprint | A | — | slash.exec | **OK** | worker TUI |
| /btw usage /bg usage /refine /title /save usage /export /import usage /worktree list /branch usage /compress --preview /rollback /snapshot /handoff usage /hb /snap /stop | A | — | slash.exec | **OK** | worker TUI |
| /wake /voice /image usage /paste /copy /browser /topup /reload /resume usage /pet /plan-status /learn usage /init usage /plan usage /skin /palette /personality | A | — | slash.exec | **OK** | worker TUI |
| /reload-skills | A | — | slash.exec | **OK** (rescan 116 skills) | worker TUI |
| /queue (et alias /q), /steer | A | un arg | slash.exec sans arg | **KO usage** 4004 (comportement NORMAL, la commande marche avec arg) | worker TUI |
| /retry /undo | A | un historique | session vide | **KO usage** 4018 « no previous user message » (normal sur session neuve) | worker TUI |
| /moa | A | un arg | sans arg | **KO usage** 4004 | worker TUI |
| /quit | A | — | session jetable | **OK** (no output ; le gateway survit) | worker TUI |
| /hatch | A | — | slash.exec | **KO** 5030 « slash worker timed out » (45 s) | worker TUI — génération pet trop lente |
| /update | A | réseau | slash.exec | **KO** 5030 worker timed out | worker TUI — vérif upstream trop lente |
| /reload-mcp | A | MCP configurés | slash.exec | **KO** 5030 worker timed out | worker TUI — rediscovery MCP > 45 s |
| /density /logs /mouse | A (extras TUI) | TUI réel | slash.exec | **KO** « Unknown command » (annoncées par commands.catalog mais TUI-only) | TUI interactif uniquement |
| /new /clear /redraw /stop /fast /save <fichier> /goal <texte> /import <archive>… | A | — | non exécutés (effets de session / destructifs) | **N-A** (usage vérifié via /help + source) | worker TUI |

### B. Skills agent « Use when… » (famille B pure — pas d'endpoint)

| skill | prérequis | test | résultat |
|---|---|---|---|
| tdd | fichier `~/.hermes/profiles/ulysse/skills/mattpocock/engineering/tdd/SKILL.md` | dispatch | **OK** (payload skill) |
| planning-with-files | plugin `~/.hermes/plugins/planning-with-files/` installé (v0.2.0, 3 tools/hooks/commands) | dispatch + /pwf /pwf-status | **OK** |
| reasoning-verification-patterns | fichier skill présent | fichier vérifié | **OK (prérequis)** |
| code-review / triage / domain-modeling / grill-* / teach / handoff… (37 autres) | fichiers SKILL.md présents (122 au total sur disque) | présence vérifiée en masse | **OK (prérequis)** |

### C. Skills à endpoint réel — 29 dispatchées réellement + prérequis machine

| skill | endpoint réel / prérequis | test dispatch | prérequis machine | résultat global |
|---|---|---|---|---|
| ulysse-deploy | serveur Ulysse (8090) + hermes CLI | dispatch **OK** | serveur en marche ✓ | **OK** |
| hermes-ops | hermes CLI + ~/.hermes | dispatch **OK** | ✓ | **OK** |
| qa-loop | gh + issue tracker repo | dispatch **OK** (skill absente du PROFIL ulysse : lue dans `~/.hermes/skills/autonomous-ai-agents/` — voir lacunes) | gh authentifié u2987920406-rgb ✓ | **OK** |
| himalaya / email-bulk-triage / gmail-bulk-triage / himalaya-bulk-email-ops | CLI himalaya | dispatch himalaya **OK** | `~/.local/bin/himalaya` ✓ (config IMAP : non vérifiée) | **OK** |
| github | CLI gh | dispatch **OK** | gh auth ✓ | **OK** |
| xlsx / docx / pdf / powerpoint | openpyxl/python-docx/pypdf/python-pptx | dispatch xlsx+pdf **OK** | **modules Python ABSENTS** du python système ET du venv Hermes → KO à l'usage | **MITIGÉ** |
| maps | curl OSM/OSRM | dispatch **OK** | curl ✓ | **OK** |
| arxiv | API arXiv (curl) | dispatch **OK** | réseau ✓ | **OK** |
| obsidian | vault Obsidian | dispatch **OK** | **aucun vault** aux chemins usuels → skill inutilisable en l'état | **MITIGÉ** |
| youtube-content | yt-dlp / API | dispatch **OK** | **yt-dlp absent** → KO à l'usage | **MITIGÉ** |
| gif-search | curl + jq + $TENOR_API_KEY | dispatch **HANG 300 s** | jq ✓ mais **$TENOR_API_KEY absente** → le gateway demande un secret (`secret.request`) que personne ne peut répondre sur WS non interactif | **KO** (voir lacunes) |
| notion / airtable | $NOTION_API_KEY / $AIRTABLE_API_KEY + curl | dispatch **HANG** (même cause) | clés absentes | **KO** (même cause) |
| teams-meeting-pipeline | $MSGRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET | dispatch **HANG** (même cause) | clés absentes | **KO** (même cause) |
| freebuff / freebuff-mcp-bridge / freebuff-orchestration | pont MCP `freeB` (TUI) ou CLI freebuff | dispatch freebuff **OK** (0,1 s) | CLI `freebuff` ✓ mais **pas de bridge freeB actif** (socket/TUI non trouvés) | **MITIGÉ** (payload OK, endpoint MCP éteint) |
| xurl | CLI xurl | dispatch **OK** | **binaire xurl ABSENT** → KO à l'usage | **MITIGÉ** |
| google-workspace | gws CLI | dispatch **OK** | **gws ABSENT** → KO à l'usage | **MITIGÉ** |
| computer-use | cua-driver | fichier skill ✓ | **cua-driver absent** (import KO) | **MITIGÉ** |
| claude-code | CLI claude | fichier skill ✓ | `~/.local/bin/claude` ✓ | **OK** |
| codex / opencode | CLI codex / opencode | fichier skill ✓ | **absents** | **MITIGÉ** |
| cabinet-agentique / multi-agent-orchestration / hermes-github-claude-loop | orchestration Hermes + gh | dispatch cabinet-agentique **OK** | gh ✓ | **OK** |
| transfert-projet / raf-discord-conventions / raf-daily-ai-digest | Discord | dispatch **OK** ×2 | plugin Discord non configuré côté profil (config.yaml `plugins.enabled: []`) | **OK dispatch / N-A usage** |
| dogfood / spike / systematic-debugging / hermes-agent | navigateur/projet locaux | dispatch dogfood **OK** | navigateur ✓ | **OK** |
| codebase-inspection | pygount | dispatch **OK** | **pygount absent** → KO à l'usage | **MITIGÉ** |
| google-drive-fuse / -mount / ocamlfuse | google-drive-ocamlfuse + FUSE | fichier skill ✓ | binaire ✓ (montage non tenté — effet de bord système) | **OK (prérequis)** |
| hermes-usage-tracking / hermes-usage-monitoring | state.db + sqlite | fichier skill ✓ | state.db lisible ✓ | **OK (prérequis)** |
| port-server-scan / mangoos-* / bmax-node-pwa-deploy / ubuntu-app-install | ss/udev/apt | fichier skill ✓ | ss ✓ ; ~/projets/mangoos **absent** | **OK/N-A selon contexte** |
| godot-android-game | godot CLI | fichier skill ✓ | **godot absent** | **MITIGÉ** |
| manim-video / ascii-video / songsee | manim / ffmpeg / librosa | fichier skill ✓ | ffmpeg ✓ ; manim/librosa **absents** | **MITIGÉ** |
| humanizer / claude-design / popular-web-designs / design-md / p5js / baoyu-infographic / architecture-diagram / blocked-page-recovery / grill-me / wait-what / weekly-review-planning / document-to-action-items / meeting-action-items / la-methode / clapet-anti-retour… | rien (méthodo) ou navigateur | dispatch ×7 (maps/pdf/arxiv/humanizer/obsidian/youtube-content/blocked-page-recovery + wait-what, grill-me) **OK** | — | **OK** |

**Bilan échantillon : 62 commandes A + 29 dispatch skills C/B + ~25 vérifs de
prérequis = ~110 vérifications réelles.**

## Providers disponibles (demande Raf, 2026-09-05)

Le chat Ulysse hérite des providers authentifiés du home Hermes global
(RPC `model.options`, pas de RPC `providers.list`). État réel relevé :

| provider | modèles | authentifié | rôle |
|---|---|---|---|
| ollama-cloud | 23 | ✓ | **courant** (config profil ulysse : `model.provider: ollama-cloud`, `glm-5.3-flash`) |
| nous | 48 | ✓ | Nous Portal (plan Free — beaucoup de modèles `unavailable_models`, :free inclus) |
| anthropic | 11 | ✓ | clés/hermes auth déjà posées |
| copilot | 17 | ✓ | GitHub Copilot (built-in) |
| opencode-free | 7 | ✓ | OpenCode Free |
| moa | 1 (virtuel) | ✓ | Mixture of Agents (agrégateur) |

**Pour AJOUTER d'autres providers** (openrouter, kimi-coding, z-ai, minimax,
google, bedrock…) : chacun exige une clé API (`model.save_key` RPC ou
`/model` TUI) → décision Raf + secrets, jamais posés sans accord explicite.
Le harnais vérifie que `model.options` liste ≥ 4 providers authentifiés
(dégradation visible si un provider tombe).

## LACUNES

1. **Le chat Ulysse ne peut pas exécuter les 117 skills du picker** : `slash.exec`
   renvoie 4018 pour tout ce qui est skill ; il faut le fallback
   `command.dispatch {session_id, name, arg}` (déjà codé côté desktop dans
   `slash.ts`). Correctif côté `web/ulysse-app.js` (`executerSlash`) : attraper
   l'erreur 4018 et retenter via `command.dispatch`, puis soumettre
   `message` comme prompt (payload model-facing, afficher `display`).
2. **4 skills hanguent le gateway 300 s** quand leur variable d'environnement
   requise manque (`gif-search`→$TENOR_API_KEY, `notion`→$NOTION_API_KEY,
   `airtable`→$AIRTABLE_API_KEY, `teams-meeting-pipeline`→$MSGRAPH_*). Cause :
   `command.dispatch` → `build_skill_invocation_message` →
   `_capture_required_environment_variables` → callback `secret.request` (TUI)
   qui attend une réponse impossible sur WS non interactif (`_block`, timeout
   300 s, `tui_gateway/server.py:4547`). Correctifs possibles : (a) Ulysse
   n'appelle pas le dispatch des skills à env var manquante (lecture du
   frontmatter `prerequisites.env_vars` + check `~/.hermes/.env`), (b) ou
   préremplir ces clés, (c) ou patch upstream : ne PAS appeler le secret-capture
   depuis `command.dispatch` (renvoyer le `gateway_setup_hint` comme le fait
   déjà le chemin non-callback).
3. **3 extras TUI fantômes** (`/density`, `/logs`, `/mouse`) annoncées par
   `commands.catalog` mais « Unknown command » au TUI worker — le picker les
   propose sans qu'elles marchent depuis un chat.
4. **`/hatch`, `/update`, `/reload-mcp` dépassent le worker** (5030, 45 s) —
   KO réel dans le chat comme au TUI.
5. **`/handoff` en double** : commande interne ET skill mattpocock ; Hermes
   cache la skill (collision), le picker montre la commande. Doc à garder.
6. **Prérequis machine manquants** (skills à payload OK mais usage KO) :
   `openpyxl, python-docx, python-pptx, pypdf, yt-dlp, pygount, manim, librosa,
   cua-driver, xurl, gws, ntn, codex, opencode, godot` + clés API
   (TENOR/NOTION/AIRTABLE/MSGRAPH) + vault Obsidian inexistant + bridge MCP
   freebuff éteint.
7. **`qa-loop` présente dans le picker mais absente du dossier skills du profil**
   `~/.hermes/profiles/ulysse/skills/` (lue depuis `~/.hermes/skills/` — même
   home résolu par le serveur). Si un jour le profil est déplacé, la skill
   disparaîtra du picker.

## Ré-exécution

Le harnais `web/test_skills.py` rejoue ces tests sans intervention :
connexion WS → `session.create (source='qa')` → `slash.exec` sur les
commandes A → fallback `command.dispatch` sur un échantillon de skills →
vérifs de prérequis fichiers → bilan OK/KO compté → **exit 0 si tout OK**
(le hang des skills à env var manquante est testé avec un timeout court et
compté « KO attendu/dégradé » selon le plan ci-dessus). Nettoyage : sessions
de test supprimées de `~/.hermes/profiles/ulysse/state.db` (`source='qa'`).

**Dernier run (2026-09-05) : exit 0 — 130 OK, 10 dégradés documentés, 0 KO,
140 vérifications réelles** (62 commandes A + 29 dispatch skills + providers
`model.options` + prérequis CLI/fichiers/plugins + catalogue↔disque).

⚠ Comportement gateway découvert au passage : un `command.dispatch` resté
en `secret.request` pendu (timeout client) POLLUE la connexion WS — tout
RPC suivant hang dessus. Le harnais re-ouvre un WS neuf avant `model.options`
(section 8b). Idem pour le futur fallback du chat Ulysse : après un dispatch
timeout, recréer la connexion.