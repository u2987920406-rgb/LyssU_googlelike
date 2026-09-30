#!/usr/bin/env python3
"""Preuve des 2 nouveautés Ulysse (durée sous la bulle + status bar tokens).

Passe par les chemins RÉELS du code :
  · link._dispatch({method:"event"...}) — le même canal que le WebSocket ;
  · paintThread() / turnHTML() — le vrai rendu ;
  · majStatBar() — le vrai fetch /ulysse/stats sur la session réelle.
Les données d'entrée sont préparées comme un tour de 12,4 s (ts du tour
user reculé AVANT l'émission du complete) : c'est le code qui calcule,
pas le test.

Sorties : /tmp/feat-mobile.png + JSON de mesures + exceptions console.
"""
import asyncio, base64, json, urllib.request
import websockets

CDP = "http://127.0.0.1:9333"
PAGE = "http://127.0.0.1:8453/ulysse.html"
SID = "20260922_102527_909fab3a"

JS = """
(async () => {
  try {
    // — figer le lien : sans ça, un événement du WS réel repeint l'accueil
    //   entre le rendu et la capture (constaté au 1er essai). giveUp coupe
    //   aussi la reconnexion automatique. —
    link.giveUp = true;
    if (link.ws) link.ws.close();
    // — ET neutraliser les hooks d'écran de l'app : le close déclenche
    //   onChanged/onSystem qui repeignent (2e capture encore en accueil). —
    coreHooks.onChange = () => {};
    coreHooks.onChanged = () => {};
    coreHooks.onSystem = () => {};

    // — état fil visible (l'accueil masque le thread) —
    const p = document.getElementById("pDiscuter");
    p.classList.remove("accueil");
    conv.turns.length = 0;

    // — tour complet par le PROTOCOLE réel —
    const tour = newTurn("user", "mesure de duree");
    tour.ts = Date.now() - 12400;              // entrée : attente de 12,4 s
    link._dispatch({method:"event", params:{type:"message.start", payload:{}}});
    link._dispatch({method:"event", params:{type:"message.delta",
                    payload:{text:"Réponse de test : la durée se mesure ici."}}});
    link._dispatch({method:"event", params:{type:"message.complete",
                    payload:{status:"ok"}}});
    const res = conv.turns[conv.turns.length - 1];

    // — vraie status bar sur la session réelle —
    conv.sessionId = "{{SID}}";
    await majStatBar();

    /* — RENDU FINAL EN DERNIER : le listener d'écran de l'app (autre que
       coreHooks) repeint l'accueil quand il voit passer des événements —
       constaté : accueil_fin=true tant qu'on peignait avant son tour.
       `accueil` est la VARIABLE modèle qui pilote l'écran (majInvite la
       lit pour le placeholder) : toucher sans elle est annulé au render.
       Tout figé, modèle posé, on repeint ICI, en toute fin. — */
    accueil = false;
    p.classList.remove("accueil");
    document.getElementById("thread").innerHTML = "";
    if (typeof paintThread === "function") paintThread();
    if (typeof majInvite === "function") majInvite();

    const bulle = document.querySelector(".msg.ulysse .u-duree");
    const bar = document.getElementById("statbar");
    return JSON.stringify({
      duree_ms: res.duree === undefined ? null : res.duree,
      duree_dom: bulle ? bulle.textContent.trim() : "(absent)",
      duree_style: bulle ? (getComputedStyle(bulle).fontSize + " / " +
                    getComputedStyle(bulle).color) : "-",
      statbar: bar.textContent.trim(),
      statbar_display: bar.style.display || "(inline)",
      statbar_px: Math.round(bar.getBoundingClientRect().height * 10) / 10,
      accueil_fin: p.classList.contains("accueil"),
      placeholder: (document.getElementById("reply") || {}).placeholder || "?"
    });
  } catch (e){ return JSON.stringify({erreur: String(e)}); }
})()
""".replace("{{SID}}", SID)


def onglet():
    with urllib.request.urlopen(CDP + "/json/list") as r:
        for t in json.load(r):
            if t.get("type") == "page":
                return t
    raise SystemExit("aucun onglet")


async def main():
    t = onglet()
    erreurs = []
    async with websockets.connect(t["webSocketDebuggerUrl"], max_size=None) as ws:
        n = [0]

        async def cmd(method, params=None):
            n[0] += 1
            await ws.send(json.dumps({"id": n[0], "method": method,
                                      "params": params or {}}))
            while True:
                m = json.loads(await ws.recv())
                if m.get("method") == "Runtime.exceptionThrown":
                    d = m["params"]["exceptionDetails"]
                    erreurs.append(d.get("text", "?"))
                    continue
                if m.get("id") == n[0]:
                    return m.get("result", {})

        await cmd("Runtime.enable")
        await cmd("Page.enable")
        await cmd("Page.navigate", {"url": PAGE})
        for _ in range(60):
            r = await cmd("Runtime.evaluate",
                          {"expression": "document.readyState",
                           "returnByValue": True})
            if r.get("result", {}).get("value") == "complete":
                break
            await asyncio.sleep(0.25)
        await asyncio.sleep(3.5)          # hydratation + boot JS

        r = await cmd("Runtime.evaluate", {"expression": JS,
                                           "returnByValue": True,
                                           "awaitPromise": True})
        val = r.get("result", {}).get("value")
        print("mesures:", val)

        await asyncio.sleep(0.12)         # rendu, avant tout repaint
        n[0] += 1
        await ws.send(json.dumps({"id": n[0], "method": "Page.captureScreenshot",
                                  "params": {"format": "png", "fromSurface": True}}))
        while True:
            m = json.loads(await ws.recv())
            if m.get("id") == n[0]:
                with open("/tmp/feat-mobile.png", "wb") as f:
                    f.write(base64.b64decode(m["result"]["data"]))
                break
        print("capture: /tmp/feat-mobile.png")
    print("exceptions_console:", erreurs if erreurs else "aucune")

asyncio.run(main())
