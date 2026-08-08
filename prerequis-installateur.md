# Prérequis installateur — Projet Ulysse

Liste de tout ce qu'il faut poser sur le PC Windows de l'utilisateur final pour
que Ulysse fonctionne. À utiliser par l'installateur .bat. Mis à jour au fil de
la construction (on découvrira sûrement d'autres choses).

══════════════════════════════════════════════════════════════
A. RUNTIMES / OUTILS (from-scratch)
══════════════════════════════════════════════════════════════
1. Python 3.11+        → Hermès est en Python. Requis.
2. uv                  → gestionnaire d'env utilisé par Hermès (pip install uv
                        ou installateur Hermès). Requis.
3. Hermès Agent        → `curl -fsSL https://hermes-agent.nousresearch.com/
                        install.sh | bash` (poser le bon équivalent Windows).
                        Requis.
4. Node.js (LTS)       → pour serveur statique UI + éventuels MCP npx. Requis
                        (sauf si on sert en Python pur — à confirmer).
5. Playwright          → cité au départ. À CONFIRMER si nécessaire : Hermès a
                        déjà browser automation via Nous Portal. Playwright
                        servirait surtout si Ulysse doit piloter un navigateur
                        lui-même (tests UI, captures). À valider à l'étape
                        installateur.
   + navigateurs Playwright (chromium) si Playwright retenu.
6. Git                 → REQUIS (Hermès s'en sert pour projets/worktrees/review,
                        et le comportement « reprise » : au mot « reprise »,
                        Hermès inspecte le GIT relatif aux jalons -1 / +2).
                        Installer Git.Git via winget. Pas « recommandé » :
                        la reprise en dépend.
7. Serveur statique UI → soit Python `http.server` (si Python présent, simpler),
                        soit un micro-serveur Node. SON RÔLE : servir la page
                        Ulysse ET proxyfier /api/* → :9119 et /v1/* → :8645
                        (résout le CORS). Indispensable.

══════════════════════════════════════════════════════════════
B. COMPOSANTS ULYSSE (livrés par l'installateur)
══════════════════════════════════════════════════════════════
8. La web UI (dossier `app/` ci-dessous) → copiée dans le profil.
9. Le pack Obsidian (+ vault « Mère » + coffre-mémoire) → mémoire (plus tard).
10. Un raccourci bureau « Ulysse.bat » → lance proxy+gateway+serve invisibles
    puis ouvre le navigateur sur localhost:<ui-port>.

══════════════════════════════════════════════════════════════
C. AUTH / CONFIG (1re fois)
══════════════════════════════════════════════════════════════
11. Portal OAuth (device_code) PAR DÉFAUT : l'utilisateur ouvre son navigateur,
    confirme → aucune clé à coller. (vérifié actif 2026-08-07)
12. Clé API Nous en ALTERNATIVE : écrite dans ~/.hermes/.env si l'utilisateur en
    possède une.
13. webhook activé : config platforms.webhook (port 8644, secret généré).
14. (optionnel) Telegram / autres canaux : token fourni par l'utilisateur.

══════════════════════════════════════════════════════════════
D. À CONFIRMER / RÉSERVES
══════════════════════════════════════════════════════════════
• Playwright : nécessaire ou pas ? (voir A.5)
• Serveur statique : Python ou Node ? (dépend de A.4)
• Droits admin Windows pour installer Python/Node/systemd-like (Scheduled Task
  pour gateway auto-start au login) ?
• Taille du téléchargement (Python + Node + navigateurs Playwright) = lourd ;
  pertinent de proposer une install « minimale » (sans Playwright) puis « complète ».
• Antivirus Windows : les .bat qui lancent curl/installateurs peuvent déclencher
  des alertes — à tester, peut-être signature/whitelist nécessaire.
• Chemins MSYS vs Windows (python3 introuvable en shell MSYS) → l'installateur
  doit utiliser les bons chemins (voir rapport-etape-zero.md).

══════════════════════════════════════════════════════════════
E. PORTS UTILISÉS (à documenter pour l'utilisateur / firewall)
══════════════════════════════════════════════════════════════
• 8645  hermes proxy   (Discussion, chat pur)
• 8644  hermes gateway webhook (boutons précis)
• 9119  hermes serve   (Cowork, Studio, fichiers, mémoire, vocal, cron, MCP)
• <ui>  serveur statique UI (à choisir, ex. 8770)
Tous en loopback (127.0.0.1) par défaut = pas exposés au réseau.
