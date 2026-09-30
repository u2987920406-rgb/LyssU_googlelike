#!/usr/bin/env python3
"""Symptôme Raf : « je ne vois plus la question, que la réponse ».

Reproduction fidèle : session LIVE avec PLUSIEURS questions, quitter,
revenir, mesurer le fil restauré (DOM + conv.turns) et inspecter la
payload de session.resume (roles de messages).
"""
import asyncio, base64, json, urllib.request
import websockets

CDP = "http://127.0.0.1:9333"
PAGE = "http://127.0.0.1:8453/ulysse.html"

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
        return {"EXC": str(r["exceptionDetails"].get("exception", {}).get("description", "?"))[:400]}
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

async def tour(ws, n, texte):
    await ev(ws, n, f'submitPrompt({json.dumps(texte)}, {{}}).then(()=>"ok")'
                    '.catch((e)=>"ERR:"+e.message)')
    for _ in range(90):
        await asyncio.sleep(1)
        ok = await ev(ws, n, 'conv.running===false && conv.turns.length>=2'
                             ' && conv.turns[conv.turns.length-1].state!=="streaming"'
                             ' && (conv.turns[conv.turns.length-1].text||"").length>0 ? 1 : null')
        if ok:
            return True
    return False

async def main():
    t = [x for x in json.loads(urllib.request.urlopen(CDP + "/json/list").read())
         if x.get("type") == "page"][0]
    async with websockets.connect(t["webSocketDebuggerUrl"], max_size=None) as ws:
        n = [0]
        await appel(ws, n, "Page.enable")
        await appel(ws, n, "Runtime.enable")

        await appel(ws, n, "Page.navigate", {"url": PAGE})
        await asyncio.sleep(4)
        # ── 3 questions successives (session live, comme Raf) ──
        ok1 = await tour(ws, n, "Question 1 : dis bonjour en un mot.")
        ok2 = await tour(ws, n, "Question 2 : dis au revoir en un mot.")
        ok3 = await tour(ws, n, "Question 3 : dis merci en un mot.")
        print("tours finis:", ok1, ok2, ok3)
        avant = json.loads(await ev(ws, n, """JSON.stringify({
          tours: conv.turns.length,
          roles: conv.turns.map((t) => t.role + ":" + (t.text||"").slice(0,25)),
          domYou: document.querySelectorAll(".msg.you").length,
          domUlysse: document.querySelectorAll(".msg.ulysse").length
        })"""))
        print("AVANT partir:", json.dumps(avant, ensure_ascii=False, indent=1))
        stored = await ev(ws, n, "conv.storedId")
        print("stored:", stored)
        await capturer(ws, n, "/tmp/q-avant.png")

        # ── quitter / revenir ──
        await appel(ws, n, "Page.navigate", {"url": "about:blank"})
        await asyncio.sleep(1.5)
        await appel(ws, n, "Page.navigate", {"url": PAGE})
        rep = None
        for _ in range(15):
            await asyncio.sleep(1)
            etat = await ev(ws, n, "accueil")
            if etat is False:
                rep = json.loads(await ev(ws, n, """JSON.stringify({
                  tours: conv.turns.length,
                  roles: conv.turns.map((t) => t.role + ":" + (t.text||"").slice(0,25)),
                  domYou: document.querySelectorAll(".msg.you").length,
                  domUlysse: document.querySelectorAll(".msg.ulysse").length
                })"""))
                break
        print("APRÈS revenir:", json.dumps(rep, ensure_ascii=False, indent=1))
        await capturer(ws, n, "/tmp/q-apres.png")

        # ── inspecter la payload brute du resume (si le fil est incomplet) ──
        payload = await ev(ws, n,
            f'resumeSession({json.dumps(stored)}).then((r) => JSON.stringify({{'
            ' n: (r.messages||[]).length,'
            ' roles: (r.messages||[]).map((m) => m.role + "|" + String(m.text || "").slice(0,25))'
            '}})).catch((e) => "ERR:" + e.message)')
        print("PAYLOAD resume:", payload)

asyncio.run(main())
