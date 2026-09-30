#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Poste le rapport QA dans #rapports (Discord API v10) avec le schema en piece
jointe, puis relit les messages postes.

Pieges connus (17/09) : 403 sans User-Agent ; 400 au-dela de 2000 caracteres.
On decoupe en blocs < 1900 caracteres et on relit l'id renvoye.
"""
import json
import os
import subprocess
import sys
import urllib.request

CHANNEL = "1543972228339728454"
RAPPORT = "/home/raf/projets/ulysse/qa-artefacts/issue-126/rapport-discord.md"
PIECE = "/home/raf/projets/ulysse/qa-artefacts/issue-126-jonction.excalidraw"
API = "https://discord.com/api/v10"
UA = "DiscordBot (https://github.com/hermes, 1.0)"

token = None
for ligne in open(os.path.expanduser("~/.hermes/.env"), encoding="utf-8"):
    if ligne.startswith("DISCORD_BOT_TOKEN="):
        token = ligne.split("=", 1)[1].strip().strip('"').strip("'")
        break
if not token:
    print("PAS DE TOKEN DISCORD_BOT_TOKEN dans ~/.hermes/.env")
    sys.exit(1)


def blocs(txt, limite=1900):
    out, cur = [], ""
    for para in txt.split("\n\n"):
        if cur and len(cur) + 2 + len(para) > limite:
            out.append(cur)
            cur = para
        else:
            cur = para if not cur else cur + "\n\n" + para
        while len(cur) > limite:          # paragraphe monstre : on coupe sec
            out.append(cur[:limite])
            cur = cur[limite:]
    if cur.strip():
        out.append(cur)
    return out


def post_texte(contenu):
    data = json.dumps({"content": contenu}).encode("utf-8")
    req = urllib.request.Request(API + "/channels/" + CHANNEL + "/messages",
                                 data=data, method="POST")
    req.add_header("Authorization", "Bot " + token)
    req.add_header("User-Agent", UA)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def post_piece(contenu, chemin):
    payload = os.path.expanduser("~/.hermes/cache/payload-qa126.json")
    with open(payload, "w", encoding="utf-8") as f:
        json.dump({"content": contenu}, f)
    r = subprocess.run(["curl", "-s", "-X", "POST",
                        API + "/channels/" + CHANNEL + "/messages",
                        "-H", "Authorization: Bot " + token,
                        "-H", "User-Agent: " + UA,
                        "-F", "payload_json=@" + payload,
                        "-F", "files[0]=@" + chemin],
                       capture_output=True, text=True)
    return json.loads(r.stdout)


txt = open(RAPPORT, encoding="utf-8").read()
bs = blocs(txt)
print("blocs:", len(bs), [len(b) for b in bs])

ids = []
for i, b in enumerate(bs):
    dernier = (i == len(bs) - 1)
    try:
        if dernier and os.path.exists(PIECE):
            m = post_piece(b, PIECE)
        else:
            m = post_texte(b)
    except Exception as e:
        print("ERREUR POST bloc", i, "->", e)
        continue
    ids.append(m.get("id"))
    print("  poste bloc", i, "id", m.get("id"), "attachments",
          len(m.get("attachments", [])))

# relecture
for mid in ids:
    if not mid:
        continue
    req = urllib.request.Request(API + "/channels/" + CHANNEL + "/messages/" + str(mid))
    req.add_header("Authorization", "Bot " + token)
    req.add_header("User-Agent", UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    print("relu", d["id"], "len", len(d["content"]),
          "pieces_jointes", [a["filename"] for a in d.get("attachments", [])])
