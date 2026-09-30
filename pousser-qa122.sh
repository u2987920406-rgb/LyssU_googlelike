#!/usr/bin/env bash
# pousser-qa122.sh — issue #122 : pousser le fix vérifié + ouvrir la PR,
# en UNE commande. À lancer par Raf (l'agent QA n'a pas de canal d'écriture).
#
#   bash ~/projets/ulysse/pousser-qa122.sh
#
# Fichier d'exploitation NON suivi par git (pas dans web/, donc pas emporté
# par un git add web/). Il ne fait rien d'irréversible : push d'une branche
# qa/* + création de PR (jamais de merge, jamais master).
set -uo pipefail
REPO="u2987920406-rgb/LyssU_googlelike"
BRANCH="qa/issue-122-ready"
cd "$(dirname "$(readlink -f "$0")")" || exit 1

echo "=== 1. canal d'écriture GitHub ==="
if ! gh auth status >/dev/null 2>&1; then
  echo "gh NON authentifié (token 401)."
  # Un code d'appareil GitHub vit 900 s (15 min). Au-dela, le gh auth login
  # en cours ne peut PLUS aboutir : il faut le tuer avant d'en relancer un.
  stale=0
  while read -r pid etimes; do
    [ -z "${pid:-}" ] && continue
    if [ "$etimes" -gt 900 ]; then
      echo "→ gh auth login PID $pid : en cours depuis ${etimes}s (>900s) — code EXPIRÉ."
      echo "  tue-le :  kill $pid"
      stale=1
    else
      echo "→ gh auth login PID $pid tourne depuis ${etimes}s : termine le code sur"
      echo "  https://github.com/login/device puis relance ce script."
    fi
  done < <(ps -eo pid,etimes,args | grep "[g]h auth login" | awk '{print $1, $2}')
  if [ "$stale" = 1 ]; then
    echo "  puis relance un login NEUF :  gh auth login -h github.com"
    echo "  (HTTPS, code navigateur — saisis le code dans les 15 min)"
  fi
  echo "autre voie, sans navigateur :  export GH_TOKEN=ghp_...  puis relance ce script"
  echo "puis relance ce script :"
  echo "    bash ~/projets/ulysse/pousser-qa122.sh"
  exit 2
fi
echo "gh OK"

echo
echo "=== 2. branche locale à pousser ==="
if ! git rev-parse --verify --quiet "$BRANCH" >/dev/null; then
  echo "branche $BRANCH absente du clone — abandon"
  exit 3
fi
git --no-pager log --oneline -1 "$BRANCH"
echo "commits au-dessus de origin/master :"
git --no-pager log --oneline origin/master.."$BRANCH"

echo
echo "=== 3. push de la branche (jamais master) ==="
git push origin "$BRANCH:$BRANCH" || exit 4

echo
echo "=== 4. PR ==="
existing="$(gh pr list --repo "$REPO" --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null)"
if [ -n "${existing:-}" ]; then
  echo "PR déjà ouverte pour $BRANCH : #$existing — rien créé."
  gh pr view "$existing" --repo "$REPO" --json number,state,mergeable,headRefOid
else
  gh pr create --repo "$REPO" --base master --head "$BRANCH" \
    --title "Mobile : cibles tactiles >=44px (.validate, .ghost-btn) — Fixes #122" \
    --body "$(cat <<'BODY'
Fixes #122

## Repro (prouvée)
Sur `origin/master` (bd5214f), le test de cette branche injecté dans un worktree
`origin/master` **non patché** échoue **6/8** : `.validate` et `.ghost-btn` ont
`height: 40px` sur mobile. Côté CSS : `.validate{...height:40px}` et
`.ghost-btn{height:40px}` — **aucun override** dans `@media (max-width:720px)`,
alors que ce bloc promet ≥44px.

## Test
`web/test_tactile.py` réécrit : il calcule les règles CSS **effectives**
(cascade : ordre du fichier + media queries applicables) pour un viewport 360px
et exige **≥44px** sur **5 cibles** : `.composer .icon-btn`, `.validate`,
`.ghost-btn`, `.m-languette`, `.rail-top .icon-btn`.
Le `test_tactile.py` de master ne cherchait que la **présence** d'une règle par
regex : il passe 7/7 **avec le bug en place** (garde illusoire).

## Fix
`web/ulysse.css`, dans `@media (max-width:720px)` uniquement, +3 lignes :
`.validate,.ghost-btn{height:44px}` (+ commentaire). Rendu desktop intact
(`.validate`/`.ghost-btn` hors media query restent à 40px). Les 15
`web/apercu-*.html` sont resynchronisés (le CSS y est embarqué).

## Suite
`test_tactile` 8/8 · `test_serve` 254/254 · `test_personas` 127/127.
`test_page` et `test_reel` échouent **identiquement sur master non patché**
(serveur Ulysse absent, pile Hermes arrêtée) : environnement, pas régression.

Supersede #124 : sa branche `qa/issue-122-clean` ne couvre que **3 cibles**
(perte des gardes `.m-languette` / `.rail-top .icon-btn`) et son diff vs master
porte des dizaines de reverts → à fermer, pas à merger.
BODY
)"
fi

echo
echo "=== 5. relecture de l'état réel ==="
gh pr list --repo "$REPO" --head "$BRANCH" --json number,state,mergeable,headRefOid,url
