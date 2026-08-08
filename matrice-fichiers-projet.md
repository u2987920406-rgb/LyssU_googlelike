# Matrice des 6 fichiers standard par projet — VALIDÉE (v2)

Décisions avec kuchu (2026-08-07). Aucune exécution : doc de référence.

PRINCIPE DIRECTEUR (kuchu) : le stockage est abondant, CE N'EST PAS le stockage
qui manque. Si l'architecture + l'indexation sont bonnes, on ne PRUNE PAS par
peur du volume. On garde, on indexe bien. (À ne jamais oublier.)

PRINCIPE STRUCTURE (kuchu) : Ulysse = le HERMES HOME du client une fois installé.
Donc la structure des fichiers dans Hermes Home EST celle qu'Ulysse présente.
AUCUNE copie parallèle, AUCUNE structure différenciée. Le Vault (Obsidian) est
une VUE du même Hermes Home, pas une structure à part.

══════════════════════════════════════════════════════════════
MATRICE
══════════════════════════════════════════════════════════════
Fichier      | Rôle                          | Écrit par                | Mode        | Coffre mémoire (vue Obsidian) ?
.hermes.md   | Règles du projet (bac sable)  | Hermès + toi            | semi-auto   | non (profil projet Hermes Home)
BRIEF.md     | Handoff 1-2 sessions préc.    | Hermès auto + toi (édit)| auto court  | Projets/ (brève)
REPRISE.md   | Avancement au jalon           | Hermès                  | AUTO        | non (lu par Studio, même Hermes Home)
plan.md      | Plan détaillé                 | Hermès 1re, TOI après   | manuel      | non (lu par Studio, même Hermes Home)
done.md      | Historique terminé            | Hermès                  | auto        | Changelog/
ADM.md       | Décisions + raisons (cumul.)  | Hermès                  | auto+cumul  | Decisions/

══════════════════════════════════════════════════════════════
DÉTAILS ACTÉS
══════════════════════════════════════════════════════════════
REPRISE.md  → AUTO, à automatiser EFFICACEMENT (déclencheur = fin de jalon /
              pause / clôture). Écrasé à chaque jalon.
  COMPORTEMENT « reprise » (souvenir tentative v2) : au mot « reprise », Hermès
  inspecte le GIT relatif aux jalons — regarde EN ARRIÈRE 1 jalon, EN AVANT
  2 jalons — pour reconstruire le contexte sans re-lire toute l'histoire.
  → À câbler comme déclencheur (Hermès lit le git du dossier projet).
plan.md     → PAS AUTO. 1re fois écrite par Hermès (il sait ce qu'il faut
              logiquement), ENSUTE IMPLÉMENTÉE/ÉDITÉE PAR TOI (le plan change).
              Semi-manuel.

══════════════════════════════════════════════════════════════
STUDIO (ex « Studio Live » — nom « Live » SUPPRIMÉ, confus)
══════════════════════════════════════════════════════════════
Studio = le PANNEAU Ulysse qui montre le plan/état du projet TEL QU'IL VIT dans
Hermes Home. Il LIT plan.md + l'état de session (hermes serve /api/sessions).
PAS de fichier « live » séparé, PAS de stockage parallèle : c'est le même
Hermes Home. « Live » enlevé car redondant avec « c'est le Hermes Home ».
→ Résout le doublon plan.md vs Studio : plan.md = le FICHIER (toi l'édites),
   Studio = le PANNEAU (vue live de ce fichier + exécution). Même source.

══════════════════════════════════════════════════════════════
CASES ENCORE À TRANCHER (à confirmer plus tard, sans exécuter)
══════════════════════════════════════════════════════════════
• .hermes.md : Hermès lit-il .hermes.md nativement au cwd d'un projet ?
  (kuchu : « je te laisse regarder » — tester quand on reprendra). Sinon Ulysse
  le passe via le profil projet ou une instruction.
• done.md / ADM.md : GARDER (cumulatifs). Risque dump → entrées datées/structurées.

══════════════════════════════════════════════════════════════
À FAIRE PLUS TARD (aucune exécution maintenant)
══════════════════════════════════════════════════════════════
1. Tester si Hermès lit .hermes.md natif au cwd.
2. Créer les vrais USER.md / SOUL.md / MEMORY.md dans le $HERMES_HOME courant.
3. Poser les 6 fichiers standard dans un projet test.
4. Câbler le déclencheur « reprise » (git relatif aux jalons).
