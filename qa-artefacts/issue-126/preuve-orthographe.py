#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preuve d'injection : meme fix, AUTRE orthographe (`#app.artifact-split
.stage{display:none}` au lieu de `.panelwrap`). Le test doit rester VERT —
s'il rougit, il exige une orthographe et pas l'effet."""
import os
import shutil
import subprocess

SRC = "/home/raf/projets/ulysse-qa126-wt/web"
DST = "/tmp/qa126-ortho"
OLD = "#app.artifact-split .panelwrap{display:none}"
NEW = "#app.artifact-split .stage{display:none}"

if os.path.isdir(DST):
    shutil.rmtree(DST)
os.makedirs(DST)
for f in os.listdir(SRC):
    if f == "ulysse.css" or (f.startswith("apercu-") and f.endswith(".html")) \
            or f == "test_tactile.py":
        shutil.copy(os.path.join(SRC, f), os.path.join(DST, f))

n = 0
for f in os.listdir(DST):
    p = os.path.join(DST, f)
    t = open(p, encoding="utf-8").read()
    if OLD in t:
        n += t.count(OLD)
        open(p, "w", encoding="utf-8").write(t.replace(OLD, NEW))
print("remplacements d'orthographe:", n)

r = subprocess.run(["python3", os.path.join(DST, "test_tactile.py")],
                   capture_output=True, text=True)
print(r.stdout[-700:])
print("code_sortie:", r.returncode)
