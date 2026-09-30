**25/09/2026 — Ulysse — Agent QA**
Issue **#126** — Consultation de fichiers in-app non responsive : impossible de défiler les documents (mobile)

**Verdict : PR #128 créée, prête à merger (clapet vert)**
https://github.com/u2987920406-rgb/LyssU_googlelike/pull/128

**Repro** (412×915 CSS px, Pixel 9 Pro XL, DPR 2.625, vrai Chromium + vrai livrable) :
1. Ouvrir un livrable HTML dans le volet `.u-art-viewer`.
2. Rien ne s'adapte : corps du volet = 411 px, contenu = **902 px** (lignes sans espace), coupées par `html,body{overflow-x:hidden}`.
3. Défilement bloqué : `.panel` (`absolute, inset:0, z-index:1`) restait AU-DESSUS du volet — composeur + pastilles flottaient PAR-DESSUS le document (vision), et après swipe tactile réel (1 200 / 2 400 px) comme à la molette, `scrollTop` restait à **0**.
4. Contrôle du banc : même swipe fait défiler un div témoin (175 px) → le banc n'est pas muet.

**Test** (TDD, `web/test_tactile.py`, valeurs effectives de la cascade — pas de test de présence) : rouge avant `9/13` (rejoué sur `origin/master` vierge), vert après `13/13`. Couverture : 6 cibles → 9 (rien de supprimé).

**Fix** minimal : `#app.artifact-split .panelwrap{display:none}` en ≤560px (la conversation s'efface quand le volet est plein écran) + pliage `overflow-wrap:anywhere` du contenu. `web/ulysse.css` + les **15 `apercu-*.html`** (copies embarquées, sinon les aperçus mentent) = 17 fichiers, périmètre strict.

**Après** (même banc) : contenu **411 px** ✓ (markdown 411 ✓), swipe tactile **0 → 550 → 1 080 px** ✓, molette **0 → 2 680 px** ✓, le doigt touche `pre.u-art-raw`/`embed` dans `#artVBody` au lieu du panneau ✓.
Captures : `~/projets/ulysse/qa-artefacts/issue-126/avant-412.png` (vision **FAIL**) → `apres-412.png` (vision **PASS**). Mesures : `mesures.json`. Schéma : `qa-artefacts/issue-126-jonction.excalidraw`.

**Suite** : `test_tactile` ✓ `test_serve` ✓ `test_personas` ✓ ; `test_page.py` et `test_reel.py` ✗ faute de pile lancée — rouges identiques sur master vierge, aucune régression.

**Reste** (hors critères de l'issue) : défilement interne du PDF via `<embed>` (propre au visualiseur du navigateur, non mesurable en DOM) ; `.xlsx`/`.pptx` sans aperçu binaire.

L'agent ne merge pas : merge à faire par Raf après relecture.
