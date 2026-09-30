#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare les mesures avant/apres (issue #126) et ecrit mesures.json."""
import json

BASE = "/home/raf/projets/ulysse/qa-artefacts/issue-126/"
CLES = ("doc_scroll_width", "corps_width", "corps_scroll_width",
        "scroll_height", "client_height", "scroll_top_max")

lignes = []
res = {}
for prefixe, nom in (("avant", "avant"), ("apres", "apres"),
                     ("avant-pdf", "avant-pdf"), ("apres-pdf", "apres-pdf"),
                     ("avant-md", "avant-md"), ("apres-md", "apres-md")):
    d = json.load(open(BASE + prefixe + ".json"))
    m = d["mes"]
    res[nom] = {k: m.get(k) for k in CLES}
    res[nom]["fichier"] = d["fichier"].split("/")[-1]
    print("%-10s %-32s corps_w=%-5s corps_scroll_w=%-5s sh=%-6s ch=%-5s stmax=%-6s"
          % (nom, res[nom]["fichier"], m.get("corps_width"),
             m.get("corps_scroll_width"), m.get("scroll_height"),
             m.get("client_height"), m.get("scroll_top_max")))

for prefixe, nom in (("tactile-html", "avant_tactile"),
                     ("apres-tactile", "apres_tactile")):
    try:
        d = json.load(open(BASE + prefixe + ".json"))
    except OSError:
        continue
    g = d.get("geste", {}) or {}
    st = {k: (v or {}).get("corps_scroll_top") for k, v in g.items()
          if isinstance(v, dict)}
    st.update({k: (v or {}).get("corps_scroll_top") for k, v in d.items()
               if isinstance(v, dict) and "corps_scroll_top" in v})
    res[nom] = st
    print("%-10s gestes: %s" % (nom, st))
    if "cibles_avant" in d:
        res[nom + "_cibles"] = [c.get("chaine", "")[:120] for c in d["cibles_avant"]]

json.dump(res, open(BASE + "mesures.json", "w"), indent=2, ensure_ascii=False)
print("\nmesures.json ecrit.")
