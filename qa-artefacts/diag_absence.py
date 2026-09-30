#!/usr/bin/env python3
"""Symptôme Raf : partir PENDANT le tour, revenir après la réponse.

Mesure : les questions (domYou) survivent-elles à la reprise quand la
réponse a été générée pendant l'absence ?
"""
import asyncio, base64, json, urllib.request
import websockets

CDP = "http://127.0.0.1:9333"
PAGE = "http://127.0.0.1:8453/ulysse.html"

JS_MESURE = """JSON.stringify({
  tours: conv.turns.length,
  roles: conv.turns.map((t) => t.role + ":" + (t.text || "").slice(0, 30)),
  domYou: document.querySelectorAll(".msg.you").length,
  domUlysse: document.querySelectorAll(".msg.ulysse").length,
  textesYou: Array.from(document.querySelectorAll(".msg.you .u-md, .msg.you p"))
      .map((e) => e.textContent.slice(0, 30))
})"""

async def appel(ws, n, m, p=None):
    n[0] += 1
    await ws.send(json.dumps({"id": n[0], "method": m, "params": p or {}}))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("id") == n[0]:
            return msg.get("result", {})

async def ev(ws, n, expr):
    r = await appel(ws, n, "Runtime.evaluate",
                    {"expression": expr, "returnByValue": True, "awaitPromise": True})
    if "exceptionDetails" in r:
        return "EXC: " + str(r["exceptionDetails"])[:300]
    return r.get("result", {}).get("value")

async def capturer(ws, n, chemin):
    n[0] += 1
    await ws.send(json.dumps({"id": n[0], "method": "Page.captureScreenshot",
                              "params": {"format": "png", "fromSurface": True}}))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("id") == n[0]:
            with open(chemin, "wb") as f:
                f.write(base64.b64decode(msg["result"]["data"]))
            return chemin

async def main():
    t = [x for x in json.loads(urllib.request.urlopen(CDP + "/json/list").read())
         if x.get("type") == "page"][0]
    async with websockets.connect(t["webSocketDebuggerUrl"], max_size=None) as ws:
        n = [0]
        await appel(ws, n, "Page.enable")
        await appel(ws, n, "Runtime.enable")
        await appel(ws, n, "Page.navigate", {"url": PAGE})
        await asyncio.sleep(4)

        # 1) question dont le tour est LONG (le temps de partir pendant)
        await ev(ws, n, 'submitPrompt("Question 1 : dis bonjour en un mot.", {})'
                        '.then(() => "ok").catch((e) => "ERR:" + e.message)')
        # on part IMMÉDIATEMENT, en plein tour (le tour continue côté serveur)
        await appel(ws, n, "Page.navigate", {"url": "about:blank"})
        print("parti pendant le tour de Q1")
        # on laisse le tour finir côté serveur (grâce 600 s)
        await asyncio.sleep(40)
        # 2) retour
        await appel(ws, n, "Page.navigate", {"url": PAGE})
        rep = None
        for _ in range(20):
            await asyncio.sleep(1)
            if await ev(ws, n, "accueil") is False:
                await asyncio.sleep(1)
                rep = json.loads(await ev(ws, n, JS_MESURE))
                break
        print("RETOUR (Q1 générée pendant l'absence):")
        print(json.dumps(rep, ensure_ascii=False, indent=1))
        await capturer(ws, n, "/tmp/absence-1.png")

        # 3) deuxième cycle : question ENCORE EN COURS quand on part
        await ev(ws, n, 'submitPrompt("Question 2 : fais une réponse un peu '
                        'plus longue, 60 mots sur le ciel bleu.", {}).then(()=>"ok")'
                        '.catch((e) => "ERR:" + e.message)')
        await asyncio.sleep(2)          # le tour démarre
        await appel(ws, n, "Page.navigate", {"url": "about:blank"})
        print("parti pendant le tour de Q2")
        await asyncio.sleep(60)
        await appel(ws, n, "Page.navigate", {"url": PAGE})
        rep2 = None
        for _ in range(20):
            await asyncio.sleep(1)
            if await ev(ws, n, "accueil") is False:
                await asyncio.sleep(1)
                rep2 = json.loads(await ev(ws, n, JS_MESURE))
                break
        print("RETOUR 2 (Q2 générée pendant l'absence):")
        print(json.dumps(rep2, ensure_ascii=False, indent=1))
        await capturer(ws, n, "/tmp/absence-2.png")

asyncio.run(main())
