# Glossaire — Projet Ulysse

Lexique partagé. Un terme = une définition. À tenir stable entre sessions et
entre interlocuteurs. Les termes Hermès natifs sont marqués [Hermès].

══════════════════════════════════════════════════════════════
A
══════════════════════════════════════════════════════════════
• Agent spécialisé — sous-composant D'UN rôle (pas un rôle). A des skills,
  une personnalité, et son propre soul.md. Ex. dans le rôle Codage : un agent
  « Python », un agent « Frontend ».
• Appel d'outil (rôle) — l'un des 6 rôles. Celui qui branche les MCP / API /
  plugins pour les autres. C'est lui qui a les « passe-droits » de connexion.
• Approvals mode [Hermès] — niveau de validation des actions sur l'ordi.
  smart (défaut), manual (toujours demander), off (tout laisse passer).
  En Ulysse : piloté par les 4 sous-modes en Cowork.

══════════════════════════════════════════════════════════════
B
══════════════════════════════════════════════════════════════
• Bac à sable — le dossier de travail d'un projet. L'agent n'écrit QUE là.
  Règle : « rien ne déborde ».
• Bouton « + » — dans Discuter (mode Atelier) : ajoute un fichier du PC au
  contexte de la session.

══════════════════════════════════════════════════════════════
C
══════════════════════════════════════════════════════════════
• Cerveau — le modèle qu'utilise un rôle. 3 modes : local (Ollama/LM Studio…),
  natif Hermès (même que le CLI, ex. hy3), API (connexion externe).
• Coffre (mémoire) — la mémoire d'un projet (ACQUIS / MEMORY). Vit dans le
  dossier du projet ; l'utilisateur peut l'ouvrir et le corriger.
• Coffre-mémoire — fichier Obsidian (dossier « Mère ») où tout ce qu'Ulysse
  apprend est retranscrit. (Brancher PLUS TARD.)
• Cowork — surface où l'agent peut toucher l'ordinateur (fichiers, terminal),
  comme le CLI Hermès. Permission requise. Voir Discussion.
• Cron [Hermès] — planificateur durable (hermes cron / cronjob). Pour les
  automatisations Ulysse (ex. résumé chaque lundi).

══════════════════════════════════════════════════════════════
D
══════════════════════════════════════════════════════════════
• Deux couches de permission — (1) Surface : Discussion vs Cowork.
  (2) 4 sous-modes (Auto/Accept-edit/Manuel/Plan), uniquement en Cowork.
• Discussion — surface « chat pur » : l'agent ne peut QUE parler, envoyer des
  liens, produire des plans. Aucune action sur l'ordi. Pour exécuter → Cowork.
• Dossier Mère — dossier racine Obsidian contenant le coffre-mémoire.
• Durable [Hermès] — qui survit au processus (cron, kanban). Opposé de « perdu
  si le parent meurt » (delegate en arrière-plan).

══════════════════════════════════════════════════════════════
E / F
══════════════════════════════════════════════════════════════
• Endpoint — point d'entrée Hermès relié à un composant UI (proxy, webhook,
  gateway RPC, fichier profil). Voir endpoints-ulysse.md.
• Établi — volet fichiers à droite du chat (mode Atelier). Liste ce qui est
  ouvert/disponible pour l'agent.
• Fantômes (les 3) — les 3 sous-composants du rôle Garde-fou. Leur rôle :
  filtrer / sécuriser. Contenus dans le Garde-fou.
• Flux (Studio) — le plan/script de l'agent, poussé en TEMPS RÉEL vers Studio.
  Studio est son MIROIR, jamais une source.

══════════════════════════════════════════════════════════════
G / H
══════════════════════════════════════════════════════════════
• Garde-fou (rôle) — l'un des 6 rôles. Contient les 3 fantômes. Veille aux
  lignes rouges et à la sécurité.
• Gateway [Hermès] — `hermes gateway run` : le moteur invisible qui tourne en
  arrière-plan pendant qu'Ulysse est ouvert.
• Généraliste (rôle) — l'un des 6 rôles. Cerveau « natif » par défaut (hy3).
• HY3 — le modèle Tencent utilisé en ce moment (free). Cerveau « natif »
  type dans Ulysse.

══════════════════════════════════════════════════════════════
I / J / K
══════════════════════════════════════════════════════════════
• Incognito — fil de chat SANS mémoire (ne lit ni n'écrit MEMORY/ACQUIS).
• Kanban [Hermès] — file de travail multi-agents durable (SQLite).
• MCP [Hermès] — Model Context Protocol. Client natif Hermès (config.yaml
  mcp_servers) : connecte des outils externes (fs, GitHub, API…).

══════════════════════════════════════════════════════════════
L / M
══════════════════════════════════════════════════════════════
• Masque — Ulysse EST un masque : une coquille visuelle par-dessus Hermès.
  Rien n'est réinventé.
• Miroir — Studio est le miroir du plan de l'agent (affichage, pas source).
• Modèle — voir Cerveau.
• Mémoire (4 étages) — vif / index / journaux / durable. Architecture Hermès
  Hub reprise dans Ulysse. Un tuyau, pas deux copies.
• Mère (dossier) — voir Dossier Mère.

══════════════════════════════════════════════════════════════
N / O
══════════════════════════════════════════════════════════════
• Natif Hermès — cerveau = le même moteur que le CLI (ex. hy3). Aucun plugin.
• Obsidian — app de notes (Markdown) utilisée pour la mémoire d'Ulysse
  (coffre-mémoire). Pack dans l'installateur, brancher plus tard.
• Orchestrateur (rôle) — l'un des 6 rôles. Coordinate les autres.

══════════════════════════════════════════════════════════════
P / Q
══════════════════════════════════════════════════════════════
• Persona — profil de test fictif (P1–P10). Voir personas-ulysse.md.
• Proxy [Hermès] — `hermes proxy` : API locale OpenAI-compatible sur localhost.
  Ulysse l'appelle via POST /v1/chat/completions. Pas de clé dans l'UI.
• Profil $HERMES_HOME — dossier de config/utilisateur Hermès (~/.hermes/).
  Ulysse y écrit les 3 fichiers, les rôles, les projets.

══════════════════════════════════════════════════════════════
R
══════════════════════════════════════════════════════════════
• Raisonnement (rôle) — l'un des 6 rôles. Cerveau orienté réflexion/logique.
• Rôle — les 6 grandeurs de niveau 1 (Orchestrateur, Généraliste, Raisonnement,
  Codage, Appel d'outil, Garde-fou). PAS des agents.
• Règle « un tuyau » — les étages de mémoire ne contiennent jamais la même
  chose (pas de copie divergente).

══════════════════════════════════════════════════════════════
S
══════════════════════════════════════════════════════════════
• Slash command [Hermès] — commandes type /skin, /cron. Ulysse expose « / »
  pour les skills/listes/approval en reprenant CELLES-CI (pas d'invention).
• Skill [Hermès] — procédure réutilisable apprise/chargée. Attachée aux agents
  spécialisés. Système Curator existant pour le cycle de vie.
• Soul.md — fichier de caractère (de l'agent ou d'Ulysse). Chaque agent
  spécialisé a le sien.
• Studio — panneau schéma + lecteur = MIROIR temps réel du plan de l'agent.
• Sous-mode — l'un des 4 (Auto/Accept-edit/Manuel/Plan), en Cowork.

══════════════════════════════════════════════════════════════
T / U / V / W / X / Y / Z
══════════════════════════════════════════════════════════════
• Telegram [Hermès] — canal distant. Ulysse peut être piloté depuis Telegram
  (gateway setup). L'utilisateur n'ouvre pas l'UI.
• User.md — fichier « qui je suis » (5 questions + réglages). L'utilisateur
  l'écrit ; Hermès l'utilise.
• Vestiaire — panneau des 6 rôles + agents spécialisés.
• Webhook [Hermès] — `hermes webhook subscribe` : 1 URL dédiée par bouton/
  action précise d'Ulysse.
• Zéro friction — loi d'or : l'utilisateur final ne doit ressentir AUCUNE
  friction. Ulysse = câblage, pas gros code.
