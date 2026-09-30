# Consultation de fichiers in-app : responsive mobile + défilement (fixes #126)

## Repro (mesurée, viewport 412×915 CSS px, Pixel 9 Pro XL : DPR 2.625, isMobile, hasTouch)

Banc : `web/ulysse.html` servi localement, `fetch`/`WebSocket` stubbés comme `web/test_page.js`, un VRAI livrable ouvert par le chemin réel `ouvrirFichier()` (`ulysse-artifact.js`), Chromium réel via playwright-core. Mesures dans `~/projets/ulysse/qa-artefacts/issue-126/` (`avant.json`, `tactile-html.json`, `mesures.json`).

1. Ouvrir un livrable HTML (`livrables/html/revolution-francaise.html`) dans le volet `.u-art-viewer`.
2. **Rien ne s'adapte à la largeur** : le corps du volet mesure 411 px mais son contenu déborde à **902 px** (`.u-art-raw`, lignes sans espace) — `html,body{overflow-x:hidden}` coupe le reste sans le rendre lisible.
3. **Le document ne se défile pas** : `elementFromPoint` renvoie `div#pDiscuter.panel` (position:absolute, inset:0, z-index:1) sur **tous** les points du document — le composeur flotte au milieu de l'écran (vision : barre « On commence par quoi...? » + pastilles `Manuel` / `dossier en attente` PAR-DESSUS le code). Après un swipe tactile réel de 1 200 puis 2 400 px (CDP `Input.dispatchTouchEvent`) **et** à la molette, `corps.scrollTop` reste à **0** alors que le conteneur a 8 252 px de course.
4. Contrôle du banc (obligatoire) : le même drag tactile fait défiler un div témoin nu (175 px) et la molette 2 855 px → le banc n'est pas muet, le blocage est bien dans l'app.

## Test (TDD)

`web/test_tactile.py` (déjà dans `cmd_test`), section « visualiseur de fichiers — issue #126 » : valeurs **effectives** de la cascade CSS (pas de test de présence — leçon #122) + contrôle que les copies embarquées portent le même fix.

- **Rouge avant fix** (rejoué contre `origin/master` non patché : `9 / 13`, exit 1) :
  - `#app.artifact-split .panelwrap` : aucune règle applicable (la surface de conversation qui volait les gestes) ;
  - `.u-art-body .u-art-raw` : aucune règle applicable ;
  - `.u-art-body .u-md` : `overflow-wrap` `None != 'anywhere'` ;
  - copies `apercu-*.html` sans le fix (15 fichiers).
- **Vert après fix** : `13 / 13`, exit 0.
- **La garde teste l'effet, pas une orthographe** : deux écritures valides masquent la surface (`.panelwrap` ou `.stage`, qui le contient) — le contrôle accepte les deux et exige `display:none`. Preuve d'injection : même fix réécrit avec `.stage` → `13 / 13` vert ; suppression du fix → rouge nommant le défaut.
- Couverture du test : 6 cibles uniques sur `origin/master` → **9** sur la branche (aucun contrôle supprimé ; seules les deux lignes de compteur ont été remplacées par un total exact).

## Fix (minimal, cause racine)

`web/ulysse.css` + les 15 `web/apercu-*.html` qui embarquent une copie du CSS (les deux bougent, sinon les aperçus mentent — leçon #122) :

1. `@media (max-width:560px)` : `#app.artifact-split .panelwrap{display:none}` — quand le volet prend tout l'écran, la surface de conversation s'efface (elle revient à la fermeture, `artifact-split` enlevé). C'est elle — `.panel` absolute au-dessus du volet statique — qui captait doigt et molette.
2. Le document se plie à la largeur du volet : `overflow-wrap:anywhere;word-break:break-word` sur `.u-art-body .u-art-raw`, `.u-md`, `.u-md pre`, `.u-md code` (+ `white-space:pre-wrap` sur les blocs de code, `max-width:100%` sur images/vidéos).

Aucun fichier hors périmètre, aucun refactor, aucun test supprimé.

## Preuve après (même banc, même appareil)

| mesure (412×915) | avant | après |
|---|---|---|
| corps du volet (largeur) | 411 px | 411 px |
| contenu du document (scrollWidth) | **902 px** (coupé) | **411 px** ✓ |
| markdown (scrollWidth) | 417 px | **411 px** ✓ |
| course verticale (scrollTop max) | 8 252 px | 8 292 px ✓ |
| **swipe tactile réel** (drag 2 400 px) | **0** (bloqué) | **550 px, puis 1 080 px** ✓ |
| molette | **0** (bloqué) | **2 680 px** ✓ |
| élément qui reçoit le doigt | `div#pDiscuter.panel` (composeur) | `pre.u-art-raw` dans `#artVBody.u-art-body` ✓ |

Captures mobile 412×915 :
- avant : `~/projets/ulysse/qa-artefacts/issue-126/avant-412.png` — verdict vision **FAIL** (composeur + pastilles flottant PAR-DESSUS le document).
- après : `~/projets/ulysse/qa-artefacts/issue-126/apres-412.png` — verdict vision **PASS** (contenu plié sans coupe à droite, aucun élément flottant, en-tête du volet visible).

## Suite de tests

`test_tactile.py` ✓ · `test_serve.py` ✓ · `test_personas.py` ✓ · `test_page.py` ✗ et `test_reel.py` ✗ **faute de pile lancée** (connexion refusée / dashboard absent) — rouges **identiques sur `origin/master` vierge** (worktree `--detach`), donc aucune régression : une fois la pile Ulysse/Hermes lancée, les relancer.

## Reste (hors périmètre de l'issue)

Le PDF s'affiche via `<embed>` : la course mesurée du conteneur reste courte (8 px) car le défilement page à page appartient au visualiseur PDF du navigateur, interne à l'`embed` — non mesurable depuis le DOM. Le geste y arrive désormais (le panneau ne le capte plus). Cas des `.xlsx`/`.pptx` : aperçu binaire impossible aujourd'hui, non couvert par les critères de l'issue.

## ⚠ Réconciliation avec le travail en cours (à lire avant merge)

Cette PR est coupée sur `origin/master` et ne touche **que** le périmètre de l'issue. Mais deux autres écritures de la même #126 coexistent sur la machine — **aucune n'est de cette PR**, je ne les ai pas touchées :

1. **Le clone de travail de Raf** (`~/projets/ulysse`, **non commité**, écrit aujourd'hui 25/09 à 19:37, commentaires signés « Raf 2026-09-25 ») : `#app.artifact-split .stage{display:none}` + `.u-art-viewer{width:100%}` + `.u-art-btn{width:44px;height:44px}` + hors issue (Établi overlay, `.u-duree`, `.u-statbar`).
2. **La branche locale `qa/issue-126-clean`** (worktree `~/projets/ulysse-qa126`, commit 19:40, **non poussée**) : même fix `.stage`, même `.u-art-btn` 44 px, + un test dédié `web/test_lecture_mobile.py` (173 lignes, cascade effective — bon principe, mais fichier **hors** `cmd_test`, donc hors suite standard).

### Comparaison de couverture (vérifiée sur le code, pas sur les dires)

| Critère de l'issue | **PR #128 (celle-ci)** | `qa/issue-126-clean` | clone de Raf |
|---|---|---|---|
| (1) le document s'adapte à la largeur (corps 902 → 411 px mesurés) | ✅ `overflow-wrap:anywhere` + `img/video{max-width:100%}` | ❌ **absent** (les 2 `overflow-wrap:anywhere` du fichier sont ceux de `master`, `.exp-h .t`) | ❌ **absent** (même compte qu'`origin/master`) |
| (2) le document se défile au doigt (calque qui vole les gestes) | ✅ `.panelwrap{display:none}` | ✅ `.stage{display:none}` | ✅ `.stage{display:none}` |
| Commandes du lecteur à ≥44 px (30 px aujourd'hui) | ❌ hors critères de l'issue | ✅ | ✅ |
| Test qui tourne dans `cmd_test` | ✅ `test_tactile.py` étendu (accepte les **deux** orthographes) | ⚠ fichier nouveau hors `cmd_test` | — pas de test |
| Copies `apercu-*.html` à jour | ✅ 15 | ✅ 15 | ✅ 15 |

**Recommandation de merge** : prendre **cette PR** (seule à couvrir les deux critères de l'issue, test inclus dans la suite), **et garder par-dessus** `.u-art-btn{width:44px;height:44px}` (et `test_lecture_mobile.py` si utile — alors à ajouter à `cmd_test`). Les deux règles de masquage se touchent dans le même bloc `@media` : conflit textuel probable, résolution = garder les deux côtés ou préférer `.stage` (il contient `.panelwrap`) — le test de cette PR accepte les deux, il ne rougira pas.
