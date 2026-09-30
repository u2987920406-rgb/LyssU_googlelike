#!/usr/bin/env python3
"""Compte les VRAIS runs d'agent du cron livrables (section ## Response)."""
import glob, os, re

d = os.path.expanduser("~/.hermes/cron/output/26af8485f535")
fichiers = sorted(glob.glob(d + "/*.md"))
runs, reponses = [], []
for f in fichiers:
    txt = open(f, encoding="utf-8", errors="replace").read()
    m = re.search(r"^## Response\s*\n(.*)$", txt, re.M | re.S)
    if m:
        ligne = m.group(1).strip().splitlines()
        corps = " ".join(x.strip() for x in ligne if x.strip())[:160]
        runs.append(os.path.basename(f))
        reponses.append((os.path.basename(f), corps))

print("ticks totaux écrits:", len(fichiers))
print("vrais runs d'agent (avec Response):", len(runs))
print()
print("=== réponses d'agent (ordre croissant) ===")
for nom, corps in reponses:
    print(f"- {nom[:19]} : {corps}")
