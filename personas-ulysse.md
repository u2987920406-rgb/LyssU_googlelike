# Personas de test — Ulysse (masque visuel de Hermes Agent)

But : profils fictifs servant de cibles de test au fur et à mesure de la
construction. Chaque persona exerce des surfaces/endpoints précis de la
carte (Discussion, Cowork, Studio, Vestiaire, Projets, Réglages, MCP,
canaux distants, vocal, mémoire Obsidian, onboarding).

On n'invente rien : ces parcours valident ce que Hermès sait DÉJÀ faire.

────────────────────────────────────────
# LES 3 PERSONAS DE BASE (posés en discussion)
────────────────────────────────────────

## P1 — Camille, potière (grand public, zéro technique)
But : devis + rangement des commandes.
Endpoints exercés : Réglages user.md [C], Discuter proxy [A], Projets [C].
Friction attendue : ZÉRO. Ne sait pas qu'Hermès tourne.

## P2 — Karim, développeur (technique, veut coder)
But : écrire + tester une API.
Endpoints exercés : Vestiaire rôle Codage (natif hy3), Discuter proxy avec
terminal, PERM-1 (approvals smart), Studio miroir [C flux], DIST-1 Telegram.

## P3 — Sophie, automate (veut que ça se passe seul)
But : résumé de veille chaque lundi.
Endpoints exercés : AUTO-1 cron.add [C], coffre mémoire, lecture passive.

────────────────────────────────────────
# LES 7 PERSONAS COMPLÉMENTAIRES (tests ciblés)
────────────────────────────────────────

## P4 — Léa, étudiante en recherche
But : garder ses notes de cours, faire des synthèses, ne pas mélanger
      ses matières.
Endpoints exercés :
  · Réglages user.md + niveaux de charte (ess/met/comp) [C]
  · Incognito (fil sans mémoire) [A variante]
  · Projets = un dossier par matière, mémoire isolée [C]
  · Mémoire Obsidian (coffre-mémoire dossier Mère) — test futur
Test clé : vérifier que la mémoire NE déborde PAS d'un projet à l'autre.

## P5 — Marc, manager d'équipe
But : déléguer des tâches à plusieurs "personnalités" et voir l'avancement.
Endpoints exercés :
  · Vestiaire = 6 rôles + agents spécialisés (skills + soul.md) [C]
  · Studio = miroir temps réel du plan (schéma + lecteur) [C flux]
  · DIST-1 = piloter depuis Telegram / tenir l'équipe au courant
  · RAC-1 = slash « / » pour lister les agents en cours
Test clé : le schéma Studio reflète VRAIMENT l'état de l'agent (pas de faux).

## P6 — Nadia, rédactrice / écrivaine
But : brainstormer, faire des plans de chapitres, ouvrir ses fichiers.
Endpoints exercés :
  · Discuter en mode DISCUSSION pur (chat, liens, plans, AUCUN outil ordi)
  · L'établi / Atelier (fichiers ouverts à droite) [B/C]
  · Bouton « + » (ajouter fichiers) [C]
  · Projets (son dossier « Romans »)
Test clé : en mode Discussion, AUCUNE action sur l'ordi n'est possible
          (basculer en Cowork est obligatoire pour toucher un fichier).

## P7 — Tom, analyste de données
But : connecter une API métier et générer des rapports.
Endpoints exercés :
  · MCP-1 = Connexions (serveur MCP distant / API, clé dans env) [C]
  · Vestiaire rôle Appel d'outil (celui qui branche les MCP/API)
  · Codage (scripts), PERM-1 sous-mode Plan (propose avant d'exécuter)
  · Studio miroir du pipeline
Test clé : la clé API du MCP ne fuit PAS dans les logs (redaction Hermès).

## P8 — Inès, utilisatrice Telegram-first
But : poser des questions depuis son téléphone, sans jamais ouvrir l'UI.
Endpoints exercés :
  · DIST-1 = canal Telegram branché (gateway setup)
  · Discuter (depuis Telegram) proxy [A]
  · RAC-1 impossible sur tel → vérifier que les slash commands marchent
    via Telegram nativement (Hermès gère déjà)
Test clé : zéro friction — elle n'ouvre JAMAIS la web UI et pourtant Ulysse
          travaille (gateway tourne en arrière-plan sur son PC).

## P9 — Hugo, curieux non-technique (onboarding)
But : installer et utiliser sans rien comprendre à l'informatique.
Endpoints exercés :
  · Installateur .bat from-scratch (Python/uv/Node/Playwright/Hermes/webui)
  · Premier lancement : demande UNE fois la clé API Nous → .env
  · Raccourci bureau « Ulysse » → gateway+proxy invisibles + navigateur
Test clé : parcours le plus friction-less possible ; aucune ligne de commande
          visible ; tout le reste est masqué.

## P10 — Yuki, chercheuse bilingue (vocal + langue)
But : dicter ses idées, lire les réponses à voix haute, en FR/EN.
Endpoints exercés :
  · VOC-1 = micro (STT) → proxy ; TTS pour la réponse
  · Réglages langue (FR/EN/Les deux) [C]
  · Incognito pour ses notes sensibles [A variante]
Test clé : le vocal ne casse pas le flux Discussion (reste du chat pur).

────────────────────────────────────────
# MATRICE DE COUVERTURE (quel persona teste quoi)
────────────────────────────────────────
Surface Ulysse        | Personas
Discussion (chat pur) | P1 P2 P3 P6 P8 P9 P10
Cowork + permissions  | P2 P5 P7
Studio (miroir)       | P2 P5 P7
Vestiaire (rôles)     | P2 P5 P7
Projets (isolés)      | P1 P4 P6
Réglages/user.md      | P1 P4
MCP/Connexions/API    | P7
Canaux distants       | P2 P5 P8
Vocal STT/TTS         | P10
Mémoire Obsidian      | P4 (futur)
Onboarding/install    | P9
Incognito             | P4 P10
Raccourcis « / »      | P5 P8

Tous les blocs de la carte des endpoints sont couverts par au moins un persona.
