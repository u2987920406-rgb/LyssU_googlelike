#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Poste UN message texte dans #rapports (fichier en argument) et le relit."""
import json
import os
import sys
import urllib.error
import urllib.request

CHANNEL = "1543972228339728454"
API = "https://discord.com/api/v10"
UA = "DiscordBot (https://github.com/hermes, 1.0)"

token = None
for ligne in open(os.path.expanduser("~/.hermes/.env"), encoding="utf-8"):
    if ligne.startswith("DISCORD_BOT_TOKEN="):
        token = ligne.split("=", 1)[1].strip().strip('"').strip("'")
        break
assert token, "pas de token"

txt = open(sys.argv[1], encoding="utf-8").read().strip()
assert len(txt) <= 1900, "trop long: %d" % len(txt)

r = urllib.request.Request(API + "/channels/" + CHANNEL + "/messages",
                           data=json.dumps({"content": txt}, ensure_ascii=False).encode("utf-8"),
                           method="POST")
r.add_header("Authorization", "Bot " + token)
r.add_header("User-Agent", UA)
r.add_header("Content-Type", "application/json")
with urllib.request.urlopen(r, timeout=30) as resp:
    m = json.load(resp)
print("poste id", m["id"], "len", len(m["content"]))

r2 = urllib.request.Request(API + "/channels/" + CHANNEL + "/messages/" + m["id"])
r2.add_header("Authorization", "Bot " + token)
r2.add_header("User-Agent", UA)
with urllib.request.urlopen(r2, timeout=30) as resp:
    d = json.load(resp)
print("relu", d["id"], "identique:", d["content"].strip() == txt)
