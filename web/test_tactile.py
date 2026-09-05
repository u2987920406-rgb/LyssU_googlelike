#!/usr/bin/env python3
"""test_tactile.py — les cibles tactiles du bloc @media <=720px mesurent >= 44px.

Le regle est la recommandation Android/Material (48dp cible, 44px plancher
retenu ici, issue #122) : sur un Pixel 7, un controle de 40px de haut est
rate une fois sur dix au pouce. Ce test lit le CSS REELLEMENT APPLIQUE dans
le bloc @media (max-width:720px) de ulysse.css et refuse toute regle de
taille de controle interactif en dessous du plancher.

    python3 test_tactile.py
"""
import os
import re
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
FICHIER = os.path.join(DIR, "ulysse.css")
PLANCHER = 44

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print("  %s  %s%s" % ("OK  " if ok else "ECHEC", name,
                          ("  — " + detail) if detail and not ok else ""))


def bloc_media(css_texte):
    """Extrait le corps du bloc @media (max-width:720px) (accolades equilibrees)."""
    m = re.search(r"@media\s*\(max-width:720px\)\{", css_texte)
    if not m:
        return ""
    i = m.end() - 1
    profondeur = 0
    for j in range(i, len(css_texte)):
        if css_texte[j] == "{":
            profondeur += 1
        elif css_texte[j] == "}":
            profondeur -= 1
            if profondeur == 0:
                return css_texte[i + 1:j]
    return ""


def main():
    css = open(FICHIER, encoding="utf-8").read()
    bloc = bloc_media(css)
    check("le bloc @media (max-width:720px) existe", bool(bloc))

    # Chaque selecteur du bloc qui DEFINIT une taille de controle interactif
    # doit donner >= PLANCHER px. On liste les regles width/height/min-height
    # qui visent des boutons/champs (exclus : tailles de police, ombres, bordures).
    cibles = [
        (r"\.composer\s+\.icon-btn\{[^}]*width:(\d+)px",
         ".composer .icon-btn (largeur)"),
        (r"\.composer\s+\.icon-btn\{[^}]*height:(\d+)px",
         ".composer .icon-btn (hauteur)"),
        (r"\.validate,\.ghost-btn\{[^}]*height:(\d+)px",
         ".validate,.ghost-btn (hauteur)"),
        (r"\.m-languette\{[^}]*width:(\d+)px",
         ".m-languette (largeur)"),
        (r"\.m-languette\{[^}]*height:(\d+)px",
         ".m-languette (hauteur)"),
        (r"\.rail-top\s+\.icon-btn\{[^}]*width:(\d+)px",
         ".rail-top .icon-btn (largeur)"),
    ]
    for motif, nom in cibles:
        m = re.search(motif, bloc)
        if not m:
            check("cible tactile : %s" % nom, True,
                  "(non definie dans le bloc — rien a refuser)")
            continue
        px = int(m.group(1))
        check("cible tactile >= %dpx : %s" % (PLANCHER, nom), px >= PLANCHER,
              "%dpx" % px)

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 62)
    print("  %d / %d verifications passees" % (passed, total))
    print("=" * 62)
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())