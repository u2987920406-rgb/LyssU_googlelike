# Ulysse — BRIEF

## En une phrase
Masque **web UI** (local, loopback) posé par-dessus **Hermes Agent** : Ulysse
n'installe rien dans Hermes, il l'enveloppe (un masque visuel + un plugin
d'approbation). Pour un utilisateur non-technique, c'est un portail « sans
aucune commande à taper ».

## Ce que c'est / ce que ce n'est pas
- C'est : une enveloppe d'interface sur une IA qui tourne en dessous.
- Ce n'est PAS : une nouvelle IA, ni une réécriture d'Hermes, ni une app
  autonome (ne fonctionne pas sans Hermes + Python/uv/Node installés).

## Phase actuelle
**Développement terminé — jalon 4 committé (2026-08-09). Boucle de peaufinage
automatique opérationnelle (2026-08-31).**
- Le dépôt vit dans `~/projets/ulysse` (remote GitHub `LyssU_googlelike`).
- Produit : `web/` (ulysse.html + css/js + serve.py), 10 panneaux branchés sur
  les endpoints réels d'Hermes, terminal intégré (`/api/pty`), dictée,
  écriture mémoire avec versions, Projets complet.
- 4 suites de tests (620 vérifications). Maquette de référence : la **33**.

## Ce qui reste
1. **Partie « human use » et **beta test**** — la seule partie qu'aucune boucle
   automatique ne remplace : faire sentir l'app à de vrais utilisateurs,
   recueillir du retour réel, ajuster l'UX. Les retours beta de Raf sur Discord
   deviennent des issues étiquetées `beta-test`.
2. **Peaufinage automatique** — **opérationnel** : boucle
   Hermes ⇄ GitHub ⇄ Claude Code. Hermes crée des issues sur le repo, Claude
   Code les répare et pousse à GitHub, Hermes vérifie (Phase C). Garde-fous :
   tests verts avant push, revue, CI (`gh pr checks`). Bilan au 2026-08-31 :
   **10 issues réparées, 10 PRs mergées**, file d'issues vide. Méthode détaillée
   dans `BOUCLE-PEAUFINAGE-AUTO.md`. Ne couvre pas le retour humain (voir 1).

## Stack portes / ports
| Port  | Rôle                          |
|-------|-------------------------------|
| 8644  | gateway Hermes (webhooks)     |
| 8645  | proxy Hermes (chat OpenAI-compat) |
| 9119  | dashboard Hermes (défaut)     |
| 9123  | dashboard Ulysse              |
| 8080  | serveur statique UI Ulysse    |
Tous en loopback (127.0.0.1), rien d'exposé au réseau.

## Voir aussi
- `REPRISE.md` — avancement détaillé + règles de reprise
- `ADM.md` — décisions (ne jamais effacer)
- `done.md` — jalons terminés
- `README.md` — install / lancement / ports
- `web/CONTRAT-INTERFACE.md` — passe de main design ⇄ code
- Règles projet : `.hermes.md`
