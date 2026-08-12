#!/usr/bin/env python3
"""lancer_bancs.py — la serie complete, en une commande.

Quatre bancs, et ils ne se valent pas :

    test_page.js      la page dans un DOM, contre un faux Hermes.  ~10 s
    test_serve.py     les frontieres de serve.py, sans reseau.      ~5 s
    banc_ecrans.js    les ecrans, contre le VRAI Hermes.           ~4 min
    banc_reel.js      la demande d'accord, contre le VRAI Hermes.  ~5 min

Les deux premiers tournent toujours. Les deux autres exigent que la pile soit
debout (`lancer_ulysse.bat`) : sans elle, ils ne sont pas ROUGES, ils sont
IGNORES — une pile eteinte n'est pas un defaut du produit, et les confondre
ferait chercher un bug la ou il n'y a qu'un serveur arrete.

    python lancer_bancs.py            tout
    python lancer_bancs.py --rapide   sans `banc_reel.js` (le seul qui coute
                                      vraiment des tours de modele)

⚠ CE QUE COUTE LA SERIE COMPLETE. `banc_reel.js` fait travailler le modele
  pour de bon : c'est ce qui fait sa valeur, et c'est ce qui fait son prix.
  `--rapide` existe pour pouvoir la lancer souvent sans y penser.

Sortie : 0 si tout ce qui a pu tourner est au vert, 1 sinon. Le rapport est
ecrit a cote, dans `dernier-rapport-bancs.txt` (ignore par git).
"""

import io
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

# La console Windows est en cp1252 : sans ceci, chaque accent des bancs ressort
# en « � » et le rapport a l'ecran devient penible a lire. Le fichier, lui, a
# toujours ete en UTF-8.
for flux in (sys.stdout, sys.stderr):
    try:
        flux.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

DOSSIER = os.path.dirname(os.path.abspath(__file__))
ULYSSE = "http://127.0.0.1:8080/api/status"

# ⚠ UN RAPPORT PAR MODE, ET UN HISTORIQUE QUI NE S'EFFACE PAS.
# Un seul fichier « dernier rapport » suffisait tant qu'on lancait a la main.
# Planifie, le passage horaire en `--rapide` ECRASERAIT le rapport de la serie
# complete de la nuit — c'est-a-dire precisement celui qui vaut quelque chose.
# Et un rouge tombe a 3 h du matin doit rester lisible au reveil : d'ou une
# ligne par lancement, ajoutee, jamais reecrite.
HISTORIQUE = os.path.join(DOSSIER, "historique-bancs.txt")


def fichier_rapport(rapide):
    return os.path.join(DOSSIER,
                        "dernier-rapport-bancs-rapide.txt" if rapide
                        else "dernier-rapport-bancs.txt")

# (commande, libelle, exige la pile)
BANCS = [
    (["node", "test_page.js"], "test_page.js — la page dans un DOM", False),
    ([sys.executable, "test_serve.py"], "test_serve.py — les frontieres", False),
    (["node", "banc_ecrans.js"], "banc_ecrans.js — les ecrans, vrai Hermes", True),
    (["node", "banc_reel.js"], "banc_reel.js — l'accord, vrai Hermes", True),
]


def pile_debout():
    """La pile repond-elle, et sa gateway tourne-t-elle ?

    ⚠ ON LIT LE JSON, ON NE CHERCHE PAS UNE CHAINE DEDANS. Ecrit d'abord en
    cherchant `"gateway_running": true` dans les octets, ce test disait la pile
    ARRETEE alors qu'elle tournait : le backend repond sans espace apres les
    deux-points. Une sonde qui se trompe dans ce sens est la pire — elle fait
    IGNORER en silence les deux bancs qui comptent, et la serie finit au vert
    sans avoir rien eprouve du vrai Hermes.
    """
    try:
        with urllib.request.urlopen(ULYSSE, timeout=4) as r:
            return bool(json.loads(r.read().decode("utf-8")).get("gateway_running"))
    except (urllib.error.URLError, OSError, ValueError):
        return False


def dire(sortie, texte):
    print(texte, flush=True)
    sortie.write(texte + "\n")


def main():
    rapide = "--rapide" in sys.argv
    debout = pile_debout()

    sortie = io.StringIO()
    debut = time.time()
    dire(sortie, "Serie des bancs — " + time.strftime("%Y-%m-%d %H:%M:%S"))
    dire(sortie, "Pile Ulysse : " + ("debout" if debout else "ARRETEE"))
    if not debout:
        dire(sortie, "  Les bancs contre le vrai Hermes seront IGNORES, pas rouges.")
        dire(sortie, "  Pour les jouer : lancer_ulysse.bat, puis relancer.")
    if rapide:
        dire(sortie, "Mode --rapide : `banc_reel.js` est mis de cote.")
    dire(sortie, "")

    resultats = []
    for cmd, libelle, exige_pile in BANCS:
        if exige_pile and not debout:
            resultats.append((libelle, "ignore", 0, "la pile ne repond pas"))
            dire(sortie, "[ignore] " + libelle)
            continue
        if rapide and "banc_reel" in cmd[-1]:
            resultats.append((libelle, "ignore", 0, "--rapide"))
            dire(sortie, "[ignore] " + libelle + "  (--rapide)")
            continue

        t0 = time.time()
        # ⚠ PAS DE TUBE. Passer un banc dans `| tee` rendrait le code du dernier
        # maillon, et un rouge passerait pour un vert. On capture, puis on rend
        # le code du banc lui-meme.
        proc = subprocess.run(cmd, cwd=DOSSIER, capture_output=True, text=True,
                              encoding="utf-8", errors="replace")
        duree = time.time() - t0
        texte = (proc.stdout or "") + (proc.stderr or "")
        bilan = ""
        for ligne in reversed(texte.splitlines()):
            if "verification" in ligne or "vérification" in ligne:
                bilan = ligne.strip()
                break
        etat = "vert" if proc.returncode == 0 else "ROUGE"
        resultats.append((libelle, etat, duree, bilan))
        dire(sortie, "[%s] %s  (%.0f s)  %s"
             % ("ok    " if etat == "vert" else "ECHEC ", libelle, duree, bilan))
        if proc.returncode != 0:
            # Le detail des echecs, et rien d'autre : un rapport qui recopie
            # tout ne se lit pas, et c'est le rouge qu'on vient y chercher.
            for ligne in texte.splitlines():
                if "ECHEC" in ligne or "Echecs" in ligne or "interrompu" in ligne:
                    dire(sortie, "        " + ligne.strip())

    dire(sortie, "")
    rouges = [r for r in resultats if r[1] == "ROUGE"]
    ignores = [r for r in resultats if r[1] == "ignore"]
    dire(sortie, "%d vert(s), %d rouge(s), %d ignore(s) — %.0f s au total"
         % (len(resultats) - len(rouges) - len(ignores), len(rouges),
            len(ignores), time.time() - debut))
    if rouges:
        dire(sortie, "\nA regarder :")
        for libelle, _, _, bilan in rouges:
            dire(sortie, "  · " + libelle + ("  — " + bilan if bilan else ""))

    rapport = fichier_rapport(rapide)
    try:
        with open(rapport, "w", encoding="utf-8", newline="") as fh:
            fh.write(sortie.getvalue())
        print("\nRapport ecrit : " + rapport)
    except OSError as exc:
        print("\nRapport non ecrit (%s) — le resultat ci-dessus fait foi." % exc)

    # Une ligne, ajoutee. C'est ce qu'on lira le lendemain matin pour savoir si
    # quelque chose a rougi pendant la nuit — le rapport, lui, aura ete ecrase
    # par le passage suivant.
    try:
        with open(HISTORIQUE, "a", encoding="utf-8", newline="") as fh:
            fh.write("%s  %-8s  %-6s  %s\n" % (
                time.strftime("%Y-%m-%d %H:%M"),
                "rapide" if rapide else "complet",
                "ROUGE" if rouges else "vert",
                # Separateur ASCII : ce fichier se lit avec n'importe quoi —
                # `Get-Content`, le Bloc-notes, un « type » dans une console —
                # et un point median en UTF-8 y ressort en « Â· » des que le
                # lecteur suppose du cp1252. Un historique illisible ne se lit
                # pas, donc ne sert a rien.
                " | ".join("%s %s" % (l.split(" ")[0], e) for l, e, _, _ in resultats)))
    except OSError:
        pass

    return 1 if rouges else 0


if __name__ == "__main__":
    sys.exit(main())
