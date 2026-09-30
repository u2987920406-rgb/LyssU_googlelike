#!/usr/bin/env python3
import json
BASE = "/home/raf/projets/ulysse/qa-artefacts/issue-126/"
for f in ("avant", "avant-pdf", "avant-md"):
    d = json.load(open(BASE + f + ".json"))
    m, g = d["mes"], d.get("geste", {})
    print("==", f, d["fichier"].split("/")[-1])
    print("  corps_width", m["corps_width"], "corps_scroll_width", m["corps_scroll_width"],
          "scroll_height", m["scroll_height"], "client_height", m["client_height"],
          "scroll_top_max", m["scroll_top_max"])
    for k in ("corps_apres_swipe_1", "corps_apres_swipe_2", "contenu_apres_swipe"):
        print("   ", k, g.get(k))
    print("    styles", g.get("styles"))
