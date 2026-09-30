#!/usr/bin/env python3
"""Rafale de questions : Q2 envoyée PENDANT le tour de Q1 (user;user).
Après quitter/revenir, les deux questions sont-elles encore dans le fil ?"""
import asyncio, base64, json, urllib.request
import websockets

CDP = "http://127.0.0.1:9333"
PAGE = "http://127.0.0.1:8453/ulysse.html"

JS_MESURE = """JSON.stringify({
  tours: conv.turns.length,
  roles: conv.turns.map((t) => t.role + ":" + (t.text || "").slice(0, 28)),
  domYou: document.querySelectorAll(".msg.you").length,
  domUlysse: document.querySelectorAll(".msg.ulysse").length
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

        # rafale : Q2 part PENDANT le tour de Q1
        await ev(ws, n, 'submitPrompt("Question A : dis bonjour en un mot.", {})'
                        '.then(()=>"ok").catch((e)=>"ERR:"+e.message)')
        await asyncio.sleep(3)
        # — Coupure WS SANS rechargement : le vrai flux de la capture —
        coup = await ev(ws, n, '(()=>{try{link.ws.close();return "closed"}'
                               'catch(e){return "ERR:"+e.message}})()')
        print("coupure WS:", coup)
        await asyncio.sleep(6)
        etat = await ev(ws, n,
            'JSON.stringify({sid: conv.sessionId, lien: link.state,'
            ' systemes: conv.turns.filter((t)=>t.role==="system").length})')
        print("etat apres coupure:", etat)
        await asyncio.sleep(40)   # tour finit cote serveur + reconnexion auto
        await ev(ws, n, 'submitPrompt("Question B : dis merci en un mot.", {})'
                        '.then(()=>"ok").catch((e)=>"ERR:"+e.message)')
        # attendre que les DEUX réponses soient finies
        for _ in range(120):
            await asyncio.sleep(1)
            v = await ev(ws, n,
                'conv.turns.length>=4 && conv.turns[conv.turns.length-1].role==="assistant"'
                ' && conv.turns[conv.turns.length-1].state!=="streaming"'
                ' && (conv.turns[conv.turns.length-1].text||"").length>0 ? 1 : null')
            if v == 1:
                break
        avant = json.loads(await ev(ws, n, JS_MESURE))
        print("MEME PAGE, apres Q2 (resume declenche en cours de session):")
        print(json.dumps(avant, ensure_ascii=False, indent=1))
        await capturer(ws, n, "/tmp/coupure-meme-page.png")

        await appel(ws, n, "Page.navigate", {"url": "about:blank"})
        await asyncio.sleep(1.5)
        await appel(ws, n, "Page.navigate", {"url": PAGE})
        rep = None
        for _ in range(20):
            await asyncio.sleep(1)
            if await ev(ws, n, "accueil") is False:
                await asyncio.sleep(1.5)
                rep = json.loads(await ev(ws, n, JS_MESURE))
                break
        print("APRES reload :")
        print(json.dumps(rep, ensure_ascii=False, indent=1))
        await capturer(ws, n, "/tmp/coupure-apres.png")
        if rep:
            print(f"\n>>> questions (domYou) : {avant['domYou']} meme-page -> {rep['domYou']} apres reload"
                  f" | reponses : {avant['domUlysse']} -> {rep['domUlysse']}")

asyncio.run(main())
