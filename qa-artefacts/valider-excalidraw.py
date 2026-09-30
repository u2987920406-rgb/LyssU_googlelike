#!/usr/bin/env python3
"""Valide un fichier .excalidraw : enveloppe, champs requis, bindings réciproques."""
import json, sys

CHEMIN = "/home/raf/projets/ulysse/qa-artefacts/issue-126-jonction.excalidraw"
erreurs = []

d = json.load(open(CHEMIN))
if d.get("type") != "excalidraw":
    erreurs.append("type != excalidraw")
els = d.get("elements", [])
ids = {}
for e in els:
    for c in ("type", "id", "x", "y", "width", "height"):
        if c not in e:
            erreurs.append("element %s sans champ %s" % (e.get("id"), c))
    if e["id"] in ids:
        erreurs.append("id duplique: %s" % e["id"])
    ids[e["id"]] = e
    if "label" in e:
        erreurs.append("propriete 'label' interdite sur %s" % e["id"])

for e in els:
    for b in e.get("boundElements", []) or []:
        t = ids.get(b["id"])
        if not t:
            erreurs.append("%s reference un element absent: %s" % (e["id"], b["id"]))
            continue
        if b.get("type") == "text" and t.get("containerId") != e["id"]:
            erreurs.append("binding non reciproque: %s -> %s" % (e["id"], b["id"]))

for e in els:
    if e["type"] == "text":
        if e.get("fontSize", 0) < 14:
            erreurs.append("fontSize < 14 sur %s" % e["id"])
        if e.get("fontFamily") != 1:
            erreurs.append("fontFamily != 1 sur %s" % e["id"])
        if e.get("originalText") != e.get("text"):
            erreurs.append("originalText != text sur %s" % e["id"])

for e in els:
    if e["type"] == "arrow":
        for b in (e.get("startBinding"), e.get("endBinding")):
            if b and b["elementId"] not in ids:
                erreurs.append("fleche %s pointe vers %s absent" % (e["id"], b["elementId"]))

print("elements: %d, textes: %d, fleches: %d" % (
    len(els), sum(1 for e in els if e["type"] == "text"),
    sum(1 for e in els if e["type"] == "arrow")))
if erreurs:
    print("INVALIDE:")
    for x in erreurs:
        print(" -", x)
    sys.exit(1)
print("JSON VALIDE")
