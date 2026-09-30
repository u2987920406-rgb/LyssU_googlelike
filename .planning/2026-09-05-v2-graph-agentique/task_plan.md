# Task Plan: Ulysse v2 — navigation progressive + graph agentique

## Goal

V2 d'Ulysse sur branche `v2/graph-agentique` : 1) un graph agentique vivant qui
montre l'arbre réel de délégation (depuis `async_delegations` du state.db, lu
par serve.py), 2) la navigation progressive novice→expert (surface « simple
chat » + échappatoire avancée) posée sur la v1 existante.

## Next Step

Jalon 1 : route serve.py `GET /ulysse/graph` (lecture state.db, JSON arbre) +
TDD (test_serve.py) — puis panneau JS.

## Current Phase

Phase 3 — Jalon 1 (graph agentique : socle données + panneau)

## Phases

### Phase 1: Requirements & Discovery
- [x] Contexte v2 du brainstorm 2026-09-04 retrouvé (session_search)
- [x] Vérifié : données réelles dispo (`async_delegations` : 14 délégations,
      task_json/event_json, goals+results ; 91 messages delegate_task)
- [x] Contraintes repo identifiées : CONTRAT-INTERFACE (ids/data-*), suites
      test_page/test_serve/test_personas, resync_apercus si CSS, port 8090
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Décision : jalon 1 = graph agentique (risque le plus élevé d'abord —
      donne la mesure réelle avant de retoucher la nav), jalon 2 = nav v2
- [x] Architecture : serve.py lit `~/.hermes/state.db` en lecture seule →
      `/ulysse/graph` JSON → panneau `#Graph` (niveau 3, coulisses)
- [x] Frontière STU-1 : rien de simulé ; si la DB est vide → état vide affiché
- **Status:** complete

### Phase 3: Implementation
- [x] J1a — serve.py : `GET /ulysse/graph` (guard, read-only, arbre d'appels
      delegate_task depuis messages + async_delegations) + tests TDD
- [x] J1b — Panneau Graph (PANELS n=3, id "Graph", LIFE.onEnter=drawGraph),
      rendu de l'arbre vivant (parent → enfants, état par nœud)
- [x] J1c — Historique par nœud (tap nœud → détail délégation : but, état,
      durée, résultat) — déplié au chef de file (data-gd), 669/669
- [ ] J2a — Navigation v2 : audit de l'existant (rail/coulisses/drawer) vs la
      vision « surface simple + échappatoire »
- [ ] J2b — Ajustements nav v2 validés par Raf (mobile-first, AC par item)
- **Status:** in_progress

### Phase 4: Testing & Verification
- [ ] Suites vertes : test_page.js / test_serve.py / test_personas.py /
      test_tactile.py
- [ ] Vérif live : route /ulysse/graph sur le serveur 8090 (curl 200 + JSON
      réel), hostile Host → 403
- [ ] Capture mobile émulée (412px) du panneau Graph
- [ ] Aperçus resynchronisés si CSS touché (resync_apercus.py)
- **Status:** pending

## Notes

- Le graph lit le state.db du profil **principal** (les délégations du chat
  Ulysse passent par le TUI gateway → même state.db que le dashboard ; le
  profil ulysse n'a que 0 async_delegations pour l'instant). À re-vérifier
  quand le chat Ulysse délègue réellement.
- Règle Raf : jamais de modèle épinglé en dur ; le panneau décrit, il ne
  pilote pas (pas de run/stop sur les nœuds en v2.0).
- Contrat UI : noms d'ids stables (#pGraph, #gArbre…), data-* listés dans
  CONTRAT-INTERFACE si réutilisés.
- Suite au fil Discord : Raf valide à chaque jalon depuis le téléphone (lien
  direct en clair après chaque modif).