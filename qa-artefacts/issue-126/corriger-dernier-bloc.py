#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Corrige le dernier message du rapport : le payload_json etait envoye COMME
fichier (curl -F @fichier = champ avec nom de fichier -> Discord le range en
piece jointe) et le texte du bloc etait perdu. On supprime le message fautif
(notre propre message) et on reposte le bloc avec --form-string, puis on
relit."""
import json
import os
import subprocess
import urllib.error
import urllib.request

CHANNEL = "1543972228339728454"
MAUVAIS = "1553109709274349709"
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


def req(method, url, data=None, headers=None):
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bot " + token)
    r.add_header("User-Agent", UA)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            corps = resp.read().decode("utf-8")
            return resp.status, (json.loads(corps) if corps else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")[:300]


print("suppression du message fautif :", req("DELETE", API + "/channels/" + CHANNEL + "/messages/" + MAUVAIS))

txt = open(RAPPORT, encoding="utf-8").read()
bloc = txt.split("\n\n", 1)[1].split("\n\n")
dernier = "\n\n".join(bloc[-2:])   # les 2 derniers paragraphes = 2e bloc
print("bloc a reposter, longueur", len(dernier))

payload = json.dumps({"content": dernier}, ensure_ascii=False)
r = subprocess.run(["curl", "-s", "-X", "POST",
                    API + "/channels/" + CHANNEL + "/messages",
                    "-H", "Authorization: Bot " + token,
                    "-H", "User-Agent: " + UA,
                    "--form-string", "payload_json=" + payload,
                    "-F", "files[0]=@" + PIECE],
                   capture_output=True, text=True)
m = json.loads(r.stdout)
mid = m.get("id")
print("reposte id", mid, "attachments", [a["filename"] for a in m.get("attachments", [])])

st, d = req("GET", API + "/channels/" + CHANNEL + "/messages/" + str(mid))
print("relu", st, "len contenu", len(d.get("content", "")),
      "pieces_jointes", [a["filename"] for a in d.get("attachments", [])])
print("extrait:", d.get("content", "")[:120].replace("\n", " / "))
