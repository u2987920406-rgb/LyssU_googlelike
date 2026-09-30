#!/usr/bin/env python3
"""File d'attente des coupures : refus remplacé par envoi automatique."""
import asyncio, base64, json, urllib.request
import websockets

CDP = "http://127.0.0.1:9333"
PAGE = "http://127.0.0.1:8453/ulysse.html"

JS_MESURE = """JSON.stringify({
  etat: link.state,
  file: fileAttente.length,
  erreurTours: conv.turns.filter((t)=>t.role==="error").length,
  attenteTours: conv.turns.filter((t)=>t.enAttente).length,
  dernierRole: conv.turns.length ? conv.turns[conv.turns.length-1].role : "-",
  dernierTexte: conv.turns.length ? (conv.turns[conv.turns.length-1].text||"").slice(0,40) : "",
  badge: (document.querySelector(".msg.you .u-duree")||{}).textContent || "(pas de badge)"
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

        # coupure SANS reconnexion auto (giveUp) pour figer l'état attente
        print("coupure:", await ev(ws, n,
            '(()=>{try{link.giveUp=true;link.ws.close();return "closed"}'
            'catch(e){return "ERR:"+e.message}})()'))
        await asyncio.sleep(2)
        print("envoi pendant coupure:",
              await ev(ws, n, 'submitPrompt("Question file attente : dis OK en un mot.", {})'
                              '.then(()=>"soumis").catch((e)=>"ERR:"+e.message)'))
        await asyncio.sleep(1.5)
        print("PENDANT attente:", await ev(ws, n, JS_MESURE))
        await capturer(ws, n, "/tmp/file-attente.png")

        # rebranchement force : la file doit se vider toute seule
        print("rebranchement:", await ev(ws, n,
            '(()=>{link.giveUp=false;try{link.connect();return "connect lance"}'
            'catch(e){return "ERR:"+e.message}})()'))
        reponse = None
        for _ in range(40):
            await asyncio.sleep(1)
            v = json.loads(await ev(ws, n, JS_MESURE))
            if v["file"] == 0 and v["attenteTours"] == 0 and v["etat"] == "open":
                # attendre que la reponse arrive vraiment
                if v["dernierRole"] == "assistant" and v["dernierTexte"]:
                    reponse = v
                    break
                reponse = v
        print("APRES rebranchement:", json.dumps(reponse, ensure_ascii=False, indent=1))
        await capturer(ws, n, "/tmp/file-apres.png")


asyncio.run(main())
