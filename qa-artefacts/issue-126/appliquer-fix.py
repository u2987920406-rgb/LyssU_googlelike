#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Applique le fix issue #126 a web/ulysse.css ET aux copies embarquees
web/apercu-*.html (les apercus portent une copie du CSS : un fix qui ne bouge
que ulysse.css laisse les apercus mentir — piege vu issue #122).

Trois remplacements textuels EXACTS, comptes verifie fichier par fichier.
"""
import os
import sys

DIR = "/home/raf/projets/ulysse-qa126-wt/web"

OLD_A = """\
.u-art-raw{font-family:var(--font-mono,ui-monospace,Menlo,monospace);font-size:12.5px;
  white-space:pre-wrap;color:var(--text,#1F1F1F);line-height:1.6;background:var(--surface,#F0F4F9);
  border-radius:10px;padding:14px}"""

NEW_A = """\
.u-art-raw{font-family:var(--font-mono,ui-monospace,Menlo,monospace);font-size:12.5px;
  white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;
  color:var(--text,#1F1F1F);line-height:1.6;background:var(--surface,#F0F4F9);
  border-radius:10px;padding:14px}"""

OLD_B = """\
/* reutilise .u-md pour le rendu markdown (tableaux, listes, gras) */
.u-art-body .u-md{padding:0}"""

NEW_B = """\
/* reutilise .u-md pour le rendu markdown (tableaux, listes, gras) */
.u-art-body .u-md{padding:0}
/* ⚠ ISSUE #126 — LE DOCUMENT S'ADAPTE À LA LARGEUR DU VOLET, QUOI QU'IL
   CONTIENNE. Une ligne sans espace (URL, base64, sélecteur, code) ne se plie
   pas : elle poussait le corps à 902 px dans un volet de 411 px, et
   `html,body{overflow-x:hidden}` (bloc <=720px) COUPAIT le reste sans le
   rendre lisible — « rien ne s'adapte à la largeur mobile ». On plie les mots
   au lieu de couper la ligne ; les images et vidéos suivent la largeur. */
.u-art-body .u-art-raw,.u-art-body .u-md,.u-art-body .u-md pre,
.u-art-body .u-md code{overflow-wrap:anywhere;word-break:break-word}
.u-art-body .u-md pre{white-space:pre-wrap}
.u-art-body img,.u-art-body video{max-width:100%;height:auto}"""

OLD_C = """\
@media (max-width:560px){
  #app.artifact-split .u-art-viewer{width:100%}
  #app.artifact-split .work{display:none}
}"""

NEW_C = """\
@media (max-width:560px){
  #app.artifact-split .u-art-viewer{width:100%}
  #app.artifact-split .work{display:none}
  /* ⚠ ISSUE #126 — LA SURFACE DE CONVERSATION NE DOIT PLUS COUVRIR LE VOLET.
     Le volet prend tout l'écran ici, mais `.panel` (position:absolute,
     inset:0, z-index:1) restait AU-DESSUS de lui (le volet est statique, sans
     z-index) : le composeur flottait au milieu du document, et le panneau
     volait TOUS les gestes — doigt comme molette — donc « impossible de
     défiler le document vers le bas » (mesure : scrollTop restait à 0 après
     un swipe de 2 400 px, alors que le conteneur avait 8 252 px de course).
     La conversation s'efface quand le volet est plein écran ; elle revient à
     la fermeture (artifact-split enlevé). */
  #app.artifact-split .panelwrap{display:none}
}"""

REMPLACEMENTS = [("A .u-art-raw plie", OLD_A, NEW_A),
                 ("B contenu plie", OLD_B, NEW_B),
                 ("C panelwrap masque", OLD_C, NEW_C)]


def main():
    fichiers = [os.path.join(DIR, "ulysse.css")] + [
        os.path.join(DIR, f) for f in sorted(os.listdir(DIR))
        if f.startswith("apercu-") and f.endswith(".html")]
    erreurs = []
    for chemin in fichiers:
        txt = open(chemin, encoding="utf-8").read()
        nom = os.path.basename(chemin)
        touches = 0
        for label, old, new in REMPLACEMENTS:
            n = txt.count(old)
            if n != 1:
                erreurs.append(f"{nom}: {label} -> {n} occurrence(s), attendu 1")
                continue
            txt = txt.replace(old, new)
            touches += 1
        if touches == len(REMPLACEMENTS):
            open(chemin, "w", encoding="utf-8").write(txt)
            print(f"  OK   {nom} ({touches} remplacements)")
        else:
            print(f"  ARRET {nom}")
    if erreurs:
        print("PROBLEMES:")
        for e in erreurs:
            print("  -", e)
        return 1
    print(f"{len(fichiers)} fichier(s) mis a jour.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
