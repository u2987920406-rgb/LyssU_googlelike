#!/usr/bin/env python3
"""Debug : exécute JS_FIL en affichant l'exception exacte."""
import asyncio, json, urllib.request
import websockets
import importlib.util

spec = importlib.util.spec_from_file_location(
    "shot", "/home/raf/projets/ulysse/qa-artefacts/shot_cdp.py")

CDP = "http://127.0.0.1:9333"

JS_FIL = """(() => {
  const p = document.getElementById('pDiscuter');
  p.classList.remove('accueil');
  document.getElementById('thread').innerHTML = '<div class="msg you"><div class="u-who">Vous</div><p>Salut Ulysse, comment ça va ?</p></div>';
  const lg = document.getElementById('languette');
  lg.innerHTML = svg('atelier', {size:16}) + '<span>Établi · 2</span>';
  return 'ok';
})()"""

async def main():
    with urllib.request.urlopen(CDP + "/json/list") as r:
        lst = json.load(r)
    onglet = [t for t in lst if t.get("type") == "page"][0]
    async with websockets.connect(onglet["webSocketDebuggerUrl"], max_size=None) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                                  "params": {"expression": JS_FIL, "returnByValue": True}}))
        while True:
            msg = json.loads(await ws.recv())
            if msg.get("id") == 1:
                print(json.dumps(msg, ensure_ascii=False, indent=1)[:2000])
                return

asyncio.run(main())
