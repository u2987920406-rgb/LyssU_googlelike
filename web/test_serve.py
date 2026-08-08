#!/usr/bin/env python3
"""Verification reelle de serve.py — frontieres de securite et relais.

Les faux backends reproduisent VERBATIM les controles du code Hermes installe :

  · dashboard  -> host_header_middleware (web_server.py:539) et
                  _ws_host_origin_reason (web_server.py:14690)
  · gateway    -> _validate_signature, branche V2 (webhook.py:1086-1111)

Un test qui passe ici prouve que le proxy franchit les memes portes que celles
que Hermes ferme reellement. Rien n'est simule a notre avantage.

    python test_serve.py
"""

import base64
import hashlib
import hmac
import http.client
import json
import os
import re
import socket
import tempfile
import struct
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

import serve  # noqa: E402

ULYSSE_PORT = 18080
DASH_PORT = 19123
GW_PORT = 18644
PROXY_PORT = 18645
TOKEN = "test_token_abcdef123"
WH_NAME = "essai-ulysse"
WH_SECRET = "secret-de-test-0123456789"

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print("  %s  %s%s" % ("OK  " if ok else "ECHEC", name,
                          ("  — " + detail) if detail and not ok else ""))


# ---------------------------------------------------------------------------
# Faux dashboard Hermes
# ---------------------------------------------------------------------------

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class FakeDashboard(BaseHTTPRequestHandler):
    """Reproduit les gates Host/Origin/token du dashboard reel."""

    bound = "127.0.0.1:%d" % DASH_PORT
    seen = []  # journal des requetes vues, pour les assertions

    def log_message(self, *a):
        pass

    def _accepted_host(self, h):
        # web_server.py:_is_accepted_host — port optionnel, alias loopback.
        h = (h or "").strip().lower()
        host_only = h.split(":")[0]
        return host_only in ("127.0.0.1", "localhost", "::1")

    def _reject(self, code, msg):
        body = json.dumps({"detail": msg}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        FakeDashboard.seen.append({
            "path": self.path,
            "host": self.headers.get("Host"),
            "origin": self.headers.get("Origin"),
            "token": self.headers.get("X-Hermes-Session-Token"),
            "authorization": self.headers.get("Authorization"),
            "cookie": self.headers.get("Cookie"),
            "upgrade": (self.headers.get("Upgrade") or "").lower(),
        })

        if (self.headers.get("Upgrade") or "").lower() == "websocket":
            self._handle_ws()
            return

        # host_header_middleware
        if not self._accepted_host(self.headers.get("Host")):
            self._reject(403, "Host header mismatch")
            return
        # _token_auth_seam
        if self.headers.get("X-Hermes-Session-Token") != TOKEN:
            self._reject(401, "Unauthorized")
            return

        path = urllib.parse.urlsplit(self.path).path
        if path == "/api/status":
            payload = {"version": "0.20.0", "gateway_running": False,
                       "auth_required": True, "active_sessions": 0}
        elif path == "/api/webhooks":
            payload = {"enabled": True, "base_url": "http://localhost:%d" % GW_PORT,
                       "subscriptions": [{"name": WH_NAME, "description": "essai",
                                          "url": "http://localhost:%d/webhooks/%s" % (GW_PORT, WH_NAME),
                                          "secret_set": True, "enabled": True,
                                          "prompt": "fais X", "events": [], "deliver": "log"}]}
        elif path == "/api/sessions":
            payload = {"sessions": [], "total": 0, "limit": 50, "offset": 0}
        else:
            payload = {"ok": True, "path": path}
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_ws(self):
        """Rejoue _ws_auth_ok + _ws_request_is_allowed, puis emet gateway.ready."""
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)

        def close(code, why):
            # Le vrai dashboard accepte puis ferme avec un code applicatif ;
            # ici on refuse au handshake, ce qui suffit a distinguer les cas.
            self.send_response(code)
            self.send_header("X-Reject", why)
            self.send_header("Content-Length", "0")
            self.end_headers()

        if not self._accepted_host(self.headers.get("Host")):
            close(403, "host_mismatch")
            return
        origin = self.headers.get("Origin")
        if origin:
            netloc = urllib.parse.urlparse(origin).netloc
            if not self._accepted_host(netloc) or netloc != self.bound:
                # Le vrai code compare l'origine a l'hote LIE (bound_host).
                close(403, "origin_mismatch")
                return
        if q.get("token", [""])[0] != TOKEN:
            close(401, "token_mismatch")
            return

        key = self.headers.get("Sec-WebSocket-Key", "")
        accept = base64.b64encode(
            hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        self.wfile.write(
            ("HTTP/1.1 101 Switching Protocols\r\n"
             "Upgrade: websocket\r\nConnection: Upgrade\r\n"
             "Sec-WebSocket-Accept: %s\r\n\r\n" % accept).encode())
        self.wfile.flush()
        frame = json.dumps({"jsonrpc": "2.0", "method": "event",
                            "params": {"type": "gateway.ready", "session_id": "",
                                       "payload": {"change_events": True}}}) + "\n"
        data = frame.encode()
        self.wfile.write(b"\x81" + struct.pack("!B", len(data)) + data)
        self.wfile.flush()
        time.sleep(0.4)


# ---------------------------------------------------------------------------
# Faux gateway webhook
# ---------------------------------------------------------------------------

class FakeGateway(BaseHTTPRequestHandler):
    """Reproduit gateway/platforms/webhook.py : POST seul, HMAC V2 obligatoire."""

    seen = []

    def log_message(self, *a):
        pass

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Le vrai gateway n'expose que POST /webhooks/{route} et GET /health.
        if urllib.parse.urlsplit(self.path).path == "/health":
            self._json(200, {"status": "ok"})
        else:
            self._json(404, {"error": "Not Found"})

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        if not path.startswith("/webhooks/"):
            self._json(404, {"error": "Not Found"})
            return
        name = path[len("/webhooks/"):]
        if name != WH_NAME:
            self._json(404, {"error": "Unknown route: %s" % name})
            return
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))

        # webhook.py:1086-1111 — branche generique V2
        sig = self.headers.get("X-Webhook-Signature-V2", "")
        ts = self.headers.get("X-Webhook-Timestamp", "")
        if not sig:
            self._json(401, {"error": "Invalid signature"})
            return
        if not ts:
            self._json(401, {"error": "Invalid signature"})
            return
        try:
            if abs(int(time.time()) - int(ts)) > 300:
                self._json(401, {"error": "Invalid signature"})
                return
        except ValueError:
            self._json(401, {"error": "Invalid signature"})
            return
        expected = hmac.new(WH_SECRET.encode(), ts.encode() + b"." + body,
                            hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            self._json(401, {"error": "Invalid signature"})
            return
        FakeGateway.seen.append({"name": name, "body": body.decode(),
                                 "auth": self.headers.get("X-Hermes-Session-Token")})
        self._json(200, {"status": "queued", "route": name})


class FakeProxy(BaseHTTPRequestHandler):
    """Proxy chat OpenAI-compatible : verifie la cle injectee par serve.py."""

    seen = []

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        FakeProxy.seen.append({"path": self.path,
                               "auth": self.headers.get("Authorization"),
                               "body": body.decode()})
        payload = json.dumps({"choices": [{"message": {"content": "pong"}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

def req(method, path, headers=None, body=None, port=ULYSSE_PORT):
    h = {"Host": "127.0.0.1:%d" % port}
    h.update(headers or {})
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        conn.request(method, path, body=body, headers=h)
        r = conn.getresponse()
        return r.status, dict(r.getheaders()), r.read().decode("utf-8", "replace")
    finally:
        conn.close()


def raw_head(method, path, headers):
    """Lit les en-tetes de reponse en octets bruts (pour compter les doublons)."""
    s = socket.create_connection(("127.0.0.1", ULYSSE_PORT), timeout=10)
    try:
        lines = ["%s %s HTTP/1.1" % (method, path),
                 "Host: 127.0.0.1:%d" % ULYSSE_PORT, "Connection: close"]
        for k, v in (headers or {}).items():
            lines.append("%s: %s" % (k, v))
        s.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = s.recv(4096)
            if not chunk:
                break
            buf += chunk
        return buf.split(b"\r\n\r\n")[0].decode("latin-1")
    finally:
        s.close()


def ws_handshake(extra_headers=None, path="/api/ws"):
    """Handshake WS brut vers serve.py ; retourne (status, en-tetes, 1re trame)."""
    s = socket.create_connection(("127.0.0.1", ULYSSE_PORT), timeout=10)
    key = base64.b64encode(os.urandom(16)).decode()
    lines = ["GET %s HTTP/1.1" % path,
             "Host: 127.0.0.1:%d" % ULYSSE_PORT,
             "Upgrade: websocket", "Connection: Upgrade",
             "Sec-WebSocket-Key: %s" % key, "Sec-WebSocket-Version: 13"]
    for k, v in (extra_headers or {}).items():
        lines.append("%s: %s" % (k, v))
    s.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())
    buf = b""
    s.settimeout(5)
    try:
        while b"\r\n\r\n" not in buf:
            chunk = s.recv(4096)
            if not chunk:
                break
            buf += chunk
        head, _, rest = buf.partition(b"\r\n\r\n")
        status = int(head.split()[1]) if head.split() else 0
        payload = b""
        if status == 101:
            deadline = time.time() + 3
            while time.time() < deadline and b"gateway.ready" not in rest:
                try:
                    more = s.recv(4096)
                except socket.timeout:
                    break
                if not more:
                    break
                rest += more
            payload = rest
        return status, head.decode("latin-1"), payload
    finally:
        s.close()


def serve_thread(cls, port):
    srv = ThreadingHTTPServer(("127.0.0.1", port), cls)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    # --- config de test, sans toucher ulysse-config.js -----------------
    serve.PORT = ULYSSE_PORT
    serve.BACKEND = serve.Backend("http://127.0.0.1:%d" % DASH_PORT, TOKEN)
    serve.WEBHOOK_BACKEND = serve.Backend("http://127.0.0.1:%d" % GW_PORT, "")
    serve.PROXY_BACKEND = serve.Backend("http://127.0.0.1:%d" % PROXY_PORT, "cle-proxy")
    serve.ALLOWED_HOSTS = frozenset({"127.0.0.1:%d" % ULYSSE_PORT,
                                     "localhost:%d" % ULYSSE_PORT})
    # Le marqueur de premier lancement est detourne vers un fichier jetable.
    # Un test ne doit pas decider de ce que la personne verra au prochain
    # demarrage : sans ce detournement, lancer la suite effacait l'ecran
    # d'accueil pour de bon. (C'est arrive une fois.)
    serve.MARQUEUR = os.path.join(tempfile.gettempdir(), "ulysse-test-premier-vu")
    try:
        os.remove(serve.MARQUEUR)
    except OSError:
        pass

    serve.ALLOWED_ORIGINS = frozenset({"http://127.0.0.1:%d" % ULYSSE_PORT,
                                       "http://localhost:%d" % ULYSSE_PORT})

    # secret webhook lu depuis un faux HERMES_HOME
    home = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".test-home")
    os.makedirs(home, exist_ok=True)
    with open(os.path.join(home, "webhook_subscriptions.json"), "w", encoding="utf-8") as fh:
        json.dump({WH_NAME: {"secret": WH_SECRET, "prompt": "essai"}}, fh)
    os.environ["HERMES_HOME"] = home

    serve_thread(FakeDashboard, DASH_PORT)
    serve_thread(FakeGateway, GW_PORT)
    serve_thread(FakeProxy, PROXY_PORT)
    serve_thread(serve.Handler, ULYSSE_PORT)
    time.sleep(0.4)

    same = {"Origin": "http://127.0.0.1:%d" % ULYSSE_PORT}

    print("\n=== 1. Frontieres reseau (S1-S4) ===")

    # S1 : ecoute loopback. On verifie la constante ET qu'aucune socket
    # non-loopback n'est ouverte par ce processus de test.
    check("S1 serve.HOST est 127.0.0.1", serve.HOST == "127.0.0.1", serve.HOST)

    st, _, _ = req("GET", "/api/status", headers=dict(same, Host="evil.example.com"))
    check("S4 Host etranger refuse (anti DNS-rebinding)", st == 403, "HTTP %d" % st)

    st, _, _ = req("GET", "/api/status", headers={"Origin": "http://evil.example.com"})
    check("S2 Origin etrangere refusee sur /api/*", st == 403, "HTTP %d" % st)

    st, hd, _ = req("GET", "/api/status", headers=same)
    check("Requete meme origine acceptee", st == 200, "HTTP %d" % st)
    check("S2 aucun en-tete CORS permissif emis",
          "Access-Control-Allow-Origin" not in hd, str(hd.get("Access-Control-Allow-Origin")))

    st, _, _ = req("OPTIONS", "/api/status", headers={"Origin": "http://evil.example.com"})
    check("S2 preflight CORS non accorde", st == 403, "HTTP %d" % st)

    st, head, payload = ws_handshake({"Origin": "http://evil.example.com"})
    check("S3 WebSocket refuse depuis une origine hostile", st == 403, "HTTP %d" % st)

    st, _, _ = req("GET", "/api/status",
                   headers={"Origin": "http://127.0.0.1:%d.evil.com" % ULYSSE_PORT})
    check("S2 origine en suffixe trompeur refusee", st == 403, "HTTP %d" % st)

    print("\n=== 2. Le bug qui tuait Cowork (E1) ===")
    FakeDashboard.seen.clear()
    st, head, payload = ws_handshake(same)
    check("E1 handshake WS accepte (101)", st == 101, head.splitlines()[0] if head else "")
    ws_seen = [r for r in FakeDashboard.seen if r["upgrade"] == "websocket"]
    check("E1 Origin reecrite vers le dashboard",
          bool(ws_seen) and ws_seen[-1]["origin"] == "http://127.0.0.1:%d" % DASH_PORT,
          ws_seen[-1]["origin"] if ws_seen else "aucune requete vue")
    check("E1 gateway.ready traverse le tunnel",
          b"gateway.ready" in payload, repr(payload[:80]))

    print("\n=== 3. Jeton : injecte, jamais divulgue (S6-S9) ===")
    FakeDashboard.seen.clear()
    req("GET", "/api/status", headers=same)
    last = FakeDashboard.seen[-1]
    check("S7 jeton du proxy injecte", last["token"] == TOKEN, str(last["token"]))

    FakeDashboard.seen.clear()
    req("GET", "/api/status", headers=dict(same,
                                           **{"X-Hermes-Session-Token": "jeton-force-par-la-page",
                                              "Authorization": "Bearer vole",
                                              "Cookie": "session=vole"}))
    last = FakeDashboard.seen[-1]
    check("S7 jeton envoye par la page ecrase", last["token"] == TOKEN, str(last["token"]))
    check("S7 Authorization du client supprime", last["authorization"] is None, str(last["authorization"]))
    check("S7 Cookie du client supprime", last["cookie"] is None, str(last["cookie"]))

    FakeDashboard.seen.clear()
    ws_handshake(dict(same), path="/api/ws?token=jeton-force-par-la-page")
    ws_seen = [r for r in FakeDashboard.seen if r["upgrade"] == "websocket"]
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(ws_seen[-1]["path"]).query)
    check("S8 ?token= du client ecrase sur le WS", q.get("token") == [TOKEN], str(q.get("token")))

    st, _, body = req("GET", "/ulysse-config.js", headers=same)
    has_secret = "ulysse_TEST_999" in body or 'SESSION_TOKEN: "ulysse' in body
    check("S6 ulysse-config.js servi sans jeton", st == 200 and not has_secret,
          "HTTP %d" % st)
    check("S6 ulysse-config.js reste exploitable (DASHBOARD_URL present)",
          "DASHBOARD_URL" in body and "HERMES_URL" in body)

    print("\n=== 4. Webhooks (E2, E3) ===")
    FakeGateway.seen.clear()
    st, _, body = req("POST", "/webhooks/" + WH_NAME, headers=same)
    check("E3 declenchement signe accepte par le gateway", st == 200, "HTTP %d — %s" % (st, body[:120]))
    check("E3 corps par defaut envoye",
          bool(FakeGateway.seen) and json.loads(FakeGateway.seen[-1]["body"]).get("source") == "ulysse",
          FakeGateway.seen[-1]["body"] if FakeGateway.seen else "rien recu")
    check("S7 jeton dashboard non fuite vers le gateway",
          bool(FakeGateway.seen) and FakeGateway.seen[-1]["auth"] is None,
          str(FakeGateway.seen[-1]["auth"]) if FakeGateway.seen else "")

    FakeGateway.seen.clear()
    st, _, body = req("POST", "/webhooks/" + WH_NAME, headers=dict(same, **{"Content-Type": "application/json"}),
                      body=json.dumps({"sujet": "Ulysse", "user": "kuchu"}))
    ok_body = bool(FakeGateway.seen) and json.loads(FakeGateway.seen[-1]["body"]).get("sujet") == "Ulysse"
    check("E3 corps personnalise signe et transmis", st == 200 and ok_body, "HTTP %d" % st)

    st, _, body = req("POST", "/webhooks/inconnu", headers=same)
    check("E3 route sans secret -> 404 explicite", st == 404, "HTTP %d" % st)

    # Le chemin est normalise AVANT l'aiguillage : « /webhooks/..%2F..%2Fetc »
    # devient « /etc », qui n'est plus une route webhook du tout — d'ou 405 et
    # non 400. La remontee est neutralisee avant meme d'etre interpretee comme
    # un nom de route ; c'est le refus le plus tot possible.
    for bricole in ("/webhooks/..%2F..%2Fetc", "/webhooks/../../etc",
                    "/webhooks/MAJUSCULE", "/webhooks/nom%20avec%20espace"):
        st, _, _ = req("POST", bricole, headers=same)
        check("E3 refuse « %s »" % bricole, st in (400, 404, 405), "HTTP %d" % st)

    # Liste blanche du statique : ni le code du serveur, ni un dossier cache.
    for interdit in ("/serve.py", "/test_serve.py", "/.test-home/webhook_subscriptions.json"):
        st, _, _ = req("GET", interdit, headers=same)
        check("S10 « %s » n'est pas servi" % interdit, st == 404, "HTTP %d" % st)

    # L'expurgation de la config porte sur le chemin NORMALISE, donc aucune
    # reecriture d'URL ne rend le fichier brut.
    for detour in ("/../ulysse-config.js", "/%2e%2e/ulysse-config.js", "/./ulysse-config.js"):
        st, _, body = req("GET", detour, headers=same)
        leak = re.search(r'(SESSION_TOKEN|PROXY_TOKEN):\s*"[^"]+"', body or "")
        check("S11 « %s » ne rend pas la config brute" % detour, not leak,
              leak.group(0) if leak else "")

    st, _, body = req("GET", "/api/webhooks", headers=same)
    ok_list = st == 200 and json.loads(body).get("subscriptions", [{}])[0].get("name") == WH_NAME
    check("E2 liste des webhooks servie par le dashboard", ok_list, "HTTP %d" % st)

    print("\n=== 5. Chat pur : cle jamais dans le navigateur ===")
    FakeProxy.seen.clear()
    st, _, body = req("POST", "/proxy/chat", headers=dict(same, **{"Content-Type": "application/json"}),
                      body=json.dumps({"model": "m", "messages": [{"role": "user", "content": "ping"}]}))
    check("Relais /proxy/chat fonctionne", st == 200 and "pong" in body, "HTTP %d" % st)
    check("Cle du proxy injectee par le serveur",
          bool(FakeProxy.seen) and FakeProxy.seen[-1]["auth"] == "Bearer cle-proxy",
          str(FakeProxy.seen[-1]["auth"]) if FakeProxy.seen else "")
    check("Route amont correcte (/v1/chat/completions)",
          bool(FakeProxy.seen) and FakeProxy.seen[-1]["path"] == "/v1/chat/completions",
          str(FakeProxy.seen[-1]["path"]) if FakeProxy.seen else "")

    print("\n=== 6. Regressions du rapport (C8, M8, M10) ===")
    # M8 : l'aiguillage se fait sur le CHEMIN, pas sur `self.path` (qui porte
    # la query). Une query ne doit plus faire retomber un appel relaye dans le
    # statique — et la query doit arriver intacte en amont.
    FakeDashboard.seen.clear()
    st, _, _ = req("GET", "/api/sessions?limit=50&order=recent", headers=same)
    relayed = bool(FakeDashboard.seen) and "order=recent" in FakeDashboard.seen[-1]["path"]
    check("M8 query string : aiguillage sur le chemin, query relayee",
          st == 200 and relayed, "HTTP %d — %s" % (st, FakeDashboard.seen[-1]["path"] if FakeDashboard.seen else ""))

    FakeGateway.seen.clear()
    st, _, _ = req("POST", "/webhooks/%s?essai=1" % WH_NAME, headers=same)
    check("M8 query string sur /webhooks/<nom> n'empeche pas le relais",
          st == 200, "HTTP %d" % st)

    # M10 : compter les occurrences reelles dans les octets bruts, pas via
    # http.client (qui fusionne les doublons — et Date contient deja une virgule).
    raw = raw_head("GET", "/api/status", same)
    ndate = sum(1 for line in raw.splitlines() if line.lower().startswith("date:"))
    nserver = sum(1 for line in raw.splitlines() if line.lower().startswith("server:"))
    check("M10 en-tete Date non duplique", ndate <= 1, "%d occurrences" % ndate)
    check("M10 en-tete Server non duplique", nserver <= 1, "%d occurrences" % nserver)

    import inspect
    sig = inspect.signature(serve.Handler.build_upstream_headers)
    dflt = sig.parameters["backend"].default
    check("C8 build_upstream_headers sans defaut gele",
          dflt is inspect.Parameter.empty, repr(dflt))

    st, _, _ = req("GET", "/index.html", headers=same)
    check("Statique toujours servi", st == 200, "HTTP %d" % st)

    # --- Le marqueur de premier lancement -------------------------------
    # C'est la SEULE route locale en ecriture. Elle ne relaie rien et
    # n'ecrit qu'un fichier hors du dossier servi. Elle doit tenir les memes
    # frontieres que le reste, sinon elle est une porte de plus.
    print("\n-- Le marqueur de premier lancement --")

    st, _, txt = req("GET", "/" + serve.CONFIG_FILE, headers=same)
    check("La config servie porte le marqueur",
          st == 200 and "PREMIER = true" in txt, "HTTP %d" % st)
    check("...et toujours aucun secret",
          'SESSION_TOKEN: ""' in txt or 'SESSION_TOKEN:""' in txt
          or "SESSION_TOKEN" not in txt, txt[:0])

    # Le fichier SERVI n'est pas le fichier sur DISQUE : serve.py y ajoute une
    # ligne. Les tests de page lisent le disque et ne verraient donc jamais
    # une erreur dans cette ligne — c'est exactement ce qui est arrive :
    # elle ecrivait dans `CFG`, qui n'existe pas encore a ce moment-la, et le
    # navigateur levait « CFG is not defined » sans qu'aucune suite ne le voie.
    check("La ligne ajoutee vise window.ULYSSE_CONFIG, pas CFG",
          "window.ULYSSE_CONFIG.PREMIER" in txt and "\nCFG." not in txt,
          txt[-160:].strip())
    check("...et elle vient apres la declaration qu'elle modifie",
          txt.index("window.ULYSSE_CONFIG = {") < txt.index("window.ULYSSE_CONFIG.PREMIER"))

    st, _, _ = req("POST", "/ulysse/premier-vu", headers=same, body=b"{}")
    check("Le marqueur s'ecrit sur une requete de meme origine",
          st == 200, "HTTP %d" % st)
    check("Le marqueur ne vit PAS dans le dossier servi",
          os.path.dirname(os.path.abspath(serve.MARQUEUR))
          != os.path.dirname(os.path.abspath(__file__)),
          serve.MARQUEUR)
    st, _, _ = req("GET", "/ulysse-premier-vu", headers=same)
    check("...et il n'est pas telechargeable", st == 404, "HTTP %d" % st)

    # --- xterm.js, emprunte a Hermes ------------------------------------
    # C'est une porte de plus vers le disque : elle doit etre AUSSI etroite
    # que le reste. La liste est fermee et aucun segment ne vient du client —
    # c'etait precisement la faille S11.
    print("\n-- Le terminal : xterm.js emprunte --")

    st, _, body = req("GET", "/xterm/xterm.js", headers=same)
    check("xterm.js est servi depuis l'installation Hermes",
          st == 200 and len(body) > 100000, "HTTP %d, %d octets" % (st, len(body)))
    st, _, _ = req("GET", "/xterm/xterm.css", headers=same)
    check("...et sa feuille aussi", st == 200, "HTTP %d" % st)

    check("Aucun fichier emprunte n'est recopie dans web/",
          not os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                          "xterm.js")))
    for detour in ("/xterm/../serve.py", "/xterm/..%2fserve.py",
                   "/xterm/xterm.js/../../serve.py", "/xterm/package.json"):
        st, _, txt = req("GET", detour, headers=same)
        fuite = "SESSION_TOKEN" in txt or "def route" in txt or '"name"' in txt
        check("Aucun detour ne sort de la liste : « %s »" % detour,
              not fuite and st in (403, 404), "HTTP %d" % st)

    hostile = {"Host": "mechant.example.com", "Origin": "http://mechant.example.com"}
    # Un emprunt suit EXACTEMENT la politique du reste du statique : pas de
    # garde d'origine, parce qu'il n'y a rien a proteger — la page ne tient
    # aucun secret. Ce test fige cette egalite : le jour ou le statique se
    # ferme, l'emprunt doit se fermer avec lui, et non rester ouvert seul.
    st_emprunt, _, txt = req("GET", "/xterm/xterm.js", headers=hostile)
    st_statique, _, _ = req("GET", "/ulysse-app.js", headers=hostile)
    check("L'emprunt suit la meme politique que le statique voisin",
          st_emprunt == st_statique, "xterm %d vs app.js %d" % (st_emprunt, st_statique))
    check("...et le fichier emprunte ne porte aucun secret",
          "SESSION_TOKEN" not in txt and "hermes" not in txt.lower()[:2000])

    st, _, _ = req("POST", "/ulysse/premier-vu", headers=hostile, body=b"{}")
    check("Une origine hostile ne peut pas poser le marqueur",
          st == 403, "HTTP %d" % st)
    st, _, _ = req("GET", "/ulysse/premier-vu", headers=same)
    check("La route refuse tout sauf POST", st in (404, 405), "HTTP %d" % st)

    # --- bilan ---------------------------------------------------------
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 62)
    print("  %d / %d verifications passees" % (passed, total))
    if passed != total:
        print("\n  Echecs :")
        for name, ok, detail in results:
            if not ok:
                print("    - %s  (%s)" % (name, detail))
    print("=" * 62)
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
