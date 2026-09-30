#!/usr/bin/env python3
"""Captures CDP de la page Ulysse (viewport Pixel 448x997).

Deux états vérifiés :
  1. fil ouvert, Établi rangé  -> /tmp/etabli-fil.png     (languette fantôme)
  2. fil ouvert, Établi ouvert -> /tmp/etabli-atelier.png (overlay)
Prérequis : chrome headless --remote-debugging-port=9333 sur ulysse.html.
"""
import asyncio, base64, json, urllib.request
import websockets

CDP = "http://127.0.0.1:9333"

JS_FIL = """(() => {
  try {
    const p = document.getElementById('pDiscuter');
    p.classList.remove('accueil');
    document.getElementById('thread').innerHTML = [
      '<div class="msg you"><div class="u-who">Vous</div><p>Salut Ulysse, comment ça va ?</p></div>',
      '<div class="msg ulysse"><div class="u-who">Ulysse</div><p>Ça va — et regarde : le fil va de bord à bord, rien ne le ronge plus.</p></div>',
      '<div class="msg you"><div class="u-who">Vous</div><p>Et l’Établi, il est où ?</p></div>',
      '<div class="msg ulysse"><div class="u-who">Ulysse</div><p>Une ombre translucide au bord droit — tap dessus pour l’ouvrir : il glisse par-dessus sans rétrécir le fil.</p></div>'
    ].join('');
    const lg = document.getElementById('languette');
    lg.innerHTML = svg('atelier', {size:16}) + '<span>Établi · 2</span>';
    const cs = getComputedStyle(lg);
    const r = lg.getBoundingClientRect();
    return 'visible=' + (cs.display !== 'none') + ' opacite=' + cs.opacity +
           ' largeur=' + Math.round(r.width) + 'px hauteur=' + Math.round(r.height) + 'px';
  } catch (e) { return 'ERREUR: ' + e; }
})()"""

JS_ATELIER = """(() => {
  try {
    setMode('atelier');
    const e = document.querySelector('.etabli');
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const th = document.querySelector('.thread').getBoundingClientRect();
    return 'position=' + cs.position + ' largeur=' + Math.round(r.width) +
           'px left=' + Math.round(r.left) + ' filLargeur=' + Math.round(th.width) + 'px';
  } catch (e) { return 'ERREUR: ' + e; }
})()"""


def premier_onglet():
    with urllib.request.urlopen(CDP + "/json/list") as r:
        liste = json.load(r)
    for t in liste:
        if t.get("type") == "page":
            return t
    raise SystemExit("aucun onglet page sur le port CDP")


async def appel(ws, compteur, methode, params=None):
    compteur[0] += 1
    await ws.send(json.dumps({"id": compteur[0], "method": methode, "params": params or {}}))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("id") == compteur[0]:
            return msg.get("result", {})


async def eval_js(ws, compteur, expr):
    r = await appel(ws, compteur, "Runtime.evaluate",
                    {"expression": expr, "returnByValue": True})
    return r.get("result", {}).get("value")


async def capture(ws, compteur, chemin):
    compteur[0] += 1
    await ws.send(json.dumps({"id": compteur[0], "method": "Page.captureScreenshot",
                              "params": {"format": "png", "fromSurface": True}}))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("id") == compteur[0]:
            with open(chemin, "wb") as f:
                f.write(base64.b64decode(msg["result"]["data"]))
            print("capturé ->", chemin)
            return


async def main():
    onglet = premier_onglet()
    async with websockets.connect(onglet["webSocketDebuggerUrl"], max_size=None) as ws:
        comp = [0]
        await appel(ws, comp, "Page.enable")
        # Recharger : on repart d'un état propre (l'onglet garde le mode de
        # la capture précédente).
        await appel(ws, comp, "Page.reload", {"ignoreCache": True})
        for _ in range(60):
            etat = await eval_js(ws, comp, "document.readyState")
            if etat == "complete":
                break
            await asyncio.sleep(0.25)
        await asyncio.sleep(3)  # hydratation (WS Hermes, fil)

        print("état fil   :", await eval_js(ws, comp, JS_FIL))
        await asyncio.sleep(0.7)
        await capture(ws, comp, "/tmp/etabli-fil.png")

        print("état atelier:", await eval_js(ws, comp, JS_ATELIER))
        await asyncio.sleep(0.9)
        await capture(ws, comp, "/tmp/etabli-atelier.png")

asyncio.run(main())
