#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Relecture finale : le fil Discord doit restituer le rapport au caractere pres."""
import difflib
import json
import os
import urllib.request

CHANNEL = "1543972228339728454"
IDS = ["1553109707290443987", "1553110354744049665", "1553110356258332693"]
RAPPORT = "/home/raf/projets/ulysse/qa-artefacts/issue-126/rapport-discord.md"
API = "https://discord.com/api/v10"

token = None
for ligne in open(os.path.expanduser("~/.hermes/.env"), encoding="utf-8"):
    if ligne.startswith("DISCORD_BOT_TOKEN="):
        token = ligne.split("=", 1)[1].strip().strip('"').strip("'")
        break

contenus, pj = [], []
for mid in IDS:
    r = urllib.request.Request(API + "/channels/" + CHANNEL + "/messages/" + mid)
    r.add_header("Authorization", "Bot " + token)
    r.add_header("User-Agent", "DiscordBot (https://github.com/hermes, 1.0)")
    with urllib.request.urlopen(r, timeout=30) as resp:
        d = json.load(resp)
    contenus.append(d["content"].strip())
    pj += [a["filename"] for a in d.get("attachments", [])]

ref = open(RAPPORT, encoding="utf-8").read().strip()
lu = "\n\n".join(contenus)
print("caracteres lus:", len(lu), "caracteres source:", len(ref))
print("pieces jointes:", pj)
if lu == ref:
    print("IDENTIQUE au rapport source.")
else:
    print("ECARTS :")
    for l in difflib.unified_diff(ref.split("\n"), lu.split("\n"),
                                  "source", "discord", lineterm=""):
        print(" ", l[:160])
