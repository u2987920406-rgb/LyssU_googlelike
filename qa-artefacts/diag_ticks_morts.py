#!/usr/bin/env python3
"""Pourquoi aucun livrable depuis 08:28 ? Regarde les outputs récents."""
import glob, os, re

d = os.path.expanduser("~/.hermes/cron/output/26af8485f535")
fichiers = sorted(glob.glob(d + "/*.md"))
print("=== les 8 derniers ticks (heure + nature) ===")
for f in fichiers[-8:]:
    txt = open(f, encoding="utf-8", errors="replace").read()
    a_reponse = bool(re.search(r"^## Response", txt, re.M))
    # quoi d'autre dans la fin du fichier ?
    lignes = [l for l in txt.splitlines() if l.strip()]
    fin = " | ".join(lignes[-3:])[:220]
    nat = "AGENT(a Response)" if a_reponse else "coquille/no_change"
    print(f"\n{os.path.basename(f)} — {nat}")
    print(f"   fin: {fin}")

# y a-t-il un marqueur no_change / changement dans les coquilles ?
print("\n=== marqueurs monitor dans les 3 derniers ===")
for f in fichiers[-3:]:
    txt = open(f, encoding="utf-8", errors="replace").read()
    for m in re.finditer(r"(no change|unchanged|MONITOR CHANGE|baseline|identical)", txt, re.I):
        print(os.path.basename(f), "->", m.group(0))
