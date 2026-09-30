#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Le paragraphe « Suite » a ete saute par la decoupe : on remplace le dernier
message par deux messages ordonnes (Suite, puis Reste + piece jointe), puis on
relit tout le fil du rapport."""
import json
import os
import subprocess
import urllib.error
import urllib.request

CHANNEL = "1543972228339728454"
A_SUPPRIMER = "1553109966913540239"
RAPPORT = "/home/raf/projets/ulysse/qa-artefacts/issue-126/rapport-discord.md"
PIECE = "/home/raf/projets/ulysse/qa-artefacts/issue-126-jonction.excalidraw"
API = "https://discord.com/api/v10"
UA = "DiscordBot (https://github.com/hermes, 1.0)"

token = None
for ligne in open(os.path.expanduser("~/.hermes/.env"), encoding="utf-8"):
    if ligne.startswith("DISCORD_BOT_TOKEN="):
        token = ligne.split("=", 1)[1].strip().strip('"').strip("'")
        break
assert token, "pas de token"


def req(method, url, data=None):
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bot " + token)
    r.add_header("User-Agent", UA)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            corps = resp.read().decode("utf-8")
            return resp.status, (json.loads(corps) if corps else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")[:300]


def post_texte(contenu):
    return req("POST", API + "/channels/" + CHANNEL + "/messages",
               json.dumps({"content": contenu}, ensure_ascii=False).encode("utf-8"))


def post_avec_piece(contenu, chemin):
    r = subprocess.run(["curl", "-s", "-X", "POST",
                        API + "/channels/" + CHANNEL + "/messages",
                        "-H", "Authorization: Bot " + token,
                        "-H", "User-Agent: " + UA,
                        "--form-string",
                        "payload_json=" + json.dumps({"content": contenu}, ensure_ascii=False),
                        "-F", "files[0]=@" + chemin],
                       capture_output=True, text=True)
    return 200, json.loads(r.stdout)


print("suppression:", req("DELETE", API + "/channels/" + CHANNEL + "/messages/" + A_SUPPRIMER))

paras = open(RAPPORT, encoding="utf-8").read().split("\n\n")
suite, reste, fin = paras[-3], paras[-2], paras[-1]
print("longueurs:", len(suite), len(reste), len(fin))

_, m1 = post_texte(suite)
mid1 = m1.get("id") if isinstance(m1, dict) else None
print("bloc Suite ->", mid1, "" if mid1 else repr(m1)[:200])
_, m2 = post_avec_piece(reste + "\n\n" + fin, PIECE)
mid2 = m2.get("id") if isinstance(m2, dict) else None
print("bloc Reste ->", mid2, [a["filename"] for a in m2.get("attachments", [])]
      if isinstance(m2, dict) else repr(m2)[:200])

for mid in ("1553109707290443987", mid1, mid2):
    if not mid:
        continue
    st, d = req("GET", API + "/channels/" + CHANNEL + "/messages/" + str(mid))
    print("relu", mid, st, "len", len(d.get("content", "")),
          "pj", [a["filename"] for a in d.get("attachments", [])])
