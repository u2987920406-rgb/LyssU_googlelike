"""Remet la feuille courante dans les apercus.

POURQUOI CE SCRIPT EXISTE
-------------------------
Les apercus doivent s'ouvrir d'un double-clic, seuls, sans serveur : ils
RECOPIENT donc `ulysse.css` au lieu de la lier. Autant de copies que de
fichiers, donc autant d'occasions de diverger en silence — et un apercu qui a
diverge ne casse pas : il MENT, ce qui est pire.

`test_page.js` compare chaque copie a la feuille et tombe des qu'une diverge.
Ce script est sa reparation : une commande, pas une retouche par fichier. Il
ne decide rien — il recopie.

NI LUI NI LE TEST NE COMPTENT JUSQU'A UN NOMBRE ECRIT : tous deux lisent le
dossier. Un apercu de plus entre donc tout seul. C'est voulu — un compte en
dur aurait laisse passer le onzieme, arrive le 2026-08-09, et un apercu hors
du compte est exactement la divergence silencieuse qu'on veut empecher.

Il ne touche a RIEN d'autre dans les apercus : leur gabarit, leurs scripts et
leurs notes leur appartiennent.

    python resync_apercus.py          voit et repare
    python resync_apercus.py --voir   voit seulement, ne touche a rien
"""
import glob
import io
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
# Assez long pour ne designer qu'un seul endroit dans un fichier de 87 ko, et
# assez court pour rester reconnaissable si la tete de la feuille change peu.
AMORCE = 200


# ⚠ `newline=""` PARTOUT. Sans lui, Python traduit les fins de ligne a la
# lecture (\r\n -> \n) : ce script comparait donc deux textes NORMALISES,
# pendant que test_page.js compare les OCTETS du disque. Le 2026-08-11 les
# deux se sont contredits — `ulysse.css` etait revenu en CRLF d'un `git
# checkout` (core.autocrlf=true) alors que les quinze apercus portaient une
# copie en LF. Le test voyait quinze divergences ; ce script repondait
# « 15 a jour ».
#
# Et il n'aurait rien pu reparer : il ECRIT deja avec `newline=""`, donc en
# LF, exactement ce que le test refusait. La reparation promise en une
# commande n'existait pas.
#
# **Le garde qui repare doit mesurer comme le garde qui alerte**, sinon
# l'un des deux ment — et c'est toujours celui qui rassure.
_OUVRIR = dict(encoding="utf-8", newline="")


def main():
    voir = "--voir" in sys.argv
    with io.open(os.path.join(ICI, "ulysse.css"), **_OUVRIR) as fh:
        css = fh.read()

    a_jour = perdus = repares = 0
    for chemin in sorted(glob.glob(os.path.join(ICI, "apercu-*.html"))):
        nom = os.path.basename(chemin)
        with io.open(chemin, **_OUVRIR) as fh:
            page = fh.read()

        # On compare le BLOC ENTIER, pas une inclusion. `css in page` laissait
        # passer un apercu qui porte la feuille PLUS des regles en trop — et
        # c'est justement la divergence la plus probable : quelqu'un ajoute
        # une regle dans un apercu pour voir, et elle y reste.
        # `</style>` ne parait jamais dans la feuille : la borne est sure.
        debut = page.find(css[:AMORCE])
        fin = page.find("</style>", debut) if debut >= 0 else -1

        if debut >= 0 and fin >= 0 and page[debut:fin] == css:
            print("  a jour    %s" % nom)
            a_jour += 1
            continue

        if debut < 0 or fin < 0:
            # On ne devine pas. Un apercu dont on ne reconnait plus la feuille
            # se repare a la main, en sachant ce qu'on fait.
            print("  PERDU     %s — feuille non reconnue, a reprendre a la main" % nom)
            perdus += 1
            continue

        if voir:
            print("  a refaire %s (%d octets de feuille)" % (nom, fin - debut))
            repares += 1
            continue

        with io.open(chemin, "w", encoding="utf-8", newline="") as fh:
            fh.write(page[:debut] + css + page[fin:])
        print("  REPARE    %s" % nom)
        repares += 1

    print("\n%d a jour · %d %s · %d perdu(s)"
          % (a_jour, repares, "a refaire" if voir else "repare(s)", perdus))
    # Un code de sortie non nul quand il reste quelque chose a faire : ce
    # script peut ainsi servir de garde ailleurs, sans qu'on lise sa sortie.
    return 1 if perdus or (voir and repares) else 0


if __name__ == "__main__":
    sys.exit(main())
