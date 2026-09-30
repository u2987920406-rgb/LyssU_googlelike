#!/usr/bin/env python3
"""Qui ré-applique la classe accueil après le rendu ? Spy sur classList.add."""
import asyncio, json, urllib.request
import websockets

CDP = "http://127.0.0.1:9333"
PAGE = "http://127.0.0.1:8453/ulysse.html"

JS_SPIKE = """
(() => {
  window.__spy = [];
  const orig = DOMTokenList.prototype.add;
  DOMTokenList.prototype.add = function(){
    if (Array.prototype.indexOf.call(arguments, "accueil") >= 0){
      window.__spy.push(new Error("ajout accueil").stack);
    }
    return orig.apply(this, arguments);
  };
  const p = document.getElementById("pDiscuter");
  p.classList.remove("accueil");
  return "spy pose, accueil retire";
})()
"""

JS_LIRE = """
JSON.stringify({
  spy: (window.__spy || []).slice(0, 2),
  aEncoreAccueil: document.getElementById("pDiscuter").classList.contains("accueil"),
  threadEnfants: document.getElementById("thread").children.length,
  ws: (typeof link !== "undefined" && link.ws) ? link.ws.readyState : "absent"
})
"""


async def onglet():
    with urllib.request.urlopen(CDP + "/json/list") as r:
        for t in json.load(r):
            if t.get("type") == "page":
                return t
    raise SystemExit("aucun onglet")


async def main():
    t = await onglet()
    async with websockets.connect(t["webSocketDebuggerUrl"], max_size=None) as ws:
        n = [0]

        async def ev(expr, wait=0):
            n[0] += 1
            await ws.send(json.dumps({
                "id": n[0], "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": True}}))
            while True:
                m = json.loads(await ws.recv())
                if m.get("id") == n[0]:
                    if wait:
                        await asyncio.sleep(wait)
                    return m.get("result", {}).get("result", {}).get("value")

        await ws.send(json.dumps({"id": 1, "method": "Page.navigate",
                                  "params": {"url": PAGE}}))
        n[0] = 1
        await asyncio.sleep(5)
        print("pose:", await ev(JS_SPIKE))
        await asyncio.sleep(3)
        print(await ev(JS_LIRE))

asyncio.run(main())
