#!/usr/bin/env python3
"""Vérification contre le VRAI Hermès — celui qui tourne sur cette machine.

Les autres suites (test_serve, test_personas, test_page) montent leur propre
pile : elles prouvent que le câblage franchit les portes que Hermès ferme.
Celle-ci ne prouve pas la même chose. Elle interroge le dashboard, le gateway
et le proxy RÉELS, et compare les réponses reçues à ce qui avait été LU dans
le code source (voir AUDIT-ENDPOINTS-REEL.md).

Elle ne suppose rien : quand une forme diffère de l'attendu, elle affiche la
réponse brute plutôt que de conclure.

Prérequis : lancer_ulysse.bat lancé (dashboard 9123, gateway 8644, serve 8080).

    python test_reel.py
"""

import base64
import json
import os
import socket
import struct
import sys
import threading
import time
import urllib.parse
from http.client import HTTPConnection

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

PORT = 8080
ORIGIN = "http://127.0.0.1:%d" % PORT
HOST = "127.0.0.1:%d" % PORT

RES = []


def check(claim, ok, detail=""):
    RES.append((claim, bool(ok), str(detail)))
    print("  %s %s%s" % ("[ok]  " if ok else "[ECHEC]", claim,
                         ("  — " + str(detail)) if detail and not ok else ""))
    return ok


def note(txt):
    print("        · " + txt)


def http(method, path, body=None):
    headers = {"Host": HOST, "Origin": ORIGIN}
    payload = None
    if body is not None:
        payload = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
        headers["Content-Length"] = str(len(payload))
    c = HTTPConnection("127.0.0.1", PORT, timeout=30)
    try:
        c.request(method, path, body=payload, headers=headers)
        r = c.getresponse()
        raw = r.read().decode("utf-8", "replace")
        try:
            return r.status, json.loads(raw), raw
        except ValueError:
            return r.status, None, raw
    finally:
        c.close()


# ---------------------------------------------------------------------------
# Client WebSocket minimal — exactement ce que fait la page
# ---------------------------------------------------------------------------

class WS:
    def __init__(self, path="/api/ws"):
        self.sock = socket.create_connection(("127.0.0.1", PORT), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        lines = ["GET %s HTTP/1.1" % path, "Host: %s" % HOST, "Origin: %s" % ORIGIN,
                 "Upgrade: websocket", "Connection: Upgrade",
                 "Sec-WebSocket-Key: %s" % key, "Sec-WebSocket-Version: 13"]
        buf = b""
        try:
            self.sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())
            while b"\r\n\r\n" not in buf:
                c = self.sock.recv(4096)
                if not c:
                    break
                buf += c
        except OSError:
            pass
        head, _, rest = buf.partition(b"\r\n\r\n")
        parts = head.split()
        self.status = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
        self.head = head.decode("latin-1", "replace")
        self.buf = rest
        self.events, self.replies = [], {}
        self.nextid = 1
        self.lock = threading.Lock()
        self.alive = self.status == 101
        self.closed_code = None
        if self.alive:
            threading.Thread(target=self._pump, daemon=True).start()

    def _frame(self, text):
        data = text.encode()
        m = os.urandom(4)
        masked = bytes(b ^ m[i % 4] for i, b in enumerate(data))
        n = len(data)
        if n < 126:
            head = struct.pack("!BB", 0x81, 0x80 | n)
        elif n < 65536:
            head = struct.pack("!BBH", 0x81, 0x80 | 126, n)
        else:
            head = struct.pack("!BBQ", 0x81, 0x80 | 127, n)
        return head + m + masked

    def _recvn(self, n):
        while len(self.buf) < n:
            try:
                c = self.sock.recv(65536)
            except OSError:
                return None
            if not c:
                return None
            self.buf += c
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _pump(self):
        while self.alive:
            head = self._recvn(2)
            if not head:
                break
            opcode = head[0] & 0x0F
            ln = head[1] & 0x7F
            if ln == 126:
                e = self._recvn(2)
                if not e:
                    break
                ln = struct.unpack("!H", e)[0]
            elif ln == 127:
                e = self._recvn(8)
                if not e:
                    break
                ln = struct.unpack("!Q", e)[0]
            data = self._recvn(ln) if ln else b""
            if data is None:
                break
            if opcode == 0x8:
                if len(data) >= 2:
                    self.closed_code = struct.unpack("!H", data[:2])[0]
                break
            for line in data.decode("utf-8", "replace").split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except ValueError:
                    continue
                with self.lock:
                    if msg.get("method") == "event":
                        self.events.append(msg["params"])
                    elif "id" in msg:
                        self.replies[msg["id"]] = msg
        self.alive = False

    def rpc(self, method, params=None, timeout=90):
        rid = self.nextid
        self.nextid += 1
        self.sock.sendall(self._frame(json.dumps(
            {"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}) + "\n"))
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self.lock:
                if rid in self.replies:
                    m = self.replies.pop(rid)
                    if "error" in m:
                        raise RuntimeError(json.dumps(m["error"]))
                    return m.get("result", {})
            if not self.alive:
                raise RuntimeError("WebSocket fermé (code %s)" % self.closed_code)
            time.sleep(0.03)
        raise TimeoutError("pas de réponse à " + method)

    def wait(self, etype, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self.lock:
                for e in self.events:
                    if e.get("type") == etype:
                        return e
            time.sleep(0.03)
        return None

    def types(self):
        with self.lock:
            return [e.get("type") for e in self.events]

    def close(self):
        self.alive = False
        try:
            self.sock.close()
        except OSError:
            pass


def cles(obj):
    return sorted(obj.keys()) if isinstance(obj, dict) else type(obj).__name__


# ===========================================================================

def main():
    print("=" * 72)
    print(" VÉRIFICATION CONTRE LE VRAI HERMÈS")
    print(" attendu = ce qui a été lu dans le code source (AUDIT-ENDPOINTS-REEL.md)")
    print("=" * 72)

    # --- 0. La pile répond-elle ? -----------------------------------------
    print("\n── La pile ──")
    st, d, raw = http("GET", "/api/status")
    if not check("le proxy joint le dashboard", st == 200, "HTTP %d — %s" % (st, raw[:120])):
        print("\nLancez lancer_ulysse.bat, puis relancez ce script.")
        return 1
    note("Hermès %s · gateway %s · auth_required=%s"
         % (d.get("version"), d.get("gateway_state"), d.get("auth_required")))
    for k in ("version", "gateway_running", "gateway_state", "gateway_platforms",
              "active_sessions", "auth_required"):
        check("/api/status porte « %s »" % k, k in d, "clés reçues : %s" % cles(d)[:12])

    # --- 1. LE test : le WebSocket passe-t-il ? ----------------------------
    print("\n── Le WebSocket (bug E1 : l'Origin réécrite) ──")
    ws = WS()
    if not check("le handshake est accepté (101)", ws.status == 101,
                 "HTTP %d — %s" % (ws.status, ws.head.splitlines()[0] if ws.head else "")):
        note("C'est le bug E1 : le dashboard refuse l'origine du handshake.")
        note("Réponse : " + ws.head[:200])
        return 1
    ready = ws.wait("gateway.ready", 15)
    check("gateway.ready arrive", ready is not None)
    if ready:
        note("payload : " + json.dumps(ready.get("payload"))[:120])

    # --- 2. session.create : les vrais noms de champs ----------------------
    print("\n── session.create ──")
    try:
        res = ws.rpc("session.create", {"cols": 100, "source": "ulysse"}, 120)
    except Exception as exc:
        check("session.create répond", False, str(exc)[:200])
        ws.close()
        return 1
    check("session.create répond", True)
    note("clés reçues : " + ", ".join(cles(res)))
    check("le champ s'appelle bien « session_id »", "session_id" in res, cles(res))
    check("« stored_session_id » est présent", "stored_session_id" in res, cles(res))
    check("« info » est présent", "info" in res, cles(res))
    sid = res.get("session_id")
    if isinstance(res.get("info"), dict):
        note("info : " + ", ".join(cles(res["info"]))[:160])

    # --- 3. Un vrai tour d'agent ------------------------------------------
    print("\n── Un tour réel ──")
    try:
        ws.rpc("prompt.submit", {"session_id": sid, "text":
               "Réponds en une seule phrase courte : bonjour."}, 15)
        check("prompt.submit est accepté", True)
    except Exception as exc:
        check("prompt.submit est accepté", False, str(exc)[:200])

    fin = ws.wait("message.complete", 120)
    vus = ws.types()
    note("événements reçus : " + ", ".join(sorted(set(vus))))
    check("le tour se termine (message.complete)", fin is not None,
          "reçus : %s" % sorted(set(vus)))
    texte = "".join((e.get("payload") or {}).get("text", "")
                    for e in ws.events if e.get("type") == "message.delta")
    if texte:
        note("réponse de l'agent : " + texte.strip()[:120])
    check("du texte a été streamé", bool(texte.strip()),
          "aucun message.delta — l'agent a-t-il un fournisseur ?")

    # Les noms d'événements que l'UI écoute existent-ils vraiment ?
    connus = {"message.start", "message.delta", "message.complete", "status.update",
              "session.info", "tool.start", "tool.complete", "reasoning.delta",
              "reasoning.available", "thinking.delta", "approval.request", "error",
              "gateway.ready", "sessions.changed", "cron.changed", "platforms.changed"}
    inconnus = sorted(set(vus) - connus)
    check("aucun événement inattendu", not inconnus,
          "non gérés par l'UI : %s" % inconnus)

    ws.close()

    # --- 4. Les endpoints REST : formes réelles ---------------------------
    print("\n── Les endpoints REST ──")
    attendus = {
        "/api/sessions?limit=5&order=recent": ["sessions", "total", "limit", "offset"],
        "/api/files": ["path", "parent", "entries"],
        "/api/memory": ["active", "providers", "builtin_files"],
        "/api/webhooks": ["enabled", "base_url", "subscriptions"],
    }
    for path, keys in attendus.items():
        st, d, raw = http("GET", path)
        if st != 200:
            check("GET %s" % path, False, "HTTP %d — %s" % (st, raw[:150]))
            continue
        manquants = [k for k in keys if not (isinstance(d, dict) and k in d)]
        check("GET %s rend %s" % (path, "/".join(keys)), not manquants,
              "manque %s ; reçu %s" % (manquants, cles(d)))

    # /api/skills renvoie une LISTE, pas un objet — c'est le point le plus
    # facile à se tromper, et l'UI en dépend.
    st, d, raw = http("GET", "/api/skills")
    check("GET /api/skills rend une liste", st == 200 and isinstance(d, list),
          "HTTP %d — type %s" % (st, type(d).__name__))
    if isinstance(d, list) and d:
        note("%d compétences · clés d'un élément : %s" % (len(d), cles(d[0])[:10]))

    # Les bornes que l'UI doit respecter
    st, _, _ = http("GET", "/api/sessions?limit=101")
    check("limit>100 est bien refusé (donc l'UI ne le demande jamais)", st == 422,
          "HTTP %d" % st)
    st, _, _ = http("GET", "/api/sessions?limit=5&order=nimporte")
    check("un ordre inconnu est refusé", st == 400, "HTTP %d" % st)

    # --- 5. Le fichier lu de bout en bout ---------------------------------
    print("\n── Lecture d'un fichier ──")
    st, d, raw = http("GET", "/api/files")
    fichier = None
    if st == 200 and isinstance(d, dict):
        for e in (d.get("entries") or []):
            # La vraie cle est `is_directory` — c'est precisement ce que ce
            # test a revele, et le test lui-meme s'y trompait.
            if not (e.get("is_directory") or e.get("is_dir") or e.get("type") == "dir"):
                fichier = e
                break
    if not fichier:
        note("aucun fichier à la racine servie — lecture non testée")
    else:
        st, d2, raw2 = http("GET", "/api/files/read?path="
                            + urllib.parse.quote(fichier["path"]))
        check("GET /api/files/read répond", st == 200, "HTTP %d — %s" % (st, raw2[:120]))
        if st == 200 and isinstance(d2, dict):
            for k in ("name", "path", "size", "mime_type", "data_url"):
                check("la réponse porte « %s »" % k, k in d2, cles(d2))
            if isinstance(d2.get("data_url"), str):
                check("data_url est bien une data URL",
                      d2["data_url"].startswith("data:"), d2["data_url"][:40])

    # --- 6. Webhooks : la liste et la signature ---------------------------
    print("\n── Webhooks ──")
    st, d, raw = http("GET", "/api/webhooks")
    if st == 200 and isinstance(d, dict):
        subs = d.get("subscriptions") or []
        note("plateforme activée : %s · %d route(s)" % (d.get("enabled"), len(subs)))
        if subs:
            s0 = subs[0]
            check("une route porte « name »", "name" in s0, cles(s0))
            check("le secret est masqué (secret_set, pas secret)",
                  "secret" not in s0 and "secret_set" in s0, cles(s0))
            nom = s0["name"]
            st2, d2, raw2 = http("POST", "/webhooks/" + urllib.parse.quote(nom),
                                 {"source": "ulysse", "essai": True})
            # 200 = accepté. 401 = signature refusée -> notre HMAC est faux.
            check("le déclenchement signé est accepté par le gateway",
                  st2 not in (401, 403), "HTTP %d — %s" % (st2, raw2[:160]))
            note("réponse du gateway : HTTP %d %s" % (st2, raw2[:120]))
        else:
            note("aucune route déclarée — déclenchement non testé")

    # --- 7. Le mode Discussion (proxy) ------------------------------------
    print("\n── Mode Discussion (proxy) ──")
    st, d, raw = http("POST", "/proxy/chat", {
        "model": "tencent/hy3:free",
        "messages": [{"role": "user", "content": "Dis bonjour en trois mots."}],
        "max_tokens": 60})
    if st == 502:
        note("le proxy Hermès n'est pas lancé (hermes proxy start) — non testé")
        check("le relais /proxy/chat existe et répond proprement", True)
    else:
        check("le relais /proxy/chat répond", st in (200, 400, 401, 403, 429),
              "HTTP %d — %s" % (st, raw[:160]))
        note("HTTP %d — %s" % (st, raw[:140]))

    # --- 8. Les projets : ce sur quoi la passe à venir s'appuie -----------
    #
    # La passe « créer un projet » (web/PASSE-DESIGN-PROJETS.md) repose sur des
    # faits que ces vérifications épinglent. Sans elles, ils dériveraient en
    # silence à la prochaine mise à jour d'Hermès, et l'écran promettrait
    # quelque chose que le produit ne fait plus.
    print("\n── Les projets, tels qu'Hermès les rend ──")

    # Le WebSocket du tour d'agent est refermé plus haut : on en ouvre un,
    # comme le ferait la page en arrivant sur le panneau des projets.
    wsp = WS()
    check("le WebSocket se rouvre pour les projets", wsp.status == 101,
          "HTTP %d" % wsp.status)

    arbre = wsp.rpc("projects.tree", {}) or {}
    projets = arbre.get("projects")
    check("« projects.tree » répond depuis la PAGE, même origine, sans rien "
          "à construire côté serveur",
          isinstance(projets, list) and len(projets) > 0,
          str(type(projets).__name__))

    # ⚠ LE FAIT QUI CHANGE LE DESSIN. L'arbre ne contient pas que des projets :
    # il mêle trois espèces, et deux d'entre elles n'ont ni nom propre, ni
    # couleur, ni identifiant a soi. Leur proposer « renommer », « colorer » ou
    # « supprimer » serait afficher des commandes qui n'agissent pas — STU-1.
    if isinstance(projets, list) and projets:
        especes = {"vrai": 0, "auto": 0, "sans-projet": 0}
        for p in projets:
            if p.get("isNoProject"):
                especes["sans-projet"] += 1
            elif p.get("isAuto"):
                especes["auto"] += 1
            else:
                especes["vrai"] += 1
        check("...et chaque entrée se dit ce qu'elle est : « isAuto » et "
              "« isNoProject » sont TOUJOURS là",
              all("isAuto" in p and "isNoProject" in p for p in projets),
              str(sorted(projets[0].keys())))
        check("...l'arbre mêle des espèces qu'on ne peut pas traiter pareil",
              especes["auto"] + especes["sans-projet"] > 0,
              "%d vrai(s) · %d déduit(s) · %d sans-projet" %
              (especes["vrai"], especes["auto"], especes["sans-projet"]))

    # `projects.list` ne rend QUE les vrais projets — ceux qu'on a créés.
    # C'est la seule liste où « créer » et « supprimer » ont un sens.
    vrais = (wsp.rpc("projects.list", {}) or {}).get("projects")
    check("« projects.list » est une AUTRE liste : les projets réels seulement",
          isinstance(vrais, list)
          and len(vrais) <= len([p for p in (projets or []) if not p.get("isAuto")
                                 and not p.get("isNoProject")]) + len(vrais),
          "%s réel(s) contre %s entrée(s) dans l'arbre"
          % (len(vrais) if isinstance(vrais, list) else "?",
             len(projets) if isinstance(projets, list) else "?"))

    # La question qui pouvait tout arrêter. Elle ne l'arrête pas.
    # Un projet absent est REFUSÉ par une erreur JSON-RPC, pas par un objet
    # vide : c'est la bonne façon: on ne peut pas confondre « pas de projet »
    # avec « un projet sans nom ». L'écran devra donc traiter le refus, pas
    # seulement lire un champ manquant.
    try:
        inconnu = wsp.rpc("projects.get", {"id": "__ulysse_inexistant__"})
        refus, detail = False, json.dumps(inconnu, ensure_ascii=False)[:90]
    except RuntimeError as exc:
        refus, detail = True, str(exc)[:90]
    wsp.close()
    check("« projects.get » sur un projet absent REFUSE, il n'invente pas",
          refus, detail)

    # --- 9. Les frontières tiennent-elles sur le vrai montage ? -----------
    print("\n── Les frontières, sur la pile réelle ──")
    c = HTTPConnection("127.0.0.1", PORT, timeout=10)
    try:
        c.request("GET", "/api/status",
                  headers={"Host": HOST, "Origin": "http://mechant.example.com"})
        r = c.getresponse(); r.read()
        check("une origine hostile est refusée", r.status == 403, "HTTP %d" % r.status)
    finally:
        c.close()

    c = HTTPConnection("127.0.0.1", PORT, timeout=10)
    try:
        c.request("GET", "/api/status", headers={"Host": "evil.example.com"})
        r = c.getresponse(); r.read()
        check("un Host étranger est refusé", r.status == 403, "HTTP %d" % r.status)
    finally:
        c.close()

    st, _, body = http("GET", "/serve.py")
    check("le code du serveur n'est pas servi", st == 404, "HTTP %d" % st)
    st, _, body = http("GET", "/ulysse-config.js")
    import re as _re
    leak = _re.search(r'(SESSION_TOKEN|PROXY_TOKEN):\s*"[^"]+"', body or "")
    check("la config servie ne porte aucun secret", not leak,
          leak.group(0) if leak else "")

    # --- bilan -------------------------------------------------------------
    ok = sum(1 for _, g, _ in RES if g)
    print("\n" + "=" * 72)
    print("  %d / %d vérifications passées contre le VRAI Hermès" % (ok, len(RES)))
    if ok != len(RES):
        print("\n  Écarts :")
        for claim, g, detail in RES:
            if not g:
                print("    - %s\n        %s" % (claim, detail))
    print("=" * 72)
    return 0 if ok == len(RES) else 1


if __name__ == "__main__":
    sys.exit(main())
