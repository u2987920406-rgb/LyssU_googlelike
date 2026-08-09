#!/usr/bin/env python3
"""Sonde CHAQUE endpoint que la page appelle, contre le vrai Hermes qui tourne.

POURQUOI CE SCRIPT EXISTE
-------------------------
`test_reel.py` verifie ce qu'on lui a appris a verifier. Celui-ci part de la
LISTE des appels declares dans `ulysse-core.js` et les sonde tous — y compris
ceux que personne n'a pense a tester. La difference compte : un endpoint qu'on
a oublie de tester est exactement celui qui cassera.

Il ne fait que LIRE. Aucune route qui ecrit, supprime, declenche ou lance quoi
que ce soit n'est appelee : elles sont listees et marquees « non sondee », avec
la raison. Sonder une suppression pour verifier qu'elle repond, c'est
supprimer.

    python audit_endpoints.py
"""
import json
import sys
import urllib.parse
from http.client import HTTPConnection

for flux in (sys.stdout, sys.stderr):
    try:
        flux.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

PORT = 8080
HOST = "127.0.0.1:%d" % PORT
ORIGIN = "http://127.0.0.1:%d" % PORT

# (panneau, nom dans REST, methode, chemin, ce qu'on attend dans la reponse)
# `attendu` : une clef qui doit etre presente, ou None si on ne verifie que le
# code. On ne devine pas une forme : elle vient de ce qui a ete lu au source.
LECTURES = [
    ("Tous",            "status",       "/api/status",            ["version"]),
    ("Travaux",         "sessions",     "/api/sessions?limit=5&sort=recent", ["sessions"]),
    ("Livrables",       "files",        "/api/files",             ["entries", "path"]),
    ("Reglages",        "memory",       "/api/memory",            ["builtin_files"]),
    ("Vestiaire",       "skills",       "/api/skills",            None),
    ("Automatisations", "webhooks",     "/api/webhooks",          None),
    ("Automatisations", "cronJobs",     "/api/cron/jobs",         None),
    ("Reglages",        "config",       "/api/config",            None),
    ("Reglages",        "modelOptions", "/api/model/options",     None),
    ("Reglages",        "usage",        "/api/analytics/usage?days=7", None),
]

# Ce qu'on NE sonde PAS, et pourquoi. Les taire donnerait un audit qui se croit
# complet ; les appeler ferait des degats.
ABSTENTIONS = [
    ("Travaux",   "deleteSession",    "supprimerait une vraie session"),
    ("Travaux",   "patchSession",     "renommerait ou archiverait une vraie session"),
    ("Memoire",   "ecrireMemoire",    "ecrirait dans la memoire de quelqu'un"),
    ("Memoire",   "restaurerVersion", "ecraserait le fichier courant"),
    ("Terminal",  "ouvrirConsole",    "ouvrirait une fenetre sur le bureau"),
    ("Autos",     "fireWebhook",      "declencherait un vrai webhook"),
    ("Autos",     "pauseCron",        "arreterait une vraie tache"),
    ("Autos",     "resumeCron",       "relancerait une vraie tache"),
    ("Autos",     "triggerCron",      "declencherait une vraie tache"),
    ("Discuter",  "transcribe",       "demande un fichier audio"),
    ("Discuter",  "pureChat",         "consommerait des jetons chez un fournisseur"),
]

# Ceux qui ont besoin d'un argument qu'on doit d'abord trouver.
DEPENDANTS = [
    ("Travaux",   "messages",  "/api/sessions/%s/messages?limit=1", "sessions"),
    ("Livrables", "readFile",  "/api/files/read?path=%s",           "fichier"),
    ("Memoire",   "readText",  "/api/fs/read-text?path=%s",         "memoire"),
    ("Memoire",   "versionsDe", "/ulysse/versions?path=%s",         "memoire"),
]

RES = []


def http(chemin):
    c = HTTPConnection("127.0.0.1", PORT, timeout=20)
    try:
        c.request("GET", chemin, headers={"Host": HOST, "Origin": ORIGIN})
        r = c.getresponse()
        brut = r.read().decode("utf-8", "replace")
        try:
            return r.status, json.loads(brut), brut
        except ValueError:
            return r.status, None, brut
    except OSError as exc:
        return 0, None, "%s: %s" % (type(exc).__name__, exc)
    finally:
        c.close()


def ligne(panneau, nom, etat, detail):
    RES.append((panneau, nom, etat, detail))
    marque = {"ok": "[ok]  ", "ko": "[KO]  ", "?": "[?]   "}[etat]
    print("  %s %-16s %-16s %s" % (marque, panneau, nom, detail))


def main():
    print("=" * 78)
    print(" AUDIT DES ENDPOINTS — chaque appel de la page, contre le vrai Hermes")
    print("=" * 78)

    print("\n-- Ce qui se lit, et qu'on sonde --")
    trouve = {}
    for panneau, nom, chemin, attendu in LECTURES:
        st, d, brut = http(chemin)
        if st != 200:
            ligne(panneau, nom, "ko", "HTTP %d — %s" % (st, brut[:60]))
            continue
        if attendu and isinstance(d, dict):
            absents = [k for k in attendu if k not in d]
            if absents:
                ligne(panneau, nom, "ko",
                      "HTTP 200 mais il manque : %s (recu %s)"
                      % (", ".join(absents), ", ".join(sorted(d.keys()))[:60]))
                continue
        taille = len(brut)
        forme = ("%d clef(s)" % len(d)) if isinstance(d, dict) else (
            ("liste de %d" % len(d)) if isinstance(d, list) else "texte")
        ligne(panneau, nom, "ok", "HTTP 200 · %s · %d octets" % (forme, taille))
        trouve[nom] = d

    # De quoi nourrir les appels qui ont besoin d'un argument.
    ses = (trouve.get("sessions") or {}).get("sessions") or []
    sid = ses[0].get("id") if ses else None
    ent = (trouve.get("files") or {}).get("entries") or []
    fic = next((e.get("path") for e in ent
                if not (e.get("is_directory") or e.get("is_dir"))), None)
    mem = None
    st, d, _ = http("/api/status")
    if isinstance(d, dict) and d.get("hermes_home"):
        mem = d["hermes_home"].replace("\\", "/") + "/MEMORY.md"

    print("\n-- Ce qui a besoin d'un argument reel --")
    for panneau, nom, gabarit, besoin in DEPENDANTS:
        arg = {"sessions": sid, "fichier": fic, "memoire": mem}[besoin]
        if not arg:
            ligne(panneau, nom, "?", "pas de %s sous la main pour l'essayer" % besoin)
            continue
        st, d, brut = http(gabarit % urllib.parse.quote(str(arg)))
        if st != 200:
            ligne(panneau, nom, "ko", "HTTP %d — %s" % (st, brut[:60]))
        else:
            forme = ("%d clef(s)" % len(d)) if isinstance(d, dict) else "texte"
            ligne(panneau, nom, "ok", "HTTP 200 · %s" % forme)

    # ----------------------------------------------------------------------
    # LES CHAMPS, ET NON SEULEMENT LES ROUTES.
    #
    # « Repondre » n'est pas « avoir la bonne forme ». Le defaut qui a coute
    # trois fois a ce projet etait un 200 avec la mauvaise forme :
    # `builtin_files` rendu OBJET la ou le code appelait `.filter`. Une route
    # verte ne dit rien de ce qu'on en lit.
    #
    # Les listes ci-dessous sont ce que le code lit VRAIMENT, releve dans
    # `ulysse-app.js`. Si Hermes retire un champ, cet audit le nomme — et on
    # saura quel panneau tombe avant de le decouvrir a l'ecran.
    # ----------------------------------------------------------------------
    print("\n-- Les champs que chaque panneau lit --")
    CHAMPS = [
        ("Travaux", "une session",
         (trouve.get("sessions") or {}).get("sessions"),
         ["id", "title", "message_count", "cwd", "is_active", "last_active",
          "started_at", "archived", "pinned", "preview"]),
        ("Vestiaire", "une competence", trouve.get("skills"),
         ["name", "category", "description", "enabled", "provenance"]),
        ("Reglages", "les totaux d'usage",
         [(trouve.get("usage") or {}).get("totals")],
         ["total_input", "total_output", "total_estimated_cost"]),
    ]
    for panneau, quoi, source, attendus in CHAMPS:
        premier = source[0] if isinstance(source, list) and source else None
        if not isinstance(premier, dict):
            ligne(panneau, quoi, "?", "rien a examiner ici pour l'instant")
            continue
        absents = [c for c in attendus if c not in premier]
        if absents:
            ligne(panneau, quoi, "ko", "champs ABSENTS : " + ", ".join(absents))
        else:
            ligne(panneau, quoi, "ok", "%d champ(s) lus, tous presents" % len(attendus))

    # `builtin_files` est un OBJET nom -> octets, pas une liste. C'est LE
    # defaut qui a coute trois fois : on le verifie nommement.
    bf = (trouve.get("memory") or {}).get("builtin_files")
    if bf is None:
        ligne("Reglages", "builtin_files", "ko", "absent de /api/memory")
    elif isinstance(bf, dict):
        ligne("Reglages", "builtin_files", "ok",
              "objet nom→octets, comme attendu (%s)" % ", ".join(sorted(bf.keys())[:5]))
    else:
        ligne("Reglages", "builtin_files", "ko",
              "ce n'est plus un objet mais un %s — le code le lit comme un objet"
              % type(bf).__name__)

    print("\n-- Ce qu'on NE sonde PAS, et pourquoi --")
    for panneau, nom, raison in ABSTENTIONS:
        print("  [abst] %-16s %-16s %s" % (panneau, nom, raison))

    ok = sum(1 for r in RES if r[2] == "ok")
    ko = [r for r in RES if r[2] == "ko"]
    flou = [r for r in RES if r[2] == "?"]
    print("\n" + "=" * 78)
    print("  %d sondes OK · %d en panne · %d indeterminees · %d non sondees (a dessein)"
          % (ok, len(ko), len(flou), len(ABSTENTIONS)))
    if ko:
        print("\n  EN PANNE :")
        for p, n, _, d in ko:
            print("    · %-16s %-16s %s" % (p, n, d))
    print("=" * 78)
    return 1 if ko else 0


if __name__ == "__main__":
    sys.exit(main())
