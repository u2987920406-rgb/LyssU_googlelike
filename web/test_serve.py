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

    def do_POST(self):
        """Le vrai `/api/fs/write-text` ECRIT sur le disque (web_server.py:2651).

        Le faux doit ecrire aussi : sans ca, on ne pourrait pas verifier que
        serve.py met la version d'AVANT de cote avant de laisser passer, ni
        que le fichier porte bien le nouveau texte apres.
        """
        FakeDashboard.seen.append({"path": self.path, "method": "POST",
                                   "host": self.headers.get("Host"),
                                   "token": self.headers.get("X-Hermes-Session-Token")})
        if not self._accepted_host(self.headers.get("Host")):
            self._reject(403, "Host header mismatch")
            return
        if self.headers.get("X-Hermes-Session-Token") != TOKEN:
            self._reject(401, "Unauthorized")
            return
        path = urllib.parse.urlsplit(self.path).path
        if path != "/api/fs/write-text":
            self._reject(404, "Not Found: " + path)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            corps = json.loads(self.rfile.read(n).decode("utf-8"))
            with open(corps["path"], "w", encoding="utf-8") as fh:
                fh.write(corps.get("content") or "")
        except Exception as exc:
            self._reject(400, str(exc))
            return
        body = json.dumps({"ok": True, "path": corps["path"]}).encode()
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

    # --- Ecrire dans la memoire : la copie datee AVANT l'ecrasement -----
    # « Ecrire par-dessus une memoire EST une destruction, meme si ca
    #   s'appelle ecrire. » Sans copie datee, un ecran qui promet un retour en
    #   arriere ment. C'est ce que ces verifications tiennent.
    print("\n-- Ecrire dans la memoire : ce qu'on peut defaire --")

    # On repart d'un dossier de versions VIDE. Sans ca, la suite compterait
    # les versions laissees par l'execution precedente et passerait au vert
    # pour de mauvaises raisons.
    memo = os.path.join(home, "user.md")
    import shutil as _sh
    _sh.rmtree(serve.dossier_versions(memo), ignore_errors=True)
    with open(memo, "w", encoding="utf-8") as fh:
        fh.write("premiere version\n")

    def ecrire(chemin, contenu, headers=same):
        return req("POST", "/ulysse/ecrire", headers=headers,
                   body=json.dumps({"path": chemin, "content": contenu}).encode())

    st, _, txt = ecrire(memo, "deuxieme version\n")
    rep = json.loads(txt) if st == 200 else {}
    versions = serve.lister_versions(memo)
    check("Une ecriture met la version d'avant de cote, datee",
          st == 200 and len(versions) == 1 and rep.get("version_gardee"),
          "HTTP %d, %d version(s)" % (st, len(versions)))
    if versions:
        with open(os.path.join(serve.dossier_versions(memo), versions[0]["nom"]),
                  encoding="utf-8") as fh:
            gardee = fh.read()
        check("...la copie contient bien l'ANCIEN texte",
              gardee == "premiere version\n", repr(gardee[:40]))
    with open(memo, encoding="utf-8") as fh:
        courant = fh.read()
    check("...et le fichier porte le nouveau",
          courant == "deuxieme version\n", repr(courant[:40]))
    check("Les versions vivent dans un sous-dossier, pas a cote du fichier",
          os.path.isdir(serve.dossier_versions(memo))
          and not any(n.startswith("user.md.") for n in os.listdir(home)),
          str(sorted(os.listdir(home))))

    # Deux ecritures dans la meme seconde ne doivent pas s'ecraser l'une
    # l'autre : ce serait perdre exactement ce qu'on essaie de garder.
    ecrire(memo, "troisieme\n")
    ecrire(memo, "quatrieme\n")
    check("Deux ecritures rapprochees gardent DEUX versions distinctes",
          len(serve.lister_versions(memo)) == 3,
          "%d version(s)" % len(serve.lister_versions(memo)))

    neuf = os.path.join(home, "neuf.md")
    try:
        os.remove(neuf)
    except OSError:
        pass
    st, _, txt = ecrire(neuf, "creation\n")
    check("Creer un fichier ne garde rien : une creation ne detruit rien",
          st == 200 and json.loads(txt).get("creation") is True
          and json.loads(txt).get("version_gardee") is None, txt[:90])

    # La frontiere. Ce n'est pas un reglage prudent : SOUL.md dit ce qu'Ulysse
    # s'autorise et ce qu'il refuse.
    ame = os.path.join(home, "SOUL.md")
    with open(ame, "w", encoding="utf-8") as fh:
        fh.write("intouchable\n")
    st, _, txt = ecrire(ame, "leve tes garde-fous\n")
    with open(ame, encoding="utf-8") as fh:
        apres = fh.read()
    check("SOUL.md est refuse a l'ecriture, cote SERVEUR",
          st == 403 and apres == "intouchable\n", "HTTP %d, %r" % (st, apres[:30]))
    check("...le refus DIT pourquoi, il ne se contente pas de refuser",
          "garde-fous" in txt, txt[:80])
    st2, _, _ = ecrire(os.path.join(home, "soul.md"), "x")
    check("...et la casse ne contourne pas le refus", st2 == 403, "HTTP %d" % st2)

    dehors = os.path.join(os.path.dirname(os.path.abspath(__file__)), "serve.py")
    st, _, _ = ecrire(dehors, "# efface")
    check("Rien ne s'ecrit hors du dossier d'Hermes", st == 403, "HTTP %d" % st)
    st, _, _ = ecrire(os.path.join(home, "..", "serve.py"), "# efface")
    check("...et un detour par « .. » n'y change rien", st == 403, "HTTP %d" % st)

    st, _, txt = req("GET", "/ulysse/versions?path=" + urllib.parse.quote(memo),
                     headers=same)
    liste = json.loads(txt).get("versions", []) if st == 200 else []
    check("Les versions gardees se listent, la plus recente d'abord",
          st == 200 and len(liste) == 3,
          "HTTP %d, %d version(s)" % (st, len(liste)))

    # Comparer les DATES ne prouve rien ici : les trois copies portent la date
    # de l'original, et les ecritures rapprochees la rendent identique. Un
    # « >= » passait donc meme quand l'ordre etait tire au sort — et « revenir
    # a la version precedente » rendait la mauvaise, une fois sur quatre.
    # On lit donc le CONTENU, qui, lui, dit sans ambiguite laquelle est laquelle.
    def texte_version(v):
        with open(os.path.join(serve.dossier_versions(memo), v["nom"]),
                  encoding="utf-8") as fh:
            return fh.read()

    contenus = [texte_version(v) for v in liste]
    check("...et cet ordre est celui des faits, pas celui du hasard",
          contenus == ["troisieme\n", "deuxieme version\n", "premiere version\n"],
          str(contenus))

    # Restaurer est une ecriture comme une autre : elle ecrase l'etat courant.
    # Ne pas en garder copie ferait du retour en arriere un aller simple.
    if liste:
        avant_rest = len(serve.lister_versions(memo))
        st, _, txt = req("POST", "/ulysse/restaurer", headers=same,
                         body=json.dumps({"path": memo,
                                          "nom": liste[-1]["nom"]}).encode())
        with open(memo, encoding="utf-8") as fh:
            revenu = fh.read()
        check("On revient a une version gardee",
              st == 200 and revenu == "premiere version\n",
              "HTTP %d, %r" % (st, revenu[:30]))
        check("...et le retour en arriere est lui-meme reversible",
              len(serve.lister_versions(memo)) == avant_rest + 1,
              "%d version(s)" % len(serve.lister_versions(memo)))

    for mauvais in ("../../serve.py", "..\\serve.py", "autre.md.2026-01-01-000000",
                    "user.md.2099-01-01-000000"):
        st, _, _ = req("POST", "/ulysse/restaurer", headers=same,
                       body=json.dumps({"path": memo, "nom": mauvais}).encode())
        check("Une version bricolee est refusee : « %s »" % mauvais,
              st in (400, 404), "HTTP %d" % st)

    # Les sauvegardes sont DANS le Hermes Home : sans garde, la meme route
    # permettrait d'ecraser une version gardee — detruire precisement ce qui
    # existe pour empecher une destruction.
    vers = serve.lister_versions(memo)
    if vers:
        cible_vers = os.path.join(serve.dossier_versions(memo), vers[0]["nom"])
        st, _, txt = ecrire(cible_vers, "ecrasee")
        with open(cible_vers, encoding="utf-8") as fh:
            tjrs = fh.read()
        check("Une version gardee ne peut pas etre ecrasee par cette route",
              st == 403 and "ecrasee" not in tjrs, "HTTP %d" % st)

    # Deux ecritures SIMULTANEES ne doivent pas se choisir le meme nom de
    # version : la perdante effacerait la sauvegarde de l'autre.
    course = os.path.join(home, "course.md")
    with open(course, "w", encoding="utf-8") as fh:
        fh.write("origine\n")
    _sh.rmtree(serve.dossier_versions(course), ignore_errors=True)
    quand = "2026-01-01-000000"
    faites = []
    def _garder():
        try:
            faites.append(serve.garder_version(course, horodatage=quand))
        except OSError:
            faites.append(None)
    fils = [threading.Thread(target=_garder) for _ in range(12)]
    for f in fils:
        f.start()
    for f in fils:
        f.join()
    gardees = [x for x in faites if x]
    check("Douze copies simultanees donnent douze fichiers distincts",
          len(gardees) == 12 and len(set(gardees)) == 12
          and len(serve.lister_versions(course)) == 12,
          "%d copie(s), %d nom(s) distinct(s)" % (len(gardees), len(set(gardees))))
    check("...et chacune porte bien le contenu, pas un fichier vide",
          all(os.path.getsize(g) == os.path.getsize(course) for g in gardees))

    # LE point qui tient tout le reste : si la copie ne peut pas se faire,
    # l'ecriture N'A PAS LIEU. Mieux vaut ne pas ecrire que d'ecrire sans
    # retour possible. On empeche la copie en mettant un FICHIER la ou le
    # dossier des versions devrait etre.
    bloque = os.path.join(home, "bloque.md")
    with open(bloque, "w", encoding="utf-8") as fh:
        fh.write("a conserver\n")
    _sh.rmtree(serve.dossier_versions(bloque), ignore_errors=True)
    with open(serve.dossier_versions(bloque), "w", encoding="utf-8") as fh:
        fh.write("je ne suis pas un dossier")
    st, _, txt = ecrire(bloque, "ecrasement\n")
    with open(bloque, encoding="utf-8") as fh:
        garde_intacte = fh.read()
    check("Si la copie ne peut pas se faire, RIEN n'est ecrit",
          st == 500 and garde_intacte == "a conserver\n",
          "HTTP %d, %r" % (st, garde_intacte[:30]))
    check("...et on dit pourquoi, plutot que « erreur »",
          "sans retour possible" in txt, txt[:110])
    os.remove(serve.dossier_versions(bloque))

    # --- Ouvrir une VRAIE console ---------------------------------------
    # Le seul endroit ou Ulysse lance un processus. On detourne le lanceur :
    # une suite de verifications ne doit ouvrir aucune fenetre sur la machine
    # de quelqu'un.
    # ------------------------------------------------------------------
    # Le piege du serveur deja en marche
    #
    # Sous Windows, se lier a un port deja pris REUSSIT (allow_reuse_address)
    # et c'est le PREMIER qui continue de repondre. Relancer sans fermer ne
    # fait donc rien du tout — sauf donner l'illusion d'avoir relance.
    # Mesure du 2026-08-09 : six requetes, six reponses de l'ancien.
    # ------------------------------------------------------------------
    print("\n-- Le serveur dit quand il n'a pas pris la main --")

    check("un port ou quelqu'un repond est vu comme PRIS",
          serve.port_deja_pris("127.0.0.1", ULYSSE_PORT) is True)

    # Un port libre : on en prend un et on le relache aussitot, plutot que
    # d'esperer qu'un numero choisi au hasard soit libre.
    s_libre = socket.socket()
    s_libre.bind(("127.0.0.1", 0))
    port_libre = s_libre.getsockname()[1]
    s_libre.close()
    check("...et un port libre est vu comme libre",
          serve.port_deja_pris("127.0.0.1", port_libre) is False,
          "port %d" % port_libre)

    # Le doute ne doit pas bloquer : refuser de demarrer pour une raison
    # qu'on ne sait pas nommer serait pire que le piege qu'on evite.
    check("...le refus de demarrer ne vaut que pour une reponse CONSTATEE",
          serve.port_deja_pris("127.0.0.1", port_libre) is not None)

    print("\n-- Ouvrir une console Hermes, hors d'Ulysse --")

    lances = []
    serve.LANCEUR = lambda argv, **kw: lances.append(list(argv))

    st, _, _ = req("POST", "/ulysse/console", headers=same)
    if sys.platform.startswith("win"):
        check("La route ouvre une console", st == 200 and len(lances) == 1,
              "HTTP %d, %d lancement(s)" % (st, len(lances)))
        check("...avec une commande ECRITE DANS serve.py, pas recue du client",
              lances and lances[0] == serve.CONSOLE_ARGV,
              str(lances[0] if lances else None))
        # argv en LISTE, jamais une chaine remise a un shell : rien a echapper.
        check("...passee en liste d'arguments, jamais a un shell",
              isinstance(serve.CONSOLE_ARGV, list)
              and all(isinstance(x, str) for x in serve.CONSOLE_ARGV))
        # La commande est figee ici AUSSI : si quelqu'un change ce qui s'ouvre
        # chez les gens, ce test tombe et il faut l'assumer explicitement.
        check("...et c'est exactement la commande figee, mot pour mot",
              serve.CONSOLE_ARGV ==
              ["cmd", "/c", "start", "", "cmd", "/k", "title Hermes & hermes"],
              str(serve.CONSOLE_ARGV))
        # Le defaut constate en vrai : `start Hermes ...` (titre sans
        # guillemets) fait chercher un PROGRAMME nomme "Hermes" et ouvre une
        # boite d'erreur BLOQUANTE. Le titre passe a `start` doit rester vide.
        i = serve.CONSOLE_ARGV.index("start")
        check("...le titre remis a `start` est vide, sinon la fenetre bloque",
              serve.CONSOLE_ARGV[i + 1] == "",
              "titre = %r" % serve.CONSOLE_ARGV[i + 1])
    else:
        check("Hors Windows, la route refuse et le DIT", st == 500 and not lances,
              "HTTP %d" % st)

    # Un corps hostile ne doit rien changer : rien de ce qu'il propose n'entre
    # dans la commande.
    avant_corps = len(lances)
    st, _, _ = req("POST", "/ulysse/console", headers=same,
                   body=json.dumps({"cmd": "calc.exe",
                                    "argv": ["calc.exe"]}).encode())
    check("Un corps qui propose une autre commande est ignore",
          all(l == serve.CONSOLE_ARGV for l in lances[avant_corps:]),
          str(lances[avant_corps:] or "aucun"))
    # Le defaut constate : une route qui ne lit pas le corps le laisse dans la
    # connexion ; le serveur ferme, le systeme coupe (WinError 10053) et la
    # reponse SE PERD. Ca ne ratait qu'une fois sur quatre — donc ca ratait.
    attendu = 200 if sys.platform.startswith("win") else 500
    check("...et la reponse arrive quand meme : le corps ignore est jete, pas laisse",
          st == attendu, "HTTP %d" % st)

    hostile = {"Host": "mechant.example.com", "Origin": "http://mechant.example.com"}
    avant_hostile = len(lances)
    st, _, _ = req("POST", "/ulysse/console", headers=hostile)
    check("Une page hostile ne peut ouvrir aucune console",
          st == 403 and len(lances) == avant_hostile, "HTTP %d" % st)
    # Meme piege sur le refus : un 403 rendu sans lire le corps se perd aussi.
    avant_hostile = len(lances)
    st, _, _ = req("POST", "/ulysse/console", headers=hostile,
                   body=b"x" * 40000)
    check("...et le refus arrive meme quand la requete portait un gros corps",
          st == 403 and len(lances) == avant_hostile, "HTTP %d" % st)
    st, _, _ = req("GET", "/ulysse/console", headers=same)
    check("...et la route ne repond qu'au POST", st in (404, 405), "HTTP %d" % st)
    serve.LANCEUR = None

    st, _, _ = ecrire(memo, "par une page hostile", headers=hostile)
    with open(memo, encoding="utf-8") as fh:
        intact = fh.read()
    check("Une page hostile ne peut rien ecrire dans la memoire",
          st == 403 and intact == "premiere version\n", "HTTP %d" % st)

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

    # --- set_config_value : ecrire une cle sans abimer le fichier -------
    # ⚠ TROUVE PAR LE BANC DES ECRANS, PAS ICI. Un aller-retour cense ne rien
    # changer (poser un override de modele, puis remettre la valeur d'avant)
    # laissait un `git diff` non vide : la ligne revenait DESINDENTEE. La cause
    # est dans `_VALUE_RE`, qui commence par `^\s*` et consomme donc
    # l'indentation que la substitution ne remettait pas.
    # C'est petit, et c'est exactement ce qui s'accumule : ulysse-config.js est
    # un fichier suivi, et chaque changement de modele depuis Reglages y
    # laissait une ligne de bruit.
    src = ('window.ULYSSE_CONFIG = {\n'
           '\n'
           '  // un commentaire\n'
           '  PROXY_MODEL: "avant",\n'
           '  AUTRE: "x",\n'
           '};\n')
    out = serve.set_config_value(src, "PROXY_MODEL", "apres")
    check("set_config_value ecrit bien la nouvelle valeur",
          'PROXY_MODEL: "apres"' in out, out)
    check("set_config_value GARDE l'indentation de la cle",
          '\n  PROXY_MODEL: "apres"' in out,
          repr([l for l in out.split("\n") if "PROXY_MODEL" in l]))
    check("set_config_value ne touche a rien d'autre",
          out.count("\n") == src.count("\n") and 'AUTRE: "x"' in out
          and "// un commentaire" in out,
          "%d lignes contre %d" % (out.count("\n"), src.count("\n")))
    # ⚠ UNE VALEUR AVEC UNE CONTRE-OBLIQUE. `safe` DOUBLE les contre-obliques,
    # et une substitution par CHAINE les aurait relues comme des motifs
    # (« \1 », « \g<1> ») au lieu de les ecrire. Meme piege que « $& » cote
    # JavaScript, qui a deja corrompu un fichier inline le 2026-08-11.
    out2 = serve.set_config_value(src, "PROXY_MODEL", "a\\b")
    check("set_config_value ecrit une contre-oblique sans la reinterpreter",
          'PROXY_MODEL: "a\\\\b"' in out2,
          repr([l for l in out2.split("\n") if "PROXY_MODEL" in l]))
    check("une cle absente laisse le texte intact",
          serve.set_config_value(src, "INCONNUE", "x") == src)

    # ⚠ LES FINS DE LIGNE NE SONT PAS A NOUS. `set_config_value` travaille sur
    # du texte : il ne doit toucher NI celles de la ligne changee, NI celles
    # des autres. C'est la moitie du probleme ; l'autre moitie est dans les
    # `open()` (`newline=""` des deux cotes), sans quoi Python retraduit tout
    # le fichier sur Windows — `git status` disait ulysse-config.js modifie
    # apres chaque passage du banc, pour un aller-retour qui ne change rien.
    crlf = ('window.ULYSSE_CONFIG = {\r\n'
            '  PROXY_MODEL: "avant",\r\n'
            '  AUTRE: "x",\r\n'
            '};\r\n')
    sortie = serve.set_config_value(crlf, "PROXY_MODEL", "apres")
    check("set_config_value garde les fins de ligne CRLF telles quelles",
          sortie == crlf.replace('"avant"', '"apres"'),
          repr(sortie[:70]))
    check("et il n'introduit pas de CR dans un fichier en LF",
          "\r" not in serve.set_config_value(src, "PROXY_MODEL", "apres"))
    # Un aller-retour complet doit rendre le texte de depart, a l'octet pres.
    aller = serve.set_config_value(crlf, "PROXY_MODEL", "essai")
    retour = serve.set_config_value(aller, "PROXY_MODEL", "avant")
    check("poser puis remettre une valeur rend le texte IDENTIQUE",
          retour == crlf, repr(retour[:70]))

    # -----------------------------------------------------------------------
    # Le menage des rapports de `lancer_bancs.py`
    #
    # ⚠ CE CODE EFFACE DES FICHIERS. C'est la seule chose de ce depot qui
    # supprime quoi que ce soit sans qu'on le lui demande, et ce qu'il efface
    # est precisement la preuve qu'on garde pour expliquer un rouge nocturne.
    # Une regle « on garde les N plus recents » se trompe dans le sens le plus
    # couteux : elle jette le rouge de la nuit AVANT qu'on l'ait ouvert.
    # -----------------------------------------------------------------------
    print("\n--- Rapports dates : le menage n'emporte jamais un rouge ---")
    import lancer_bancs  # noqa: E402  (import tardif : il reconfigure stdout)

    quand = time.struct_time((2026, 8, 12, 23, 1, 0, 2, 224, 0))
    nom = os.path.basename(lancer_bancs.fichier_rapport(True, True, quand))
    check("le nom du rapport porte la date, le mode et l'etat",
          nom == "2026-08-12_2301-rapide-ROUGE.txt", nom)
    check("et une serie complete au vert se nomme pareil, en disant vert",
          os.path.basename(lancer_bancs.fichier_rapport(False, False, quand))
          == "2026-08-12_2301-complet-vert.txt")

    vrai_dossier = lancer_bancs.RAPPORTS
    try:
        with tempfile.TemporaryDirectory() as tmp:
            lancer_bancs.RAPPORTS = tmp

            def poser(noms):
                for n in os.listdir(tmp):
                    os.remove(os.path.join(tmp, n))
                for n in noms:
                    with open(os.path.join(tmp, n), "w", encoding="utf-8") as fh:
                        fh.write("x")

            def restants():
                return sorted(os.listdir(tmp))

            # Bien plus de verts que le seuil, et un rouge tres ancien coince
            # au milieu : c'est le cas de la nuit du 2026-08-12.
            verts = ["2026-08-%02d_%02d00-rapide-vert.txt" % (1 + i // 24, i % 24)
                     for i in range(lancer_bancs.GARDE_VERTS + 12)]
            poser(verts + ["2026-08-01_0300-complet-ROUGE.txt"])
            lancer_bancs.elaguer()
            apres = restants()
            check("le rouge le plus VIEUX de tous survit au menage",
                  "2026-08-01_0300-complet-ROUGE.txt" in apres)
            check("les verts sont ramenes au seuil, pas plus",
                  len([n for n in apres if "-vert" in n]) == lancer_bancs.GARDE_VERTS,
                  str(len([n for n in apres if "-vert" in n])))
            check("ce sont les verts les plus RECENTS qui restent",
                  verts[-1] in apres and verts[0] not in apres)

            # Sous le seuil, le menage ne doit rien faire du tout.
            poser(verts[:3])
            lancer_bancs.elaguer()
            check("sous le seuil, le menage ne touche a rien",
                  restants() == sorted(verts[:3]))

            # Un dossier qui n'existe pas encore : premier lancement.
            lancer_bancs.RAPPORTS = os.path.join(tmp, "pas-encore-la")
            try:
                lancer_bancs.elaguer()
                check("un dossier absent ne fait pas tomber le menage", True)
            except OSError as exc:
                check("un dossier absent ne fait pas tomber le menage", False, str(exc))
    finally:
        lancer_bancs.RAPPORTS = vrai_dossier

    # --- la copie versionnee du plugin ne doit pas diverger -------------
    #
    # ⚠ CE GARDE EXISTE PARCE QUE LA DIVERGENCE SERAIT SILENCIEUSE. Le plugin
    # qui rend « Manuel » vrai tourne depuis le dossier d'Hermes ; le depot
    # n'en porte qu'une COPIE, pour qu'une machine neuve puisse l'installer.
    # Modifier l'un sans l'autre ne casse rien ici et rien la-bas : ca se voit
    # le jour ou quelqu'un installe la copie et se retrouve avec un « Manuel »
    # qui ne demande pas. Voir web/plugin-hermes/INSTALLER.md.
    #
    # Si le plugin n'est pas installe sur cette machine, on ne verifie rien et
    # on le DIT — un banc qui se tait sur ce qu'il n'a pas regarde laisse
    # croire qu'il l'a regarde.
    ici = os.path.dirname(os.path.abspath(__file__))
    copie = os.path.join(ici, "plugin-hermes", "ulysse-approbation")
    racine_hermes = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    installe = os.path.join(racine_hermes, "hermes", "plugins", "ulysse-approbation")
    if not os.path.isdir(installe):
        installe = os.path.join(os.path.expanduser("~"), ".hermes",
                                "plugins", "ulysse-approbation")
    check("la copie versionnee du plugin existe",
          os.path.isfile(os.path.join(copie, "__init__.py"))
          and os.path.isfile(os.path.join(copie, "plugin.yaml")), copie)
    if os.path.isdir(installe):
        for nom in ("__init__.py", "plugin.yaml"):
            a = os.path.join(copie, nom)
            b = os.path.join(installe, nom)
            try:
                with open(a, "rb") as f1, open(b, "rb") as f2:
                    pareil = f1.read() == f2.read()
                ecart = ""
            except OSError as exc:
                pareil, ecart = False, str(exc)
            check("le plugin installe et sa copie sont identiques (%s)" % nom,
                  pareil, ecart or "la copie du depot a divergé de ce qui tourne")
    else:
        print("  (plugin non installe sur cette machine — comparaison non faite)")

    print("\n=== 7. Le port suit verif_ports (issue #7) ===")

    # Le contrat : verif_ports.py resout un port libre et le transmet ;
    # serve.py doit l'ecouter, pas retomber sur 8080 en dur.
    check("--port en argv prime sur tout",
          serve.port_effectif(["--port", "8123"], {"ULYSSE_PORT": "8999"}) == 8123)
    check("ULYSSE_PORT en env est lu quand argv n'en dit rien",
          serve.port_effectif([], {"ULYSSE_PORT": "8124"}) == 8124)
    check("sans argv ni env, la constante PORT du fichier reste le defaut",
          serve.port_effectif([], {}) == serve.PORT)
    # Les deux moities du lancement partent du MEME port par defaut : si l'une
    # bouge sans l'autre, verif_ports resout un port ou serve n'ecoute pas et
    # le navigateur s'ouvre sur du vide (issue #11 — constate sur une machine
    # ou serve.py avait ete edite a 8090 en local, verif_ports restant a 8080).
    import verif_ports
    check("serve.PORT et verif_ports.UI_PORT partent du meme defaut",
          serve.PORT == verif_ports.UI_PORT,
          "serve=%d verif_ports=%d" % (serve.PORT, verif_ports.UI_PORT))
    check("le dashboard demarre la ou la config l'attend (9123)",
          verif_ports.DASH_ULYSSE_PORT == 9123,
          str(verif_ports.DASH_ULYSSE_PORT))
    for mauvais_argv, mauvais_env in ((["--port"], {}), (["--port", "abc"], {}),
                                      ([], {"ULYSSE_PORT": "abc"})):
        try:
            serve.port_effectif(mauvais_argv, mauvais_env)
            refuse = False
        except SystemExit:
            refuse = True
        check("une valeur invalide est refusee net : argv=%r env=%r"
              % (mauvais_argv, mauvais_env), refuse)

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
