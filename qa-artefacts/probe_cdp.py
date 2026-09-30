#!/usr/bin/env python3
"""Probe : pourquoi l'Établi ouvert paraît-il transparent sur mobile ?

Mesure, sans hypothèse :
  C1 fond calculé de .etabli (alpha ?)
  C2 opacity / mix-blend / backdrop-filter calculés
  C3 elementFromPoint au centre ET en bas du panneau (qui est dessus ?)
  C4 z-index : panneau vs composeur (.foot)
  C5 languette en atelier (doit être display:none)
"""
import asyncio, json, urllib.request
import websockets

CDP = "http://127.0.0.1:9333"

PROBE = r"""(() => {
  const e = document.querySelector('.etabli');
  const cs = getComputedStyle(e);
  const r = e.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top + r.height / 2);
  const by = Math.round(window.innerHeight - 40);
  const el = (x, y) => {
    const t = document.elementFromPoint(x, y);
    if (!t) return 'rien';
    return t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') +
           (t.className && typeof t.className === 'string'
             ? '.' + t.className.trim().split(/\s+/).join('.') : '');
  };
  const foot = document.querySelector('.foot');
  const fcs = foot ? getComputedStyle(foot) : null;
  const note = document.getElementById('modenote1');
  const ncs = note ? getComputedStyle(note) : null;
  const lg = document.querySelector('.u-languette');
  const lcs = lg ? getComputedStyle(lg) : null;
  return JSON.stringify({
    fond: cs.backgroundColor,
    opacite: cs.opacity,
    blend: cs.mixBlendMode,
    backdrop: cs.backdropFilter,
    zIndexPanneau: cs.zIndex,
    panneauRect: [Math.round(r.left), Math.round(r.top),
                  Math.round(r.width), Math.round(r.height)],
    centreDuPanneau_est: el(cx, cy),
    basDuPanneau_est: el(cx, by),
    zNote: ncs ? (ncs.zIndex + '/' + ncs.position) : 'pas de note',
    zIndexFoot: fcs ? fcs.zIndex : 'pas de .foot',
    footPosition: fcs ? fcs.position : '-',
    languetteDisplay: lcs ? lcs.display : 'absente',
    viewport: window.innerWidth + 'x' + window.innerHeight
  }, null, 1);
})()"""


async def appel(ws, comp, method, params=None):
    comp[0] += 1
    await ws.send(json.dumps({"id": comp[0], "method": method,
                              "params": params or {}}))
    while True:
        m = json.loads(await ws.recv())
        if m.get("id") == comp[0]:
            return m.get("result", {})


async def eval_js(ws, comp, expr):
    r = await appel(ws, comp, "Runtime.evaluate",
                    {"expression": expr, "returnByValue": True})
    if "exceptionDetails" in r:
        return "EXCEPTION: " + json.dumps(r["exceptionDetails"])[:300]
    return r.get("result", {}).get("value")


async def main():
    lst = json.load(urllib.request.urlopen(CDP + "/json/list"))
    page = next(t for t in lst if t.get("type") == "page")
    async with websockets.connect(page["webSocketDebuggerUrl"],
                                  max_size=None) as ws:
        comp = [0]
        await appel(ws, comp, "Page.enable")
        await appel(ws, comp, "Page.reload", {"ignoreCache": True})
        for _ in range(60):
            if await eval_js(ws, comp, "document.readyState") == "complete":
                break
            await asyncio.sleep(0.25)
        await asyncio.sleep(3)
        # Fil + Établi ouvert, exactement comme la capture envoyée à Raf.
        await eval_js(ws, comp, """(() => {
          document.getElementById('pDiscuter').classList.remove('accueil');
          document.getElementById('thread').innerHTML =
            '<div class="msg you"><div class="u-who">Vous</div><p>Salut Ulysse</p></div>' +
            '<div class="msg ulysse"><div class="u-who">Ulysse</div><p>Ça va.</p></div>';
          return 'fil ok';
        })()""")
        await eval_js(ws, comp, "setMode('atelier'); 'atelier'")
        await asyncio.sleep(0.6)
        print(await eval_js(ws, comp, PROBE))

asyncio.run(main())
