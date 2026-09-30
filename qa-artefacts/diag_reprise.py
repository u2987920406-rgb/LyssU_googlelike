#!/usr/bin/env python3
"""Diagnostic fin de la reprise : état serveur À CHAQUE étape + erreur resume."""
import asyncio, json, urllib.request
import websockets

CDP = "http://127.0.0.1:9333"
PAGE = "http://127.0.0.1:8453/ulysse.html"

def etat_serveur():
    with urllib.request.urlopen("http://127.0.0.1:8453/ulysse/etat", timeout=5) as r:
        return json.loads(r.read())

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
        return {"EXC": str(r["exceptionDetails"])[:300]}
    return r.get("result", {}).get("value")

async def main():
    t = json.loads(urllib.request.urlopen(CDP + "/json/list").read())
    t = [x for x in t if x.get("type") == "page"][0]
    async with websockets.connect(t["webSocketDebuggerUrl"], max_size=None) as ws:
        n = [0]
        await appel(ws, n, "Page.enable")
        await appel(ws, n, "Runtime.enable")

        # ── étape 1 : boot sur une page saine, prompt réel ──
        await appel(ws, n, "Page.navigate", {"url": PAGE})
        await asyncio.sleep(4)
        await ev(ws, n, 'submitPrompt("Reponds uniquement par OK.", {})'
                        '.then(() => "ok").catch((e) => "ERR:" + e.message)')
        for _ in range(90):
            await asyncio.sleep(1)
            fini = await ev(ws, n, 'conv.running===false && conv.turns.length>=2'
                                   ' && conv.turns[conv.turns.length-1].state!=="streaming"'
                                   ' ? 1 : null')
            if fini:
                break
        sid = await ev(ws, n, "conv.sessionId")
        stored = await ev(ws, n, "conv.storedId")
        print("1) après prompt — sid:", sid, "stored:", stored)
        print("2) état serveur juste APRÈS le prompt:",
              json.dumps(etat_serveur(), ensure_ascii=False))
        etat_after_prompt = etat_serveur()

        # ── étape 2 : quitter, revenir ──
        await appel(ws, n, "Page.navigate", {"url": "about:blank"})
        await asyncio.sleep(1.5)
        await appel(ws, n, "Page.navigate", {"url": PAGE})
        # état de la page au BOOT (avant/après ouverture())
        await asyncio.sleep(2.5)
        print("3) page à t+2.5s — etatPrecedent:",
              json.dumps(await ev(ws, n, "etatPrecedent"), ensure_ascii=False),
              "| conv.storedId:", await ev(ws, n, "conv.storedId"))

        # ── étape 3 : forcer le resume à la main et lire l'erreur EXACTE ──
        print("4) appel direct de resumeSession :",
              await ev(ws, n,
                  'resumeSession(%s).then((r) => "OK session=" + r.session_id)'
                  '.catch((e) => "ECHEC: " + (e && e.message ? e.message : String(e)))'
                  % json.dumps(etat_after_prompt.get("etat", {}).get("derniere_session") or "")))
        await asyncio.sleep(1.5)
        print("5) page APRÈS resume forcé:",
              json.dumps(await ev(ws, n,
                  'JSON.stringify({accueil: accueil, tours: conv.turns.length,'
                  ' storedId: conv.storedId, sessionId: conv.sessionId})'), ensure_ascii=False))
        print("6) état serveur final:", json.dumps(etat_serveur(), ensure_ascii=False))

asyncio.run(main())
