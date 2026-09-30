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

### Livrables (HTML / PDF / Excel / slides)

Dossier `livrables/` (`html/`, `pdf/`, `excel/`, `slides/` — 3 fichiers par
catégorie, thèmes différents). Toute génération — cron `qa-ulysse-livrables`
ou demande passée **depuis l'app Ulysse** — suit le contrat de
`livrables/INVENTAIRE.md` : pertinence, faits sourcés DANS le fichier,
design vérifié par capture + vision (2 essais puis `REJET`), puis ligne
`VALIDE <cat>/<fichier> | thème: … | design: … | sources: …` ajoutée à
l'INVENTAIRE (c'est elle que compte le monitor, donc le rapport final à Raf).
Excel/slides : `~/projets/ulysse/.venv-livrables/bin/python` (openpyxl,
python-pptx). PDF : depuis le HTML via Chrome headless, jamais d'API tierce.
