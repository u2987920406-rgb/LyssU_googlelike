# Ulysse — règles projet

- Projet = MASQUE visuel posé par-dessus Hermes Agent. Rien à réinventer.
- Chaque composant UI = un endpoint Hermès (proxy 8645 / webhook 8644 / serve 9119).
- Studio = panneau miroir du plan vivant (plan.md + état session), PAS de fichier live séparé.
- 6 rôles Vestiaire, permissions 2 couches (Discussion/Cowork) + 4 sous-modes.
- Stockage abondant : on garde et indexe, jamais de prune par peur du volume.
- Isolation : les règles ici ne fuient pas vers les autres projets.

## Agent skills

### Issue tracker

Issues et specs vivent dans les GitHub Issues du repo (`u2987920406-rgb/LyssU_googlelike`), via le CLI `gh`. Voir `docs/agents/issue-tracker.md`.

### Triage labels

Cinq rôles canoniques, labels = noms : `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Voir `docs/agents/triage-labels.md`.

### Domain docs

Single-context : un `CONTEXT.md` + `docs/adr/` à la racine. Voir `docs/agents/domain.md`.
