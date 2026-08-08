# Carte des endpoints — Ulysse (masque visuel de Hermes Agent)

Principe : chaque composant UI = une ENTREE → un ENDPOINT Hermès → une SORTIE.
On ne réinvente rien : on relie à ce que Hermès sait DÉJÀ faire.

Repères d'endpoints réutilisés partout :
  [A] PROXY      → hermes proxy, POST /v1/chat/completions (chat)
  [B] WEBHOOK    → hermes webhook subscribe <nom> --prompt "..." (action précise)
  [C] PROFIL/FS  → écriture/lecture dans $HERMES_HOME (config, fichiers, gateway RPC)

Loi d'or : zéro friction pour l'utilisateur final ; tout modifiable ; rien à coder
from scratch, juste du câblage (point d'entrée / point de sortie).

══════════════════════════════════════════════════════════════
MENU (barre latérale)
══════════════════════════════════════════════════════════════
M1  Discuter (bulle)        [A] proxy /chat/completions
M2  Studio (schéma)         affichage local + flux gateway (miroir)
M3  Vestiaire (agents)      [C] gateway RPC / $HERMES_HOME
M4  Projets (coffre)        [C] dossier projet Hermès
M5  Réglages (engrenage)    [C] fichiers profil
M6  Cloche (notifs)         aucun endpoint (host.onEvent)
M7  Densité (épuré/dense)   aucun endpoint (affichage local)

══════════════════════════════════════════════════════════════
DISCUTER
══════════════════════════════════════════════════════════════
DIS-1  Composer               [A] proxy (outils OFF en mode Discussion)
DIS-2  Bouton Envoyer          [A] proxy (déclencheur DIS-1)
DIS-3  Fil (thread)           affichage local (retour DIS-1)
DIS-4  Toggle Chat/Atelier     aucun endpoint (bascule locale)
DIS-5  L'établi (fichiers)     [B/C] fichiers passés au proxy
DIS-6  Bouton « + » (fichiers) [C] ajout au contexte session
DIS-7  Micro (STT)            [A] transcription → proxy
DIS-8  Incognito              [A] proxy variante « sans mémoire »
DIS-9  Cartes ask / plan-card  [A] proxy (générées agent) ou local

══════════════════════════════════════════════════════════════
STUDIO (miroir temps réel du plan/script de l'agent)
══════════════════════════════════════════════════════════════
STU-1  Schéma (svg.graph)      [C] flux gateway (plan-update) — AUCUNE data fictive
STU-2  Carte de nœud           affichage (dans flux) + clic navigation locale
STU-3  Bouton « nact »          affichage local (fiche du flux)
STU-4  Lecteur (vReader)        affichage local (script détaillé de l'agent)
STU-5  Contrôles volet          aucun endpoint (bascule locale)
STU-6  Segmenté Schéma/Liste    aucun endpoint (vue locale)
STU-7  Légende                  aucun endpoint (indice visuel)

══════════════════════════════════════════════════════════════
VESTIAIRE = 6 RÔLES (pas des agents)
  Orchestrateur · Généraliste · Raisonnement · Codage · Appel d'outil · Garde-fou (+3 fantômes)
  Cerveau d'un rôle = local / natif Hermès (même que CLI, ex. hy3) / API
  Dans chaque rôle : agents spécialisés (skills + personnalité + soul.md)
══════════════════════════════════════════════════════════════
VES-1  Liste des 6 rôles        [C] gateway / $HERMES_HOME
VES-2  Choisir cerveau rôle     [C] profil (local/natif/API)
VES-3  Garde-fou + 3 fantômes    [C] profil
VES-4  Agents spécialisés       [C] profil (agents dans rôle)
VES-5  soul.md d'un agent       [C] écriture fichier profil
VES-6  Skills d'un agent        [C] profil (skills Hermès existants)

══════════════════════════════════════════════════════════════
PROJETS (chacun son coffre, chacun son bac à sable — rien ne déborde)
══════════════════════════════════════════════════════════════
PRO-1  Liste des projets        [C] gateway / dossiers projet
PRO-2  Créer un projet          [C] dossier + mémoire isolée
PRO-3  Coffre (mémoire)         [C] $HERMES_HOME/<projet>/ mémoire
PRO-4  Bac à sable (dossier)    [C] working dir de l'agent = ce dossier
PRO-5  Fermer un projet         [C] marqué clos (pas effacé)
PRO-6  Indexation coffre        [C] background (tag « à jour »)

══════════════════════════════════════════════════════════════
RÉGLAGES (les 3 fichiers + charte + mémoire + cerveau + diag)
══════════════════════════════════════════════════════════════
REG-1  user.md (Vous)           [C] $HERMES_HOME/user.md
REG-2  soul.md (caractère)      [C] $HERMES_HOME/soul.md
REG-3  MEMORY.md (à retenir)    [C] $HERMES_HOME/MEMORY.md
REG-4  ACQUIS.md (il retient)   [C] $HERMES_HOME/ACQUIS.md (+ cadenas)
REG-5  Niveau charte ess/met/comp [C] config Hermès
REG-6  Les 8 garde-fous         [C] reflété soul.md / MEMORY.md
REG-7  Mémoire 4 étages         [C] profil (architecture Hermès Hub)
REG-8  Choix cerveau GEN/REL    [C] config provider Hermès
REG-9  Réindexer coffre         [C] background
REG-10 Diagnostic / logs        [C] lecture $HERMES_HOME/logs
REG-11 Densité épuré/dense      aucun endpoint (local)
REG-12 Sonde fournisseur         [A/C] hermes doctor / health

══════════════════════════════════════════════════════════════
BLOCS TRANSVERSAUX (ajoutés en discussion)
══════════════════════════════════════════════════════════════
AUTO-1  Automatisations (cron)  [C] gateway RPC (cron.add) — placement ergo à définir
MCP-1   Connexions MCP/API      [C] config.yaml mcp_servers + restart gateway
PERM-1  Permissions 4 sous-modes [C] approvals.mode (off/smart/manual) + workflow plan
        (uniquement en COWORK ; choix utilisateur, jamais imposés)
DIST-1  Canaux distants (Tel…)  [C] gateway setup (platforms)
VOC-1   Voice STT/TTS           [A] STT→proxy + TTS réponse
SKILL-1 Skills / Curator        [C] profil (système skills Hermès existant)
MODE-1  Bascule Discussion/Cowork (dispo de partout)
        Discussion = proxy sans tools ; Cowork = agent complet
RAC-1   Raccourci « / » (skills, listes, approval) → slash commands Hermès + palette ⌘K
ERG-1   Marge config (tout modifiable) [C] reflété config Hermès

══════════════════════════════════════════════════════════════
RÉSERVES HONNÊTES (à vérifier en test réel)
══════════════════════════════════════════════════════════════
• CORS : un navigateur localhost qui fetch un autre port localhost peut être
  bloqué si le proxy Hermès n'envoie pas les bons en-têtes. Sécurité max =
  servir Ulysse depuis le même petit serveur et proxyfier /api/* vers Hermès.
• hermes proxy récupère-t-il bien la clé fournie par l'utilisateur dans .env ?
• Studio : le gateway expose-t-il un flux live (WebSocket/SSE) de l'état de
  session ? Sinon, mini-serveur relais host.onEvent → Ulysse en SSE/WS.
• Sous-mode PLAN : pas un flag natif, à câbler comme workflow « propose+attend ».
