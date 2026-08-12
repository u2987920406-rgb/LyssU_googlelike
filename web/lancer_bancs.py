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

Sortie : 0 si tout ce qui a pu tourner est au vert, 1 sinon. Chaque serie
laisse son rapport DATE dans `rapports-bancs/` (ignore par git) — voir plus
bas pourquoi il n'y a plus de « dernier rapport » qu'on ecrase.
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

# ⚠ UN RAPPORT PAR LANCEMENT, DATE, ET UN HISTORIQUE QUI NE S'EFFACE PAS.
# Un seul fichier « dernier rapport » suffisait tant qu'on lancait a la main.
# Planifie, il ne suffit plus, et ca s'est vu : le 2026-08-12 a 23:01 la serie
# horaire a rougi ; a 23:06 la suivante a ECRASE son rapport. Il ne restait que
# la ligne « ROUGE » de l'historique — de quoi savoir QUE quelque chose avait
# casse, pas QUOI. Un rouge qu'on ne peut plus expliquer se classe en « c'etait
# surement rien », et c'est comme ca qu'un vrai defaut passe.
# D'ou : un fichier par lancement, nomme par sa date et son etat.
HISTORIQUE = os.path.join(DOSSIER, "historique-bancs.txt")
RAPPORTS = os.path.join(DOSSIER, "rapports-bancs")

# ⚠ ON ELAGUE LES VERTS, JAMAIS LES ROUGES. Une serie par heure fait 24
# fichiers par jour : sans menage, le dossier devient illisible, et un dossier
# illisible ne se lit pas. Mais elaguer « les plus vieux » supprimerait le
# rouge de la nuit derniere avant qu'on l'ait ouvert — exactement ce qu'on
# vient de reparer. Les rouges restent donc, tous, jusqu'a ce que quelqu'un les
# efface a la main. L'etat est DANS LE NOM du fichier : le menage n'a aucun
# fichier a ouvrir pour savoir lequel il a le droit de jeter.
GARDE_VERTS = 48  # deux jours de passages horaires


def elaguer():
    try:
        noms = sorted(n for n in os.listdir(RAPPORTS) if n.endswith(".txt"))
    except OSError:
        return
    verts = [n for n in noms if "-vert" in n]
    for nom in verts[:-GARDE_VERTS] if len(verts) > GARDE_VERTS else []:
        try:
            os.remove(os.path.join(RAPPORTS, nom))
        except OSError:
            pass


def fichier_rapport(rapide, rouge, quand):
    """Un chemin par lancement. Le nom se trie tout seul dans l'ordre du temps,
    et dit son mode et son etat sans qu'on l'ouvre."""
    return os.path.join(RAPPORTS, "%s-%s-%s.txt" % (
        time.strftime("%Y-%m-%d_%H%M", quand),
        "rapide" if rapide else "complet",
        "ROUGE" if rouge else "vert"))

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


# ⚠ DEUX SERIES A LA FOIS SE MARCHENT DESSUS. Vu pour de vrai le 2026-08-12 :
# la tache planifiee de 23 h a demarre pendant un lancement a la main. Les deux
# bancs travaillent sur le MEME backend — meme liste de taches cron, memes
# sessions, meme fichier de memoire d'essai. L'un a compte les taches pendant
# que l'autre en creait une, l'autre a supprime celle du premier : deux rouges,
# aucun defaut du produit, et une tache d'essai laissee derriere.
# Planifier une serie horaire sans verrou, c'est fabriquer cette collision une
# fois par heure.
VERROU = os.path.join(DOSSIER, ".bancs-en-cours")
VERROU_PERIME_S = 60 * 60


def prendre_verrou():
    """Rend True si l'on peut y aller, False s'il faut passer son tour."""
    try:
        if os.path.exists(VERROU):
            age = time.time() - os.path.getmtime(VERROU)
            if age < VERROU_PERIME_S:
                try:
                    with open(VERROU, encoding="utf-8") as fh:
                        qui = fh.read().strip()
                except OSError:
                    qui = "?"
                print("Une serie tourne deja (%s, depuis %d min). On passe son tour."
                      % (qui, age // 60))
                return False
            # Un verrou plus vieux qu'une heure vient d'un lancement mort en
            # route. Le garder ferait sauter TOUS les passages suivants, en
            # silence — bien pire que la collision qu'il evite.
            print("Verrou perime (%d min) : il vient d'un lancement interrompu. On reprend."
                  % (age // 60))
        with open(VERROU, "w", encoding="utf-8") as fh:
            fh.write("pid %d, %s" % (os.getpid(), time.strftime("%Y-%m-%d %H:%M:%S")))
        return True
    except OSError:
        return True  # Sans verrou possible, mieux vaut tourner que ne rien faire.


def rendre_verrou():
    try:
        os.remove(VERROU)
    except OSError:
        pass


def main():
    rapide = "--rapide" in sys.argv
    debout = pile_debout()

    sortie = io.StringIO()
    debut = time.time()
    # ⚠ UNE SEULE LECTURE DE L'HEURE, gardee jusqu'au bout. Relire l'horloge au
    # moment d'ecrire le fichier donnerait un nom qui ne correspond plus a la
    # premiere ligne du rapport — et sur une serie complete de quatre minutes,
    # a cheval sur minuit, il ne serait meme plus du bon jour.
    quand = time.localtime()
    dire(sortie, "Serie des bancs — " + time.strftime("%Y-%m-%d %H:%M:%S", quand))
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

    rapport = fichier_rapport(rapide, bool(rouges), quand)
    try:
        os.makedirs(RAPPORTS, exist_ok=True)
        with open(rapport, "w", encoding="utf-8", newline="") as fh:
            fh.write(sortie.getvalue())
        print("\nRapport ecrit : " + rapport)
        # Apres avoir ecrit, jamais avant : un menage qui echoue ne doit pas
        # emporter le rapport du jour avec lui.
        elaguer()
    except OSError as exc:
        print("\nRapport non ecrit (%s) — le resultat ci-dessus fait foi." % exc)

    # Une ligne, ajoutee. C'est la vue d'ensemble — quelle nuit a rougi — et
    # elle renvoie au fichier date qui, lui, dit quoi.
    try:
        with open(HISTORIQUE, "a", encoding="utf-8", newline="") as fh:
            fh.write("%s  %-8s  %-6s  %s\n" % (
                time.strftime("%Y-%m-%d %H:%M", quand),
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
    if not prendre_verrou():
        # Passer son tour n'est PAS un echec : sortir en 1 ferait clignoter la
        # tache planifiee en rouge pour un chevauchement sans consequence.
        sys.exit(0)
    try:
        sys.exit(main())
    finally:
        rendre_verrou()
