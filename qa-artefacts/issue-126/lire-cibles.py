#!/usr/bin/env python3
import json
BASE = "/home/raf/projets/ulysse/qa-artefacts/issue-126/"
for f in ("tactile-html", "apres-tactile"):
    d = json.load(open(BASE + f + ".json"))
    print("==", f)
    for c in d.get("cibles_avant", []):
        print("  ", c["pt"], "->", c["chaine"][:150])
