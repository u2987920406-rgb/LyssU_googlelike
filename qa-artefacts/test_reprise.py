#!/usr/bin/env python3
"""Test end-to-end « quitter la discussion et revenir » (Raf, 2026-09-24).

Cycle réel, sur le vrai canal :
  A. prompt VIA submitPrompt (vrai appel modèle) → sid + storedId relevés,
     état serveur vérifié (clé derniere_session).
  B. QUITTER pour de vrai : l'onglet part sur about:blank (ce que fait
     Android en tuant l'onglet).
  C. REVENIR : re-navigate sur Ulysse → boot → ouverture() → resumeSession.
     Critères : accueil=false, même storedId, les tours du fil sont LÀ,
     DOM contient la réponse.
  D. Deuxième cycle, pour montrer que ce n'est pas un hasard.

Sortie : JSON de mesures. Capture à chaque cycle.
"""
import asyncio, base64, json, urllib.request
import websockets

CDP = "http://127.0.0.1:9333"
PAGE = "http://127.0.0.1:8453/ulysse.html"

async def appel(ws, n, methode, params=None):
    n[0] += 1
    await ws.send(json.dumps({"id": n[0], "method": methode, "params": params or {}}))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("id") == n[0]:
            return msg.get("result", {})

async def eval_js(ws, n, expr):
    r = await appel(ws, n, "Runtime.evaluate",
                    {"expression": expr, "returnByValue": True, "awaitPromise": True})
    if "exceptionDetails" in r:
        return {"exception": r["exceptionDetails"].get("text", "?")}
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

JS_ETAT = """JSON.stringify({
  sessionId: conv.sessionId, storedId: conv.storedId,
  accueil: accueil, tours: conv.turns.length,
  dernier: (conv.turns.length ? conv.turns[conv.turns.length-1].text : "").slice(0,60),
  filDANS_DOM: (document.getElementById("thread")||{}).innerText ?
      (document.getElementById("thread").innerText.includes("OK") ||
       document.getElementById("thread").innerText.toLowerCase().includes("ok")) : null
})"""

async def onglet():
    with urllib.request.urlopen(CDP + "/json/list") as r:
        for t in json.load(r):
            if t.get("type") == "page":
                return t
    raise SystemExit("aucun onglet")

async def main():
    # onglet : on l'ouvre sur about:blank d'abord (page morte = état initial)
    t = await onglet()
    resultats = {"cycles": []}
    async with websockets.connect(t["webSocketDebuggerUrl"], max_size=None) as ws:
        n = [0]
        await appel(ws, n, "Page.enable")
        await appel(ws, n, "Runtime.enable")

        # ── CYCLE A : établir la conversation avec un vrai prompt ──
        await appel(ws, n, "Page.navigate", {"url": PAGE})
        await asyncio.sleep(4)
        # première vérif : on démarre à l'accueil (état initial propre)
        avant = await eval_js(ws, n, JS_ETAT)
        print("A1 avant prompt:", avant)
        # VRAI prompt sur le canal réel (un appel modèle du profil Ulysse)
        await eval_js(ws, n, 'submitPrompt("Reponds uniquement par OK.", {})'
                             '.then(() => "envoye").catch((e) => "ERREUR:" + e.message)')
        # attendre la fin du tour (max 90 s)
        fini = None
        for _ in range(90):
            await asyncio.sleep(1)
            fini = await eval_js(ws, n,
                'conv.running === false && conv.turns.length >= 2 &&'
                ' conv.turns[conv.turns.length-1].role === "assistant" &&'
                ' conv.turns[conv.turns.length-1].state !== "streaming" ? "oui" : null')
            if fini:
                break
        etat_a = json.loads(await eval_js(ws, n, JS_ETAT))
        etat_a["tour_fin"] = fini
        print("A2 conversation etablie:", json.dumps(etat_a, ensure_ascii=False))
        resultats["etabli"] = etat_a
        await capturer(ws, n, "/tmp/reprise-a.png")

        # ── CYCLE B+C : QUITTER (onglet parti) puis REVENIR ──
        for k in (1, 2):
            await appel(ws, n, "Page.navigate", {"url": "about:blank"})
            await asyncio.sleep(1.5)          # l'onglet est ailleurs : page morte
            await appel(ws, n, "Page.navigate", {"url": PAGE})
            await asyncio.sleep(4.5)          # boot + ouverture() + resume
            # laisser le resume se stabiliser
            rep = None
            for _ in range(12):
                await asyncio.sleep(1)
                rep = json.loads(await eval_js(ws, n, JS_ETAT))
                if rep.get("accueil") is False and rep.get("tours", 0) >= 2:
                    break
            rep["meme_stored"] = (rep.get("storedId") == etat_a.get("storedId"))
            rep["meme_session"] = (rep.get("sessionId") == etat_a.get("sessionId"))
            rep["snack"] = await eval_js(ws, n,
                'document.querySelector(".u-snack") ?'
                ' document.querySelector(".u-snack").textContent : "-"')
            print(f"C{k} retour:", json.dumps(rep, ensure_ascii=False))
            resultats["cycles"].append(rep)
            await capturer(ws, n, f"/tmp/reprise-c{k}.png")

        # état serveur final
        try:
            with urllib.request.urlopen("http://127.0.0.1:8453/ulysse/etat",
                                        timeout=5) as r:
                resultats["etat_serveur"] = json.loads(r.read())
        except Exception as e:
            resultats["etat_serveur"] = str(e)

    print("RESULTAT_JSON:", json.dumps(resultats, ensure_ascii=False))

asyncio.run(main())
