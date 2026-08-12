# RÉCAPITULATIF — Projet Ulysse (état au 2026-08-08)

══════════════════════════════════════════════════════════════
SESSION DU 2026-08-08 — AUDIT RÉEL, CORRECTIFS, PRODUIT, TESTS
══════════════════════════════════════════════════════════════
Tout est détaillé dans web/AUDIT-ENDPOINTS-REEL.md et web/RAPPORT-CODE-REVIEW.md.
Résumé de ce qui a changé :

1) LES ENDPOINTS ONT ÉTÉ VÉRIFIÉS CONTRE LE CODE SOURCE HERMÈS, pas devinés.
   Source lue : %LOCALAPPDATA%\hermes\hermes-agent (hermes_agent 0.20.0).
   Verdict : le câblage était majoritairement JUSTE (noms de méthodes RPC,
   noms d'événements, enveloppe JSON-RPC, clés de payload, formes REST).
   3 erreurs réelles trouvées :
     E1 — serve.py relayait l'Origin du navigateur ; le dashboard vérifie
          l'Origin du handshake WS et fermait en 4403. COWORK ÉTAIT MORT.
          (le rapport précédent classait ça « moyen »)
     E2 — la liste des webhooks était demandée au gateway :8644, qui n'a pas
          de GET /webhooks. Elle vit sur le dashboard : GET /api/webhooks.
     E3 — déclencher un webhook exige une signature HMAC ; le navigateur ne
          peut pas signer (le secret est masqué par l'API). serve.py signe.
   2 FAUX POSITIFS du rapport précédent, à NE PAS « corriger » :
     C5 — session.create renvoie bien session_id.
     C6 — approval.respond ne porte AUCUN request_id : résolution FIFO par
          session (tools/approval.py:2506). En inventer un = inventer une API.

2) BUGS ET SÉCURITÉ CORRIGÉS : C1-C8, M1-M14, S1-S9.
   + 2 failles que la relecture n'avait pas vues, trouvées par les tests :
     S10 — le dossier web/ était intégralement publié (GET /serve.py, dossiers
           cachés avec secrets HMAC). → liste blanche d'extensions.
     S11 — l'expurgation du jeton dans ulysse-config.js se contournait par
           /../ulysse-config.js. → chemin normalisé AVANT tout contrôle.
   RÈGLE POSÉE : la page ne détient plus AUCUN secret. serve.py injecte le
   jeton de session, signe les webhooks, et pose la clé du proxy.

3) LE PRODUIT EST POSÉ, À PARTIR DE LA MAQUETTE (elle EST le produit fini) :
     web/ulysse.css        — extrait VERBATIM du <style> de la maquette
     web/ulysse-icons.js   — table I + svg(), verbatim (41 icônes nommées)
     web/ulysse.html       — la coquille et les 10 panneaux de la maquette
     web/ulysse-app.js     — les panneaux reliés aux endpoints vérifiés
     web/ulysse-core.js    — la couche de liaison, partagée et testable
   Le menu (2 vitesses de survol, les coulisses, l'épingle) est repris tel quel.
   Ce qui n'est pas relié est AFFICHÉ comme non relié, jamais meublé de faux.

4) TESTS — tous verts, rejouables sans backend Hermès :
     python test_serve.py       43/43   frontières et relais
     python test_personas.py   100/100  10 personas x 2 scénarios
     node   test_page.js        54/54   la page dans un DOM réel (jsdom)
   web/faux_hermes.py rejoue le protocole RÉEL avec les MÊMES contrôles
   (jeton, Host, Origin du handshake, HMAC) : un test qui triche est refusé.

5) À FAIRE ENSUITE (rien de bloquant) :
   · [FAIT] un test contre le VRAI dashboard : web/banc_reel.js. Il monte la
     page PRISE SUR LE SERVEUR dans jsdom, avec le vrai fetch et le vrai
     WebSocket — aucun faux nulle part — et joue la demande d'accord de bout
     en bout (refuser / autoriser / le refus structurel de Plan). La suite du
     socle est la liste §16 de audit-fonctionnalites-ulysse.md ;
   · Terminal intégré (POST /api/pty existe, il faut un émulateur) ;
   · création de projet / coffre (projects.tree existe) ;
   · écriture des fichiers de profil (/api/fs/write-text existe) ;
   · vocal STT/TTS (/api/audio/* existent et sont atteignables).

6) ATTENTION — un ancien serve.py (version d'avant les correctifs) tournait
   encore sur 0.0.0.0:8080 pendant la session : c'est la faille S1 en vrai.
   Le fermer et relancer lancer_ulysse.bat.

──────────────────────────────────────────────────────────────
(ce qui suit est l'état au 2026-08-07, conservé)
──────────────────────────────────────────────────────────────

Document de reprise. Tout ce qui a été acté dans la session. À lire en début de
toute nouvelle session pour retrouver le fil sans re-parcourir les autres fichiers.

══════════════════════════════════════════════════════════════
0. NATURE DU PROJET
══════════════════════════════════════════════════════════════
Ulysse = MASQUE visuel (web UI locale) posé PAR-DESSUS Hermes Agent.
Rien à réinventer : on RELIE des points entrée/sortie aux éléments Hermès
existants. On n'écrit pas un nouvel agent, on enveloppe.
Une fois installé chez le client : Ulysse = son HERMES HOME. Même structure de
fichiers, Ulysse la reflète (AUCUNE copie parallèle). Le Coffre mémoire
(Obsidian) est une VUE du même Hermes Home.

══════════════════════════════════════════════════════════════
1. MOTEURS (3 engins lancés par l'installateur, « moteur invisible »)
══════════════════════════════════════════════════════════════
• hermes proxy start --provider nous --port 8645  → Discussion (chat pur)
• hermes gateway run (+ webhook activé) → boutons webhook :8644 + canaux
• hermes serve --port 9119 → backend complet (Cowork, Studio, fichiers,
  mémoire, vocal, cron, MCP, statut). AUCUN serveur maison à écrire.
Auth = Portal OAuth device_code PAR DÉFAUT (aucune clé à coller). Clé API = alt.
ÉTAPE ZÉRO RÉALISÉE : tout prouvé en vrai (proxy chat HY3, webhook agent répond,
serve expose /api/*). Rapport dans rapport-etape-zero.md.

══════════════════════════════════════════════════════════════
2. PERSONAS (10) — TOUS AU VERT
══════════════════════════════════════════════════════════════
P1 Camille→proxy · P2 Karim→serve+fichiers · P3 Sophie→webhook+cron ·
P4 Léa→incognito+projets isolés · P5 Marc→sessions+rôles · P6 Nadia→Discussion
pur+bascule Cowork · P7 Tom→MCP+Plan · P8 Inès→Telegram+gateway ·
P9 Hugo→installateur+OAuth · P10 Yuki→vocal STT/TTS+bilingue.
(personas-ulysse.md + matrice de couverture endpoints)

══════════════════════════════════════════════════════════════
3. PERMISSIONS (2 couches + 4 sous-modes)
══════════════════════════════════════════════════════════════
Couche 1 : Discussion (chat pur, outils OFF) vs Cowork (agent complet).
Couche 2 : 4 sous-modes au CHOIX de l'utilisateur (jamais imposés) =
  Auto / Accept-edit (≈ approvals.mode smart, défaut) / Manuel / Plan (workflow).

══════════════════════════════════════════════════════════════
4. VESTIAIRE = 6 RÔLES (pas des agents)
══════════════════════════════════════════════════════════════
Orchestrateur, Généraliste, Raisonnement, Codage, Appel d'outil, Garde-fou
(contient 3 fantômes). Cerveau = local / natif Hermès / API. Agents spécialisés
internes + skills + soul.md. Studio = panneau miroir du plan/état vivant dans
Hermes Home (PAS de fichier « live » séparé ; nom « Studio Live » REJETÉ).

══════════════════════════════════════════════════════════════
5. STRUCTURE FICHIERS — Hermes Home = Ulysse
══════════════════════════════════════════════════════════════
Mémoire lue à chaque session (dans $HERMES_HOME) :
  SOUL.md · memories/USER.md · memories/MEMORY.md  (+ .default = version origine)
6 fichiers standard PAR PROJET (matrice-fichiers-projet.md) :
  .hermes.md (semi-auto) · BRIEF.md (handoff 1-2 sessions, auto+édit) ·
  REPRISE.md (AUTO git jalons -1/+2) · plan.md (Hermès propose, TOI édite) ·
  done.md (auto→Changelog/) · ADM.md (auto+cumul→Decisions/).
Coffre mémoire (Obsidian) = vue du Hermes Home : Projets/Lessons/Skills/
Decisions/Bugs/Changelog/Templates. Déclaré auto dans obsidian.json.

══════════════════════════════════════════════════════════════
6. PRINCIPES DIRECTEURS (à ne jamais oublier)
══════════════════════════════════════════════════════════════
• Stockage abondant : CE N'EST PAS le stockage qui manque. Bonne architecture +
  bonne indexation ⇒ on GARDE, on n'efface pas par peur du volume.
• Vérifier la réalité avant de coder (étapes zéro réelles, pas de suppositions).
• Discussion amont, validation par étapes, dry-run personas avant d'implémenter.
• Tout modifiable, avec « marge ». Raccourcis « / » = slash commands Hermès.

══════════════════════════════════════════════════════════════
8. ISOLATION PAR PROJET CLIENT (règle finale, 2026-08-07)
══════════════════════════════════════════════════════════════
Chaque projet client dans Ulysse a SON PROPRE UNIVERS :
  • ses PROPRES règles (son .hermes.md, son ADM.md, son BRIEF/REPRISE/plan/done)
  • + les règles d'Ulysse (le socle, héritées du profil).
Les règles d'un projet ne fuient PAS vers un autre projet, ni vers le global.
Le Hermes Home = la racine ; chaque dossier projet est un bac à sable isolé.
→ À respecter quand on posera les 6 fichiers standard (matrice-fichiers-projet.md).

══════════════════════════════════════════════════════════════
9. SÉPARATION NETTE (ne pas mélanger)
══════════════════════════════════════════════════════════════
• Dossier « Projet Ulysse » (Bureau) = NOS DOCS de cadrage (isolé, ne pollue pas
  Hermes Home). Contient : maquette, personas, endpoints, plan, memory, glossaire,
  config, rapport-etape-zero, ressenti, architecture, prerequis, memoire-arch-v2,
  matrice-fichiers-projet, recapitulatif, _outils/.
• Hermes Home ($LOCALAPPDATA\hermes) = l'environnement RÉEL où vivent le profil
  kuchu (SOUL/USER/MEMORY), les projets clients, le Coffre mémoire.
  → À la prochaine session : poser le profil réel kuchu (récupéré de l'installateur
    v2) dans Hermes Home. PAS dans le dossier Projet Ulysse.
• ÉTAT VÉRIFIÉ (2026-08-07) : Hermes Home a SOUL.md (défaut générique, à remplacer
  par le tien), memories/USER.md + MEMORY.md (mes notes de session, à fusionner
  avec ton profil v2, pas écraser). config.yaml = standard propre.

══════════════════════════════════════════════════════════════
10. PROCHAINES ÉTAPES (quand on reprendra — AUCUNE exécution maintenant)
══════════════════════════════════════════════════════════════
A. Poser le vrai profil kuchu — FAIT (2026-08-07). Fusion non-destructive réalisée :
   • Sauvegardes .default posées (SOUL/USER/MEMORY en racine + memories/).
   • SOUL.md = aligné sur le profil Bureau (identique au défaut Hermès).
   • USER.md = GARDÉ enrichi (profil session sessions antérieures, plus complet
     que l'ébauche Bureau) — synchronisé racine ⇄ memories/ (zéro divergence).
   • MEMORY.md = FUSIONNÉ : règles de travail kuchu (Bureau) + notes session Ulysse.
     Synchronisé racine ⇄ memories/ (zéro divergence).
   • Aucune perte : rien n'a été écrasé aveuglément, tout est en .default.
   → État vérifié par diff : USER et MEMORY identiques entre racine et memories/.
B. Hermès lit-il nativement .hermes.md au cwd ? — RÉPONDU (2026-08-07) : OUI.
   Vérifié dans le CODE source (prompt_builder.py) :
   • _HERMES_MD_NAMES = (".hermes.md", "HERMES.md") ; découverte du plus proche,
     walk vers la racine git ; tips.py confirme le chargement + scan anti-injection.
   • Donc Projets/Ulysse/.hermes.md sera lu par Hermès quand le cwd = projet.
C. Déclencheur « reprise » (git jalons -1/+2) — FAIT + ANCRÉ (2026-08-07) :
   • git init isolé dans Projets/Ulysse/ (repo bac à sable).
   • reprise.py créé + TESTÉ en réel (ad-hoc verify PASS) : détecte repo git, liste
     jalons, reconstruit le contexte depuis REPRISE.md/plan.md/ADM.md (arrière 1 / avant 2).
   • 1er commit + tag « jalon-1 » posés (approuvé par kuchu) : commit 0888ba7
     "JALON: 1 - Structure projet Ulysse + declencheur reprise". Le git est désormais
     ancré ; reprise.py --check liste bien jalon-1.
   • Statut : DÉCLENCHEUR OPÉRATIONNEL. Règle kuchu respectée (commit fait sur accord).
D. Session A dev : Discussion pur via proxy + serveur statique (CORS) — FAIT + COMMITTÉ
   (JALON 2, commit 059e329, tag jalon-2) :
   • Livré dans web/ : discussion.html (page Material 3, fetch proxy :8645 direct,
     multi-tour, gestion 403/erreurs), serve.py (statique port 8080, vérifié HTTP
     200 body identique), lancer_discussion.bat (1 clic), test_page.py (test).
   • Infra PROUVÉE : proxy joint, CORS *, route /v1/chat/completions OK, logique
     403 correcte. Bout-en-bout TEXTE en attente (free NuPortal saturé = 403, payants
     404 crédits). Bloquant EXTERNE, pas notre code. Décision : pas de démo forcée,
     pas de réponse inventée.
E. Sessions B/C : Cowork (WS), Studio, webhooks, Vestiaire, installateur .bat — FAIT (2026-08-08).
   • Livré dans web/ : session-b.html (Cowork WS + Studio miroir + Sessions +
     Fichiers + Mémoire + Skills + Webhooks + Vestiaire 6 rôles, Material 3),
     serve.py (reverse-proxy /api/* -> dashboard 9123 + /webhooks -> gateway 8644,
     injection jeton loopback), ulysse-config.js (DASHBOARD_URL/proxy/token +
     WEBHOOK_URL), index.html (menu), lancer_ulysse.bat (1 clic : démarre
     dashboard + serve.py + ouvre le navigateur).
   • Auth loopback câblée : serve.py injecte X-Hermes-Session-Token (HTTP) et
     ?token= (WS) ; le proxy résout le bug CORS preflight prouvé en étape zéro.
   • Vérifié en réel (sans dashboard lancé) : routes statiques 200, /webhooks et
     /api/* renvoient 502 (backend down, routage OK, pas de crash), syntaxe JS OK.
   • À COMMITTER (en attente de l'accord kuchu) : jalon « Sessions B/C ».
   • Repli provider si free reste saturé : Claude Code (forfait kuchu) / Ollama GLM 5.2.

## ÉTAPE 2 — Structure 6 fichiers std + dossiers coffre (FAIT 2026-08-07)
- Dossiers coffre créés dans Hermes Home : Projets/ Lessons/ Skills/ Decisions/
  Bugs/ Changelog/ Templates/.
- Projet « Ulysse » créé : Projets/Ulysse/ avec les 6 fichiers std remplis du contenu
  réel du récap (validé par kuchu avant écriture, conforme à sa règle plan.md) :
  .hermes.md · BRIEF.md · REPRISE.md · plan.md · done.md · ADM.md.
- Vérifié : les 6 fichiers sont visibles via la junction Obsidian
  (Documents/Obsidian Vault/Hermes Home/Projets/Ulysse/).
- ADM.md / done.md datés/structurés (anti-dump). .hermes.md = règles bac à sable.
- RESTE (voir B/C/D/E ci-dessus) : test lecture .hermes.md natif, déclencheur reprise,
  dev A/B/C (proxy/serve statique, Cowork WS, Studio, webhooks, Vestiaire, .bat).
F. Coffre mémoire Obsidian — FAIT (2026-08-07), Option B choisie par kuchu :
   • Obsidian DEJA installé (raccourci bureau + Obsidian.exe + vault « Obsidian Vault »
     dans Documents, quasi-vide). Mon scan initial l'avait manqué — erreur corrigée.
   • Décision kuchu : GARDER le vault Documents comme coffre, et Y RELIER Hermes Home
     (pas de copie parallèle). Conforme à la loi « wire-don't-rebuild ».
   • Réalisé par JUNCTION (mklink /J) :
     %USERPROFILE%\Documents\Obsidian Vault\Hermes Home  ->  %LOCALAPPDATA%\hermes
     Vérifié : le lien montre le vrai contenu (auth.json, cache, MEMORY.md...).
   • app.json du vault = {} (aucune restriction d'emplacement) => Obsidian indexe le
     dossier-lien automatiquement. file-explorer actif => visible en sidebar.
   • PAS de doublon : une seule source de vérité (Hermes Home), vue depuis Obsidian.
   • RESTE À FAIRE (Étape 2) : créer les dossiers coffre (Projets/ Lessons/ Skills/
     Decisions/ Bugs/ Changelog/ Templates/) dans Hermes Home pour que la vue Obsidian
     soit structurée (sinon elle montre les fichiers techniques Hermès mélangés).

══════════════════════════════════════════════════════════════
9. ÉTAT DES FICHIERS DU DOSSIER « Projet Ulysse »
══════════════════════════════════════════════════════════════
maquette-ulysse-google-33.html · personas-ulysse.md · endpoints-ulysse.md ·
plan-ulysse.md · memory.md · glossaire-ulysse.md · config-ulysse.md ·
rapport-etape-zero.md · ressenti-projet.md · architecture-projet.md ·
prerequis-installateur.md · memoire-architecture-v2.md ·
matrice-fichiers-projet.md · récapitulatif.md (ceci).
