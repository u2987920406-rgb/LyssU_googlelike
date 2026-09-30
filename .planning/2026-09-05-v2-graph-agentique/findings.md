# Findings — v2 graph agentique

## Contexte v2 (brainstorm 2026-09-04, fil Discord #ulysse)

Vision consolidée validée par Raf :
- **Un seul chantier** : navigation progressive (graph + coulisses = un sujet).
- **Deux publics** : novice (surface = « juste un chatbot ») + avancé
  (échappatoire toujours accessible — les DEUX chemins).
- **Le geste central** : bascule discussion → projet avec contexte emporté
  (comme transfert-projet Discord).
- **Automatisations** : vivent dans les projets ; Ulysse AFFICHE via le
  dashboard (`GET /api/crons` + pause/resume/run déjà exposés) — on relie,
  on ne réinvente pas.
- **Graph agentique** : arbre de délégation VIVANT + notation par critères
  d'acceptation (AC en amont), maillon faible visible sans stopper la boucle.
- **Socle** : instrumenter la délégation pour l'état vivant + historique/nœud.

## Données réelles (vérifié le 2026-09-05 sur la machine)

- `~/.hermes/state.db` (profil principal) : table **`async_delegations`**,
  14 lignes, toutes `completed`. Colonnes utiles : `delegation_id`,
  `origin_session`, `parent_session_id`, `state`, `dispatched_at`,
  `completed_at`, `event_json` (type async_delegation : goal, goals, results,
  is_batch, role, status), `task_json`.
- Table **`messages`** : 91 lignes `tool_name='delegate_task'` — le contenu
  (`content`) est un JSON `{status: dispatched, mode, count, delegation_id,
  goals[]}`. Le lien parent→enfant existe : `origin_session` /
  `parent_session_id` pointent vers la session qui délègue.
- Le profil ulysse (`~/.hermes/profiles/ulysse/state.db`) a la même table,
  0 ligne pour l'instant.
- Attention : `sqlite3` CLI absent sur BMAX → passer par Python sqlite3.

## Contraintes repo (CONTRAT-INTERFACE.md + development.md)

- Changez le visuel librement ; ne JAMAIS renommer/supprimer les ids et
  data-* du contrat.
- Suites : test_page.js (jsdom, ~647 checks, bloc « degraded paths » EN
  DERNIER dans main()), test_serve.py, test_personas.py, test_tactile.py.
- Toute modif CSS → `python3 resync_apercus.py` (15 aperçus recopient la
  feuille).
- `serve.PORT == verif_ports.UI_PORT` (8090).
- Nouvelles routes serve.py : pattern = `if self.route() == "/ulysse/x":
  if self.guard(): return; self.methode()` dans do_GET/do_POST. guard() fait
  Host/Origin anti-DNS-rebinding.
- État serveur : fichiers dans le Hermes home (jamais localStorage), routes
  GET/POST avec whitelist de clés.
- Navigation : PANELS n=2 = Discuter/Projets/Livrables, n=3 = coulisses
  (test qui épingle l'ordre n=2).
- Mécanique (tool cards, réflexion) cachée par défaut derrière
  `montrerMecanique` — tout nouvel affichage d'interne doit passer derrière
  la même porte.
- STU-1 : rien de simulé, jamais un contrôle qui n'agit pas.
- Raf valide depuis le téléphone : lien en clair après chaque modif ;
  « place X sous/à côté de Y » = AJOUTER.

## Décisions

- Jalon 1 = graph agentique d'abord (le plus risqué : donne la mesure du réel
  avant de retoucher la nav).
- serve.py lit `~/.hermes/state.db` en READ-ONLY (mode ro sqlite), ne
  modifie rien ; pas d'écriture dans le Hermes home pour le graph.
- Panneau Graph en coulisses (n=3) — cohérent avec « surface simple » : un
  novice ne le voit pas, l'avancé l'a en deux taps.
- v2.0 du panneau : lecture seule (pas de run/stop nœud) — Raf n'a pas
  demandé le contrôle, et le contrôle délégué passe déjà par Discord/Hermès.