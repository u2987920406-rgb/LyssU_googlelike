# Architecture mémoire — analyse de l'installateur v2 (à transposer, PAS copier)

Source : Hermes-Installer-v2-2026-08-03 (installer.bat + memoire-kit + Coffre mémoire).
But : extraire UNIQUEMENT l'architecture des fichiers de mémoire + la gestion
de la mémoire APRÈS installation. NE PAS copier le design ni l'app Hermes-Hub.
Lu le 2026-08-07, filtre strict (architecture fichiers + mémoire).

══════════════════════════════════════════════════════════════
1. PRINCIPE QUI NOUS INTÉRESSE (et qu'on garde)
══════════════════════════════════════════════════════════════
Mémoire en DEUX COUCHES (idée de l'installateur v2, vérifiée par test à
l'aveugle le 02/08/2026) :
  • Couche 1 — mémoire NATIVE Hermès (state.db) : capture tout auto, forte sur
    la session en cours, mais FRAGILE (un reset vide state.db, recherche
    lexicale, chargement de session entière brûle le contexte).
  • Couche 2 — ARCHIVE DISQUE / Obsidian (Coffre mémoire) : survit à la purge, garant du
    rappel long terme. Mesure : rappel à 1 an 3/20 (natif) vs 17/20 (archive) ;
    survie reset 1/20 vs 18/20. LES DEUX COMPLÉMENTAIRES.
→ C'est exactement le « coffre-mémoire » qu'on a prévu pour Ulysse. On en garde
  le PRINCIPE, pas l'implémentation.

══════════════════════════════════════════════════════════════
2. FICHIERS DE MÉMOIRE POSÉS PAR L'INSTALLATEUR (dans $HERMES_HOME)
══════════════════════════════════════════════════════════════
Hermès lit ces fichiers à CHAQUE session (confirmé dans installer.bat) :
  $HERMES_HOME\SOUL.md              → personnalité de l'agent (copié en
                                      SOUL.default.md = « version d'origine »)
  $HERMES_HOME\memories\USER.md     → qui est l'utilisateur (9 questions saisies,
                                      sinon jetées). Copié en USER.default.md.
  $HERMES_HOME\memories\MEMORY.md    → RÈGLES DE TRAVAIL (JAMAIS / DÉTESTE / DOIT
                                      / PROJETS). Copié en MEMORY.default.md.
  (le bloc « MEMOIRE DURABLE » est AJOUTÉ à MEMORY.md)

NOTRE MANQUE ACTUEL (dit par kuchu) : on n'a PAS encore posé user.md / soul.md
/ MEMORY.md dans NOTRE installation réelle. À faire (voir §5).

══════════════════════════════════════════════════════════════
3. LES 6 FICHIERS STANDARD PAR PROJET (cité dans README + règles MEMORY)
══════════════════════════════════════════════════════════════
Créés à chaque projet (par Nouveau-Projet.ps1 → ecrire-projet.mjs) :
  .hermes.md   → règles du projet
  BRIEF.md      → carte d'identité du projet
  REPRISE.md    → avancement (ÉCRASÉ à chaque jalon)
  plan.md       → plan détaillé
  done.md       → historique terminé
  ADM.md        → décisions (CUMULATIF, jamais effacé)
→ C'est la liste que kuchu cherchait (au-delà de ADM/Reprise/Brief) :
  .hermes, BRIEF, REPRISE, plan, done, ADM.

══════════════════════════════════════════════════════════════
4. STRUCTURE DU VAULT OBSIDIAN (le coffre-mémoire)
══════════════════════════════════════════════════════════════
Workspace : Documents\Hermes-<Prenom>\Coffre mémoire\
  Coffre mémoire\Projets/     → une note par projet
  Coffre mémoire\Lessons/     → ce qu'on a appris (template Lesson.md)
  Coffre mémoire\Skills/      → compétences acquises (template Skill.md)
  Coffre mémoire\Decisions/   → décisions + raisons (template Decision.md)
  Coffre mémoire\Bugs/        → bugs + résolutions (template Bug.md)
  Coffre mémoire\Changelog/   → journal mensuel des changements IA (template Changelog.md)
  Coffre mémoire\Templates/    → modèles (Lesson/Skill/Decision/Bug/Project/Changelog)
  Coffre mémoire\.obsidian/    → config (app.json posé vide)
  Coffre mémoire\README.md    → explique la structure
Déclaré automatiquement dans %APPDATA%\obsidian\obsidian.json (plus de
« Open folder as coffre mémoire » à faire).

══════════════════════════════════════════════════════════════
5. LE PONT VERS OBSIDIAN (memoire-kit)
══════════════════════════════════════════════════════════════
memoire-kit/ (livré par l'installateur) contient :
  scripts/nourrir-coffre mémoire.py   → distille les MÉTA-FICHIERS d'un projet
    (REPRISE.md, MEMOIRE.md, ADM.md, DECISION.md) en notes Coffre mémoire. Idempotent.
    Modes : A manuel (`python scripts/nourrir-coffre mémoire.py --projet "<nom>"`) ou
    B automatique (Hermès lancé dès qu'il réécrit REPRISE.md).
  scripts/resume-sessions.py → si state.db encore là, repli de résumé.
  Resumes-Sessions/done.json, exclusions.json → anti-doublon de sessions.
  memoire/TEMPLATE-JOURNAL-THEMATIQUE.md → un journal par grand sujet.
  PARAMETRES-DECLENCHEUR.md → doc du pont (modes A/B).
  docs/SPEC-MEMOIRE-18-20.md, SPEC-TEST-AVEUGLE-MEMOIRE.md → specs/tests.

══════════════════════════════════════════════════════════════
6. CE QU'ON TRANSPOSE DANS ULYSSE (et CE QU'ON JETTE)
══════════════════════════════════════════════════════════════
ON GARDE (réutilisable, indépendant du moteur) :
  • Le PRINCIPE 2 couches (natif + archive Obsidian) → notre « coffre-mémoire ».
  • La LISTE des 6 fichiers standard par projet (§3) → à appliquer dans nos
    Projets (panel Projets de Ulysse).
  • La STRUCTURE du Coffre mémoire (§4) → coffre-mémoire qu'on va créer (dossier « Mère »).
  • L'existence d'un pont script → mais CHEZ NOUS il appellera `hermes serve`
    /api/* + écrit dans le Coffre mémoire, PAS le code du Hub.
  • Les fichiers user.md/soul.md/MEMORY.md (§2) → À CRÉER dans notre vrai
    $HERMES_HOME (on ne les a pas encore).
ON JETTE (la mauvaise voie) :
  • Tout le code Hermes-Hub (React/serveur Node qui imite Hermès) — on est un
    MASQUE, pas un clone.
  • Le design visuel, les icônes, le .bat complet.

══════════════════════════════════════════════════════════════
7. RÉSERVES / DIVERGENCES avec NOTRE projet
══════════════════════════════════════════════════════════════
• Le Hub utilise son PROPRE serveur Node (server/*.js) qui relaie vers `hermes`
  en CLI. Nous, on utilise `hermes serve :9119` (déjà en place). Pas de serveur
  maison à écrire.
• Le Hub stocke les souvenirs dans le Coffre mémoire via ses scripts ; nous, on passera
  par les endpoints serve (/api/learning/graph) + un pont léger optionnel.
• Auth : le v2 pose une clé via `hermes setup`. Nous, OAuth Portal par défaut
  (vérifié). À ne pas régresser.
• L'installateur v2 a un profil `clean` (test sans mémoire) — utile, à garder
  comme équivalent de notre mode Incognito/Discussion pur.
