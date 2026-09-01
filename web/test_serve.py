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
    # (code, message) pour faire refuser /api/fs/write-text — le vrai Hermes
    # sait dire non (disque plein, chemin interdit), le faux doit savoir aussi.
    panne_ecriture = None

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

    def do_HEAD(self):
        """Le vrai dashboard repond aux HEAD comme aux GET, sans corps."""
        FakeDashboard.seen.append({"path": self.path, "method": "HEAD",
                                   "host": self.headers.get("Host"),
                                   "token": self.headers.get("X-Hermes-Session-Token")})
        if not self._accepted_host(self.headers.get("Host")):
            self._reject(403, "Host header mismatch")
            return
        if self.headers.get("X-Hermes-Session-Token") != TOKEN:
            self._reject(401, "Unauthorized")
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", "2")
        self.end_headers()

    def _echo_methode(self):
        """PUT/PATCH/DELETE : le vrai dashboard les connait ; le faux dit
        seulement QUELLE methode l'a atteint — c'est tout ce qu'on verifie."""
        FakeDashboard.seen.append({"path": self.path, "method": self.command,
                                   "host": self.headers.get("Host"),
                                   "token": self.headers.get("X-Hermes-Session-Token")})
        if not self._accepted_host(self.headers.get("Host")):
            self._reject(403, "Host header mismatch")
            return
        if self.headers.get("X-Hermes-Session-Token") != TOKEN:
            self._reject(401, "Unauthorized")
            return
        n = int(self.headers.get("Content-Length") or 0)
        if n:
            self.rfile.read(n)
        body = json.dumps({"methode": self.command}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    do_PUT = _echo_methode
    do_PATCH = _echo_methode
    do_DELETE = _echo_methode

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
        if FakeDashboard.panne_ecriture:
            code, msg = FakeDashboard.panne_ecriture
            self._reject(code, msg)
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

    # Le dashboard peut etre ETEINT : le relais generique repond 502 en le
    # disant, puis repart quand le backend revient (issue #62). Les deux
    # autres 502 (webhook, ecriture) sont testes plus bas ; celui-ci passe
    # par proxy_http, le chemin de TOUTES les routes /api/*.
    s_gen = socket.socket()
    s_gen.bind(("127.0.0.1", 0))
    port_gen = s_gen.getsockname()[1]
    s_gen.close()
    backend_gen = serve.BACKEND
    serve.BACKEND = serve.Backend("http://127.0.0.1:%d" % port_gen, TOKEN)
    try:
        st, _, txt = req("GET", "/api/status", headers=same)
    finally:
        serve.BACKEND = backend_gen
    check("Dashboard eteint -> 502 du relais generique, qui le dit",
          st == 502 and "injoignable" in txt, "HTTP %d — %s" % (st, txt[:80]))

    st, hd, _ = req("GET", "/api/status", headers=same)
    check("Requete meme origine acceptee", st == 200, "HTTP %d" % st)
    check("S2 aucun en-tete CORS permissif emis",
          "Access-Control-Allow-Origin" not in hd, str(hd.get("Access-Control-Allow-Origin")))

    st, _, _ = req("OPTIONS", "/api/status", headers={"Origin": "http://evil.example.com"})
    check("S2 preflight CORS non accorde", st == 403, "HTTP %d" % st)

    # MEME en meme origine : « aucun CORS n'est accorde » veut dire aucun.
    # Un preflight propre est refuse pareil, sans le moindre en-tete
    # Access-Control (issue #65).
    st, hd_opt, _ = req("OPTIONS", "/api/status", headers=same)
    check("S2 ...et le preflight de MEME origine est refuse pareil (403)",
          st == 403
          and not any(k.lower().startswith("access-control-") for k in hd_opt),
          "HTTP %d" % st)

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

    # Le gateway peut etre ABSENT (pas lance, tombe) : serve.py doit repondre
    # 502 et le DIRE, pas rendre un 200 menteur ni laisser pendre la requete.
    # Ce chemin (serve.py, bloc except -> json_error 502) n'etait jamais
    # exerce : le FakeGateway est toujours debout pendant cette section.
    s_mort = socket.socket()
    s_mort.bind(("127.0.0.1", 0))
    port_mort = s_mort.getsockname()[1]
    s_mort.close()  # plus personne n'ecoute ici : connexion refusee garantie
    gw_avant = serve.WEBHOOK_BACKEND
    serve.WEBHOOK_BACKEND = serve.Backend("http://127.0.0.1:%d" % port_mort, "")
    try:
        st, _, body = req("POST", "/webhooks/" + WH_NAME, headers=same)
    finally:
        serve.WEBHOOK_BACKEND = gw_avant
    check("E3 gateway injoignable -> 502, et le corps le dit",
          st == 502 and "injoignable" in (body or ""),
          "HTTP %d — %s" % (st, (body or "")[:120]))
    # ...et le gateway revenu, le relais repart : la panne n'a rien casse.
    st, _, _ = req("POST", "/webhooks/" + WH_NAME, headers=same)
    check("E3 ...et le relais repart quand le gateway revient", st == 200, "HTTP %d" % st)

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

    # Le fichier peut MANQUER (config perdue, deplacee) : la route doit le
    # dire par un 404 net, pas servir un corps vide qui casserait la page
    # en silence (issue #23). La route lit CONFIG_FILE a la requete : on le
    # pointe vers un nom qui n'existe pas, puis on le remet.
    config_avant = serve.CONFIG_FILE
    serve.CONFIG_FILE = "config-envolee-essai.js"
    try:
        st, _, _ = req("GET", "/" + serve.CONFIG_FILE, headers=same)
    finally:
        serve.CONFIG_FILE = config_avant
    check("Config introuvable -> 404, pas un 200 vide", st == 404, "HTTP %d" % st)
    st, _, txt = req("GET", "/" + serve.CONFIG_FILE, headers=same)
    check("...et le nominal marche toujours apres la remise en place",
          st == 200 and "PREMIER = true" in txt, "HTTP %d" % st)

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

    # Un marqueur qu'on ne peut pas ecrire n'est PAS une panne : on reverra
    # l'ecran une fois de trop, c'est tout — 200 {ok:false, raison}, jamais
    # un 500 qui casserait l'amorcage de la page (issue #69).
    marqueur_avant = serve.MARQUEUR
    serve.MARQUEUR = os.path.join(tempfile.gettempdir(),
                                  "dossier-qui-n-existe-pas-ulysse", "marqueur")
    try:
        st, _, txt = req("POST", "/ulysse/premier-vu", headers=same, body=b"{}")
    finally:
        serve.MARQUEUR = marqueur_avant
    rep_marq = json.loads(txt) if st == 200 else {}
    check("Marqueur inscriptible impossible -> 200 {ok:false} avec la raison",
          st == 200 and rep_marq.get("ok") is False
          and bool(rep_marq.get("raison")),
          "HTTP %d — %s" % (st, txt[:80]))

    # --- xterm.js, emprunte a Hermes ------------------------------------
    # C'est une porte de plus vers le disque : elle doit etre AUSSI etroite
    # que le reste. La liste est fermee et aucun segment ne vient du client —
    # c'etait precisement la faille S11.
    print("\n-- Le terminal : xterm.js emprunte --")

    # L'installation Hermes peut ne PAS porter le fichier emprunte (version
    # differente, dossier deplace) : la route le dit par un 404 explicite,
    # pas par un silence (issue #61).
    emprunt_avant = serve.EMPRUNTS["/xterm/xterm.js"]
    serve.EMPRUNTS["/xterm/xterm.js"] = (emprunt_avant[0] + ".n-existe-pas",
                                         emprunt_avant[1])
    try:
        st, _, txt = req("GET", "/xterm/xterm.js", headers=same)
    finally:
        serve.EMPRUNTS["/xterm/xterm.js"] = emprunt_avant
    check("l'emprunt absent de l'installation -> 404 qui le dit",
          st == 404 and "introuvable" in txt, "HTTP %d — %s" % (st, txt[:80]))

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

    # Hermes peut etre ABSENT (tombe, pas lance) : la route doit rendre 502
    # en le disant, ne rien ecrire — et la copie qu'elle venait de garder
    # doit SURVIVRE, c'est ecrit dans son propre message (issue #31).
    panne = os.path.join(home, "panne.md")
    with open(panne, "w", encoding="utf-8") as fh:
        fh.write("avant la panne\n")
    s_mort = socket.socket()
    s_mort.bind(("127.0.0.1", 0))
    port_mort = s_mort.getsockname()[1]
    s_mort.close()  # plus personne n'ecoute : connexion refusee garantie
    back_avant = serve.BACKEND
    serve.BACKEND = serve.Backend("http://127.0.0.1:%d" % port_mort, TOKEN)
    try:
        st, _, txt = ecrire(panne, "jamais ecrit\n")
    finally:
        serve.BACKEND = back_avant
    with open(panne, encoding="utf-8") as fh:
        intact = fh.read()
    gardes = serve.lister_versions(panne)
    check("Hermes injoignable -> 502, et le corps le dit",
          st == 502 and "n'a pas repondu" in txt, "HTTP %d — %s" % (st, txt[:80]))
    copie_ok = False
    if gardes:
        with open(os.path.join(serve.dossier_versions(panne), gardes[0]["nom"]),
                  encoding="utf-8") as fh:
            copie_ok = fh.read() == "avant la panne\n"
    check("...rien n'est ecrit, et la copie gardee n'est pas perdue",
          intact == "avant la panne\n" and len(gardes) == 1 and copie_ok,
          "%r, %d garde(s)" % (intact[:20], len(gardes)))
    # ...et Hermes revenu, la meme ecriture passe : la panne n'a rien casse.
    st, _, _ = ecrire(panne, "apres la panne\n")
    check("...et l'ecriture repart quand Hermes revient", st == 200, "HTTP %d" % st)

    # Un corps que lire_json ne peut pas lire — vide, illisible, ou declare
    # enorme — doit rendre 400 NET, sans rien ecrire et sans laisser la
    # connexion pendre (issue #32). Le « trop gros » est declare par l'en-tete,
    # pas envoye : la garde refuse AVANT de lire, c'est ce qu'on verifie.
    with open(panne, "rb") as fh:
        octets_temoin = fh.read()
    st, _, _ = req("POST", "/ulysse/ecrire", headers=same)
    check("Corps vide -> 400", st == 400, "HTTP %d" % st)
    st, _, _ = req("POST", "/ulysse/ecrire", headers=same, body=b"pas du json")
    check("Corps non-JSON -> 400", st == 400, "HTTP %d" % st)
    st, _, _ = req("POST", "/ulysse/ecrire",
                   headers=dict(same, **{"Content-Length":
                                         str(serve.Handler.CORPS_MAX + 1)}))
    check("Corps declare au-dela de CORPS_MAX -> 400, refuse avant lecture",
          st == 400, "HTTP %d" % st)
    with open(panne, "rb") as fh:
        octets_apres = fh.read()
    check("...et le temoin n'a pas bouge d'un octet", octets_apres == octets_temoin)

    # Le JSON peut etre VALIDE et les champs faux quand meme : un content qui
    # n'est pas du texte (400), un path absent ou non-texte (403 via
    # ecriture_refusee). Distinct des corps malformes ci-dessus (issue #35).
    with open(panne, "rb") as fh:
        octets_temoin = fh.read()
    st, _, _ = req("POST", "/ulysse/ecrire", headers=same,
                   body=json.dumps({"path": panne, "content": 123}).encode())
    check("Un « content » non-texte -> 400", st == 400, "HTTP %d" % st)
    st, _, _ = req("POST", "/ulysse/ecrire", headers=same,
                   body=json.dumps({"content": "x"}).encode())
    check("Un « path » absent -> 403", st == 403, "HTTP %d" % st)
    st, _, _ = req("POST", "/ulysse/ecrire", headers=same,
                   body=json.dumps({"path": 123, "content": "x"}).encode())
    check("Un « path » non-texte -> 403", st == 403, "HTTP %d" % st)
    with open(panne, "rb") as fh:
        octets_apres = fh.read()
    check("...et le temoin des champs faux n'a pas bouge non plus",
          octets_apres == octets_temoin)

    # Hermes peut REFUSER (chemin interdit chez lui, disque plein) : la route
    # relaie SON statut et son message tels quels, n'ecrit rien — et la copie
    # gardee juste avant le refus survit (issue #44).
    refus = os.path.join(home, "refus.md")
    with open(refus, "w", encoding="utf-8") as fh:
        fh.write("avant le refus\n")
    for code in (403, 500):
        FakeDashboard.panne_ecriture = (code, "interdit par le faux backend")
        st, _, txt = ecrire(refus, "jamais ecrit\n")
        FakeDashboard.panne_ecriture = None
        with open(refus, encoding="utf-8") as fh:
            intact = fh.read()
        check("un refus %d d'Hermes est relaye tel quel, rien n'est ecrit" % code,
              st == code and "refuse l'ecriture" in txt
              and "interdit par le faux backend" in txt
              and intact == "avant le refus\n",
              "HTTP %d — %s" % (st, txt[:80]))
    gardes_refus = serve.lister_versions(refus)
    copie_refus = ""
    if gardes_refus:
        with open(os.path.join(serve.dossier_versions(refus),
                               gardes_refus[0]["nom"]), encoding="utf-8") as fh:
            copie_refus = fh.read()
    check("...et les copies gardees avant chaque refus sont toujours la",
          len(gardes_refus) == 2 and copie_refus == "avant le refus\n",
          "%d garde(s)" % len(gardes_refus))

    # La frontiere de la route elle-meme : sans chemin, ou hors du dossier
    # d'Hermes, on refuse — lister les versions d'un fichier arbitraire
    # reviendrait a lire le disque a travers le coffre (issue #22).
    st, _, _ = req("GET", "/ulysse/versions", headers=same)
    check("Versions sans chemin -> 400", st == 400, "HTTP %d" % st)
    st, _, _ = req("GET", "/ulysse/versions?path=" + urllib.parse.quote(dehors),
                   headers=same)
    check("...et un chemin hors du dossier d'Hermes -> 400", st == 400, "HTTP %d" % st)
    st, _, _ = req("GET", "/ulysse/versions?path="
                   + urllib.parse.quote(os.path.join(home, "..", "serve.py")),
                   headers=same)
    check("...meme par un detour « .. »", st == 400, "HTTP %d" % st)

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

    # La MEME garde d'ecriture tient la route du retour en arriere : restaurer
    # est une ecriture, elle passe par ecriture_refusee AVANT tout le reste —
    # le refus est un 403 de frontiere, pas un 400 de version (issue #28).
    soul_rest = os.path.join(home, "SOUL.md")
    with open(soul_rest, "w", encoding="utf-8") as fh:
        fh.write("intouchable\n")
    st, _, _ = req("POST", "/ulysse/restaurer", headers=same,
                   body=json.dumps({"path": soul_rest,
                                    "nom": "SOUL.md.2026-01-01-000000"}).encode())
    with open(soul_rest, encoding="utf-8") as fh:
        tjrs = fh.read()
    check("Restaurer SOUL.md est refuse (403) et le fichier n'a pas bouge",
          st == 403 and tjrs == "intouchable\n", "HTTP %d" % st)
    os.remove(soul_rest)

    st, _, _ = req("POST", "/ulysse/restaurer", headers=same,
                   body=json.dumps({"path": dehors,
                                    "nom": "serve.py.2026-01-01-000000"}).encode())
    check("Restaurer hors du dossier d'Hermes est refuse (403)",
          st == 403, "HTTP %d" % st)

    vers_rest = serve.lister_versions(memo)
    if vers_rest:
        cible_v = os.path.join(serve.dossier_versions(memo), vers_rest[0]["nom"])
        st, _, _ = req("POST", "/ulysse/restaurer", headers=same,
                       body=json.dumps({"path": cible_v,
                                        "nom": os.path.basename(cible_v)
                                        + ".2026-01-01-000000"}).encode())
        check("Restaurer PAR-DESSUS une version gardee est refuse (403)",
              st == 403, "HTTP %d" % st)

    # La garde peut ECHOUER (coffre inaccessible) : restaurer garde AVANT de
    # copier, et si la copie de l'etat courant ne peut pas se faire, rien ne
    # bouge — 500 qui le dit (issue #45). Le coffre passe en lecture seule :
    # la version source y reste LISIBLE, mais rien ne peut plus s'y ecrire.
    coin = os.path.join(home, "coin-500")
    _sh.rmtree(coin, ignore_errors=True)  # le faux home SURVIT d'un run a
    os.makedirs(coin, exist_ok=True)      # l'autre : on repart de zero ici
    cible500 = os.path.join(coin, "cible.md")
    with open(cible500, "w", encoding="utf-8") as fh:
        fh.write("v1\n")
    st, _, _ = ecrire(cible500, "v2\n")
    v500 = serve.lister_versions(cible500)
    check("(prealable) une version de v1 existe", st == 200 and len(v500) == 1)
    coffre500 = serve.dossier_versions(cible500)
    os.chmod(coffre500, 0o555)
    try:
        st, _, txt = req("POST", "/ulysse/restaurer", headers=same,
                         body=json.dumps({"path": cible500,
                                          "nom": v500[0]["nom"]}).encode())
    finally:
        os.chmod(coffre500, 0o755)
    with open(cible500, encoding="utf-8") as fh:
        courant500 = fh.read()
    check("coffre inaccessible -> 500 qui le dit, rien ne bouge",
          st == 500 and "echoue" in txt and courant500 == "v2\n",
          "HTTP %d — %r" % (st, courant500[:10]))
    st, _, _ = req("POST", "/ulysse/restaurer", headers=same,
                   body=json.dumps({"path": cible500,
                                    "nom": v500[0]["nom"]}).encode())
    with open(cible500, encoding="utf-8") as fh:
        courant500 = fh.read()
    check("...et le coffre libere, le retour en arriere passe (200)",
          st == 200 and courant500 == "v1\n", "HTTP %d" % st)

    # L'autre echec du meme geste : la garde a REUSSI mais la COPIE finale
    # (copy2 vers la cible) ne peut pas se faire — cible verrouillee. 500 qui
    # le dit, et l'etat courant n'a pas bouge (issue #78).
    os.chmod(cible500, 0o444)
    try:
        st, _, txt = req("POST", "/ulysse/restaurer", headers=same,
                         body=json.dumps({"path": cible500,
                                          "nom": v500[0]["nom"]}).encode())
    finally:
        os.chmod(cible500, 0o644)
    with open(cible500, encoding="utf-8") as fh:
        toujours500 = fh.read()
    check("cible verrouillee : la copie finale echoue -> 500, rien ne bouge",
          st == 500 and "echoue" in txt and toujours500 == "v1\n",
          "HTTP %d — %s" % (st, txt[:80]))
    st, _, _ = req("POST", "/ulysse/restaurer", headers=same,
                   body=json.dumps({"path": cible500,
                                    "nom": v500[0]["nom"]}).encode())
    check("...et la cible deverrouillee, le retour en arriere repasse (200)",
          st == 200, "HTTP %d" % st)

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

    print("\n-- HEAD : les deux branches, relais et statique (issue #57) --")

    FakeDashboard.seen.clear()
    st, entetes, corps_h = req("HEAD", "/api/status", headers=same)
    check("HEAD sur une route relais -> 200, et le dashboard a recu un HEAD",
          st == 200 and bool(FakeDashboard.seen)
          and FakeDashboard.seen[-1].get("method") == "HEAD",
          "HTTP %d — vu: %s" % (st, FakeDashboard.seen[-1].get("method")
                                if FakeDashboard.seen else "rien"))
    st, entetes, corps_h = req("HEAD", "/ulysse-app.js", headers=same)
    cl = next((v for k, v in entetes.items()
               if k.lower() == "content-length"), None)
    check("HEAD sur un fichier servi -> 200, corps vide, Content-Length pose",
          st == 200 and corps_h == "" and cl is not None and int(cl) > 0,
          "HTTP %d, corps=%r, CL=%s" % (st, corps_h[:10], cl))
    st, _, _ = req("HEAD", "/route-qui-n-existe-pas", headers=same)
    check("HEAD sur l'inconnu -> 404", st == 404, "HTTP %d" % st)

    print("\n-- PUT/PATCH/DELETE : 405 local, relais sinon (issue #58) --")

    for methode in ("PUT", "PATCH", "DELETE"):
        st, entetes, _ = req(methode, "/ulysse/corbeille", headers=same)
        cors = any(k.lower().startswith("access-control-") for k in entetes)
        check("%s sur une route locale -> 405, sans en-tete CORS" % methode,
              st == 405 and not cors, "HTTP %d%s" % (st, " +CORS" if cors else ""))
        FakeDashboard.seen.clear()
        st, _, _ = req(methode, "/api/foo", headers=same)
        check("%s sur /api/* est RELAYE, methode comprise" % methode,
              st == 200 and bool(FakeDashboard.seen)
              and FakeDashboard.seen[-1].get("method") == methode,
              "HTTP %d — vu: %s" % (st, FakeDashboard.seen[-1].get("method")
                                    if FakeDashboard.seen else "rien"))
        # La garde tient AUSSI sur ces methodes : Host ou Origin etrangere ->
        # 403 avant le relais, rien n'atteint le dashboard (issue #66).
        FakeDashboard.seen.clear()
        st1, _, _ = req(methode, "/api/foo",
                        headers=dict(same, Host="mechant.example.com"))
        st2, _, _ = req(methode, "/api/foo",
                        headers={"Origin": "http://evil.example.com"})
        check("%s hostile (Host puis Origin) -> 403, rien ne passe" % methode,
              st1 == 403 and st2 == 403 and not FakeDashboard.seen,
              "HTTP %d / %d — vus: %d" % (st1, st2, len(FakeDashboard.seen)))

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
    # `serve.PORT` ne se lit pas ici : ce banc l'a mute a 18080 pour son
    # propre serveur. La constante du FICHIER, elle, ne ment pas.
    import verif_ports
    with open("serve.py", encoding="utf-8") as f:
        m = re.search(r"^PORT = (\d+)", f.read(), re.M)
    defaut_serve = int(m.group(1)) if m else -1
    check("serve.PORT et verif_ports.UI_PORT partent du meme defaut",
          defaut_serve == verif_ports.UI_PORT,
          "serve=%d verif_ports=%d" % (defaut_serve, verif_ports.UI_PORT))
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

    print("\n=== 8. La corbeille : la seule porte qui detruit (issue #19) ===")

    bac = tempfile.mkdtemp(prefix="ulysse-essai-corbeille-")
    corbeille = serve.corbeille_dir()

    def jeter(path):
        return req("POST", "/ulysse/corbeille/jeter", headers=same,
                   body=json.dumps({"path": path}).encode())

    def restaurer(ident):
        return req("POST", "/ulysse/corbeille/restaurer", headers=same,
                   body=json.dumps({"id": ident}).encode())

    def vider(corps):
        return req("POST", "/ulysse/corbeille/vider", headers=same,
                   body=json.dumps(corps).encode())

    # -- les refus, un par garde : chacun a une raison, et il la dit --------
    st, _, _ = jeter(None)
    check("jeter sans chemin -> 403", st == 403, "HTTP %d" % st)
    st, _, _ = jeter(os.path.join(bac, "fantome.txt"))
    check("jeter un fichier deja absent -> 403", st == 403, "HTTP %d" % st)

    soul = os.path.join(bac, "SOUL.md")
    with open(soul, "w", encoding="utf-8") as f:
        f.write("ce qu'Ulysse s'autorise")
    st, _, corps = jeter(soul)
    check("SOUL.md ne se jette pas, et le refus le nomme",
          st == 403 and "SOUL" in corps, "HTTP %d — %s" % (st, corps[:80]))

    st, _, _ = jeter(os.path.abspath(os.sep))
    check("la racine d'un disque est refusee", st == 403, "HTTP %d" % st)
    st, _, _ = jeter(os.path.dirname(serve.hermes_home().rstrip(os.sep)))
    check("un dossier qui CONTIENT le Hermes Home est refuse", st == 403, "HTTP %d" % st)
    st, _, _ = jeter(os.path.abspath("serve.py"))
    check("web/ — le produit — ne se jette pas lui-meme", st == 403, "HTTP %d" % st)
    os.makedirs(corbeille, exist_ok=True)
    st, _, _ = jeter(corbeille)
    check("la corbeille ne se jette pas dans elle-meme", st == 403, "HTTP %d" % st)

    coffre = os.path.join(bac, serve.DOSSIER_VERSIONS)
    os.makedirs(coffre, exist_ok=True)
    version = os.path.join(coffre, "memoire.md.2020-01-01")
    with open(version, "w", encoding="utf-8") as f:
        f.write("etat d'avant")
    st, _, _ = jeter(version)
    check("une version gardee est refusee : c'est le retour en arriere",
          st == 403, "HTTP %d" % st)

    # -- jeter DEPLACE, il n'efface pas ------------------------------------
    doc = os.path.join(bac, "brouillon.txt")
    with open(doc, "w", encoding="utf-8") as f:
        f.write("premier jet")
    st, _, corps = jeter(doc)
    e1 = (json.loads(corps).get("entree") or {}) if st == 200 else {}
    check("jeter un vrai fichier -> 200 et une entree d'index",
          st == 200 and bool(e1.get("id")), "HTTP %d — %s" % (st, corps[:80]))
    check("...l'origine est vide, l'objet est dans la corbeille",
          not os.path.exists(doc)
          and os.path.isfile(os.path.join(corbeille, e1.get("id", "?"))))

    # Le deplacement peut ECHOUER (corbeille verrouillee) : 500 qui promet
    # « Rien n'a bouge » — et rien n'a bouge : l'origine est intacte, l'index
    # ne porte aucune entree fantome (issue #73).
    lourd = os.path.join(bac, "lourd.txt")
    with open(lourd, "w", encoding="utf-8") as fh:
        fh.write("reste chez moi\n")
    index_avant_500 = [e.get("id") for e in serve.corbeille_index()]
    os.chmod(corbeille, 0o555)
    try:
        st, _, corps = jeter(lourd)
    finally:
        os.chmod(corbeille, 0o755)
    check("corbeille verrouillee au jeter -> 500, l'origine n'a pas bouge",
          st == 500 and "Rien n'a" in corps and os.path.isfile(lourd)
          and [e.get("id") for e in serve.corbeille_index()] == index_avant_500,
          "HTTP %d — %s" % (st, corps[:80]))
    st, _, corps = jeter(lourd)
    e_lourd = (json.loads(corps).get("entree") or {}) if st == 200 else {}
    check("...et deverrouillee, le meme jeter passe (200)",
          st == 200 and bool(e_lourd.get("id")), "HTTP %d" % st)
    vider({"id": e_lourd.get("id", "?")})

    with open(doc, "w", encoding="utf-8") as f:
        f.write("second jet")
    st, _, corps = jeter(doc)
    e2 = (json.loads(corps).get("entree") or {}) if st == 200 else {}
    check("le meme nom jete deux fois : deux identifiants, rien d'ecrase",
          st == 200 and bool(e2.get("id")) and e2.get("id") != e1.get("id")
          and os.path.isfile(os.path.join(corbeille, e1.get("id", "?")))
          and os.path.isfile(os.path.join(corbeille, e2.get("id", "?"))),
          "%s / %s" % (e1.get("id"), e2.get("id")))

    # Un DOSSIER se jette aussi — entier, avec ce qu'il contient — et se vide
    # de meme : la branche rmtree du vider n'existe que pour lui (issue #53).
    malle = os.path.join(bac, "malle")
    os.makedirs(os.path.join(malle, "fond"), exist_ok=True)
    with open(os.path.join(malle, "fond", "objet.txt"), "w", encoding="utf-8") as fh:
        fh.write("au fond de la malle\n")
    st, _, corps = jeter(malle)
    e_malle = (json.loads(corps).get("entree") or {}) if st == 200 else {}
    dans_corbeille = os.path.join(corbeille, e_malle.get("id", "?"))
    check("jeter un dossier -> 200, entree marquee dossier:true",
          st == 200 and e_malle.get("dossier") is True, corps[:80])
    check("...le dossier a quitte l'origine, son contenu est dans la corbeille",
          not os.path.exists(malle)
          and os.path.isfile(os.path.join(dans_corbeille, "fond", "objet.txt")))
    st, _, corps = vider({"id": e_malle.get("id", "?")})
    vus_malle = [e.get("id") for e in
                 json.loads(req("GET", "/ulysse/corbeille", headers=same)[2])
                 .get("entrees", [])]
    check("vider l'entree-dossier -> 200, efface=1, l'arbre entier a disparu",
          st == 200 and json.loads(corps).get("efface") == 1
          and not os.path.exists(dans_corbeille)
          and e_malle.get("id") not in vus_malle,
          "HTTP %d — %s" % (st, corps[:60]))

    # -- restaurer remet, et n'ecrase JAMAIS -------------------------------
    st, _, _ = restaurer(e1.get("id", "?"))
    with open(doc, encoding="utf-8") as f:
        revenu = f.read() if os.path.exists(doc) else ""
    check("restaurer remet a sa place, contenu intact",
          st == 200 and revenu == "premier jet", "HTTP %d — %r" % (st, revenu[:30]))
    st, _, corps = restaurer(e2.get("id", "?"))
    check("...et refuse (409) quand la place est reoccupee",
          st == 409 and os.path.isfile(os.path.join(corbeille, e2.get("id", "?"))),
          "HTTP %d" % st)
    st, _, _ = restaurer("../../ailleurs")
    check("un identifiant-chemin est refuse au restaurer", st == 400, "HTTP %d" % st)
    st, _, _ = restaurer("inconnu-jamais-vu")
    check("un identifiant inconnu -> 409, dit clairement", st == 409, "HTTP %d" % st)

    # Le dossier d'origine peut avoir DISPARU entre le jeter et le restaurer :
    # la route le recree plutot que d'echouer — remettre a sa place, c'est
    # remettre la place aussi (issue #40).
    nid = os.path.join(bac, "sous", "dossier")
    os.makedirs(nid, exist_ok=True)
    oiseau = os.path.join(nid, "oiseau.txt")
    with open(oiseau, "w", encoding="utf-8") as fh:
        fh.write("contenu du nid\n")
    st, _, corps = jeter(oiseau)
    e_nid = (json.loads(corps).get("entree") or {}) if st == 200 else {}
    os.rmdir(nid)
    os.rmdir(os.path.dirname(nid))
    st, _, _ = restaurer(e_nid.get("id", "?"))
    contenu_nid = ""
    if os.path.isfile(oiseau):
        with open(oiseau, encoding="utf-8") as fh:
            contenu_nid = fh.read()
    check("restaurer recree le dossier d'origine disparu, contenu intact",
          st == 200 and contenu_nid == "contenu du nid\n", "HTTP %d" % st)

    # L'objet peut etre SORTI de la corbeille a la main (l'index le croit
    # encore la) : restaurer refuse en le disant — la corbeille ne pretend
    # pas detenir ce qu'elle n'a plus — et n'efface rien (issue #49).
    fantome = os.path.join(bac, "fantome-restaurer.txt")
    with open(fantome, "w", encoding="utf-8") as fh:
        fh.write("bientot sorti\n")
    st, _, corps = jeter(fantome)
    e_fant = (json.loads(corps).get("entree") or {}) if st == 200 else {}
    os.remove(os.path.join(corbeille, e_fant.get("id", "?")))
    st, _, corps = restaurer(e_fant.get("id", "?"))
    reste_indexe = any(e.get("id") == e_fant.get("id")
                       for e in serve.corbeille_index())
    check("restaurer un objet sorti a la main -> 409 qui le dit, index intact",
          st == 409 and "sorti" in corps and reste_indexe,
          "HTTP %d — %s" % (st, corps[:80]))
    serve.corbeille_ecrire_index(
        [e for e in serve.corbeille_index() if e.get("id") != e_fant.get("id")])

    # La remise en place peut ECHOUER (dossier d'origine verrouille) : 500
    # qui le dit, l'objet reste dans la corbeille, l'entree dans l'index —
    # la panne ne perd rien (issue #74).
    abri = os.path.join(bac, "abri")
    os.makedirs(abri, exist_ok=True)
    fragile = os.path.join(abri, "fragile.txt")
    with open(fragile, "w", encoding="utf-8") as fh:
        fh.write("a remettre\n")
    st, _, corps = jeter(fragile)
    e_frag = (json.loads(corps).get("entree") or {}) if st == 200 else {}
    os.chmod(abri, 0o555)
    try:
        st, _, corps = restaurer(e_frag.get("id", "?"))
    finally:
        os.chmod(abri, 0o755)
    check("origine verrouillee au restaurer -> 500, l'objet reste en corbeille",
          st == 500 and "echoue" in corps
          and os.path.isfile(os.path.join(corbeille, e_frag.get("id", "?")))
          and any(e.get("id") == e_frag.get("id")
                  for e in serve.corbeille_index()),
          "HTTP %d — %s" % (st, corps[:80]))
    st, _, _ = restaurer(e_frag.get("id", "?"))
    with open(fragile, encoding="utf-8") as fh:
        revenu_frag = fh.read()
    check("...et deverrouillee, la remise en place passe, contenu intact",
          st == 200 and revenu_frag == "a remettre\n", "HTTP %d" % st)

    # -- vider : la SEULE destruction, et ses deux gardes ------------------
    st, _, _ = vider({"id": "../../" + e2.get("id", "x")})
    check("vider avec un identifiant-chemin est refuse sans rien effacer",
          st == 409 and os.path.isfile(os.path.join(corbeille, e2.get("id", "?"))),
          "HTTP %d" % st)
    # Un JSON valide mais sans champ utile ne detruit RIEN : ni « id », ni
    # « tout: true » -> on refuse, on n'interprete pas (issue #36).
    st, _, _ = vider({})
    check("vider sans « id » ni « tout » -> 400", st == 400, "HTTP %d" % st)
    st, _, _ = vider({"id": 123})
    check("...et un « id » non-texte -> 400", st == 400, "HTTP %d" % st)
    check("...sans qu'aucun de ces refus n'ait rien efface",
          os.path.isfile(os.path.join(corbeille, e2.get("id", "?"))))
    # Un id que l'index ne connait plus (purge entre-temps) : vider refuse en
    # le disant, et ne touche a rien — meme pas au fichier homonyme qui
    # trainerait encore dans le dossier (issue #50).
    disparu = os.path.join(bac, "disparu-vider.txt")
    with open(disparu, "w", encoding="utf-8") as fh:
        fh.write("hors index\n")
    st, _, corps = jeter(disparu)
    e_disp = (json.loads(corps).get("entree") or {}) if st == 200 else {}
    serve.corbeille_ecrire_index(
        [e for e in serve.corbeille_index() if e.get("id") != e_disp.get("id")])
    st, _, corps = vider({"id": e_disp.get("id", "?")})
    check("vider un id que l'index ne connait plus -> 409 qui le dit",
          st == 409 and "n'est plus dans la corbeille" in corps,
          "HTTP %d — %s" % (st, corps[:80]))
    check("...et le fichier encore present dans le dossier n'est pas touche",
          os.path.isfile(os.path.join(corbeille, e_disp.get("id", "?"))))
    os.remove(os.path.join(corbeille, e_disp.get("id", "?")))
    st, _, corps = vider({"id": e2.get("id", "?")})
    check("vider un element : 200, efface=1, et il n'est plus la",
          st == 200 and json.loads(corps).get("efface") == 1
          and not os.path.exists(os.path.join(corbeille, e2.get("id", "?"))),
          "HTTP %d — %s" % (st, corps[:60]))

    # L'effacement peut ECHOUER (dossier verrouille) : 500 qui le dit, et
    # rien ne bouge — ni le fichier, ni son entree d'index (issue #70).
    tenace = os.path.join(bac, "tenace.txt")
    with open(tenace, "w", encoding="utf-8") as fh:
        fh.write("dur a effacer\n")
    st, _, corps = jeter(tenace)
    e_ten = (json.loads(corps).get("entree") or {}) if st == 200 else {}
    os.chmod(corbeille, 0o555)
    try:
        st, _, corps = vider({"id": e_ten.get("id", "?")})
    finally:
        os.chmod(corbeille, 0o755)
    encore_indexe = any(e.get("id") == e_ten.get("id")
                        for e in serve.corbeille_index())
    check("corbeille verrouillee -> 500 qui le dit, fichier et index intacts",
          st == 500 and "echoue" in corps and encore_indexe
          and os.path.isfile(os.path.join(corbeille, e_ten.get("id", "?"))),
          "HTTP %d — %s" % (st, corps[:80]))
    st, _, corps = vider({"id": e_ten.get("id", "?")})
    check("...et la corbeille deverrouillee, l'effacement passe (efface=1)",
          st == 200 and json.loads(corps).get("efface") == 1, "HTTP %d" % st)

    victime = os.path.join(bac, "victime.txt")
    with open(victime, "w", encoding="utf-8") as f:
        f.write("toujours la")
    lien_id = "2020-01-01-000000__lien"
    lien = os.path.join(corbeille, lien_id)
    try:
        os.symlink(victime, lien)
        peut_lier = True
    except (OSError, NotImplementedError):
        peut_lier = False
    if peut_lier:
        serve.corbeille_ecrire_index(
            [{"id": lien_id, "nom": "lien", "origine": victime + ".faux",
              "quand": "2020-01-01-000000", "dossier": False}]
            + serve.corbeille_index())
        st, _, corps = vider({"id": lien_id})
        with open(victime, encoding="utf-8") as f:
            encore = f.read()
        check("un lien vers l'exterieur n'est pas suivi : la cible survit",
              st == 200 and json.loads(corps).get("efface") == 0
              and encore == "toujours la",
              "HTTP %d — %s" % (st, corps[:60]))
        os.remove(lien)
        serve.corbeille_ecrire_index(
            [e for e in serve.corbeille_index() if e.get("id") != lien_id])
    else:
        print("  (liens symboliques indisponibles ici — garde non mesurable)")

    # -- vider tout, le cas NOMINAL : de vrais fichiers partent et se
    #    comptent — un vider qui ne supprimerait rien passait au vert,
    #    l'autre test ne voyant que l'orphelin (issue #54) ------------------
    reels = []
    for nom_reel in ("plein-un.txt", "plein-deux.txt"):
        chemin_reel = os.path.join(bac, nom_reel)
        with open(chemin_reel, "w", encoding="utf-8") as fh:
            fh.write("a effacer pour de bon\n")
        st, _, corps = jeter(chemin_reel)
        reels.append((json.loads(corps).get("entree") or {}) if st == 200 else {})
    st, _, corps = vider({"tout": True})
    st2, _, corps2 = req("GET", "/ulysse/corbeille", headers=same)
    check("vider tout avec de vrais fichiers -> 200, efface=2",
          st == 200 and json.loads(corps).get("efface") == 2,
          "HTTP %d — %s" % (st, corps[:60]))
    check("...les deux ont quitte le dossier et la liste est vide",
          all(not os.path.exists(os.path.join(corbeille, e.get("id", "?")))
              for e in reels)
          and st2 == 200 and json.loads(corps2).get("entrees") == [])

    # -- la liste ne pretend pas detenir ce qui est sorti a la main --------
    st, _, corps = jeter(victime)
    e3 = (json.loads(corps).get("entree") or {}) if st == 200 else {}
    os.remove(os.path.join(corbeille, e3.get("id", "?")))
    st, _, corps = req("GET", "/ulysse/corbeille", headers=same)
    vus = [e.get("id") for e in json.loads(corps).get("entrees", [])]
    check("la liste confronte l'index au disque : le sorti a la main disparait",
          st == 200 and e3.get("id") not in vus, str(vus))

    # -- vider tout : l'index connu part, la corbeille finit vide ----------
    # A ce stade l'index ne porte QUE l'entree orpheline (sortie a la main) :
    # vider doit purger l'index sans la compter — « efface » ne dit que ce
    # que le geste a reellement fait disparaitre (issue #41).
    st, _, corps = vider({"tout": True})
    st2, _, corps2 = req("GET", "/ulysse/corbeille", headers=same)
    check("vider tout -> 200, et la liste finit vide",
          st == 200 and st2 == 200 and json.loads(corps2).get("entrees") == [],
          "HTTP %d puis %s" % (st, corps2[:60]))
    check("...et l'orphelin purge de l'index n'est PAS compte comme efface",
          st == 200 and json.loads(corps).get("efface") == 0, corps[:60])

    print("\n=== 9. /ulysse/set-model : la route, pas seulement son helper (issue #20) ===")

    # CONFIG_FILE est redirige vers une COPIE jetable : la route ecrit un vrai
    # fichier, versions comprises, mais jamais celui du produit.
    etabli = tempfile.mkdtemp(prefix="ulysse-essai-config-")
    copie = os.path.join(etabli, "ulysse-config.js")
    with open(copie, "w", encoding="utf-8", newline="") as f:
        f.write('window.ULYSSE_CONFIG = {\n'
                '  PROXY_MODEL: "",\n'
                '  SESSION_MODEL: "modele-du-debut",\n'
                '};\n')
    with open(serve.CONFIG_FILE, "rb") as f:
        vrai_avant = f.read()

    def set_model(corps):
        return req("POST", "/ulysse/set-model", headers=same,
                   body=json.dumps(corps).encode())

    config_avant = serve.CONFIG_FILE
    serve.CONFIG_FILE = copie
    try:
        st, _, corps = set_model({"key": "PROXY_MODEL", "value": "essai/modele-x"})
        rep = json.loads(corps) if st == 200 else {}
        with open(copie, encoding="utf-8", newline="") as f:
            texte = f.read()
        check("poser un modele -> 200, la valeur est ecrite",
              st == 200 and 'PROXY_MODEL: "essai/modele-x"' in texte,
              "HTTP %d — %s" % (st, corps[:80]))
        garde = rep.get("version_gardee") or ""
        check("...et une version datee a ete mise de cote AVANT",
              bool(garde) and os.path.isfile(
                  os.path.join(etabli, serve.DOSSIER_VERSIONS, garde)),
              garde or "aucune")

        with open(copie, "rb") as f:
            octets_ref = f.read()
        st, _, _ = set_model({"key": "INCONNUE", "value": "x"})
        with open(copie, "rb") as f:
            apres = f.read()
        check("une cle hors liste blanche -> 400, fichier intact",
              st == 400 and apres == octets_ref, "HTTP %d" % st)
        st, _, _ = set_model({"key": "PROXY_MODEL", "value": 123})
        with open(copie, "rb") as f:
            apres = f.read()
        check("une valeur non-texte -> 400, fichier intact",
              st == 400 and apres == octets_ref, "HTTP %d" % st)

        st, _, corps = set_model({"key": "PROXY_MODEL", "value": ""})
        rep = json.loads(corps) if st == 200 else {}
        with open(copie, encoding="utf-8", newline="") as f:
            texte = f.read()
        check("valeur vide = heritage : la cle est videe et la reponse le dit",
              st == 200 and 'PROXY_MODEL: ""' in texte and rep.get("value") == "",
              "HTTP %d — %s" % (st, corps[:80]))

        # La garde qui echoue : le dossier des versions est PRIS par un
        # fichier — makedirs ne peut pas, garder_version leve, rien ne s'ecrit.
        with open(copie, "rb") as f:
            octets_ref = f.read()
        coffre = os.path.join(etabli, serve.DOSSIER_VERSIONS)
        for nom in os.listdir(coffre):
            os.remove(os.path.join(coffre, nom))
        os.rmdir(coffre)
        with open(coffre, "w", encoding="utf-8") as f:
            f.write("j'occupe la place du coffre")
        st, _, _ = set_model({"key": "SESSION_MODEL", "value": "jamais-ecrit"})
        with open(copie, "rb") as f:
            apres = f.read()
        check("si la version ne peut etre gardee -> 500 et RIEN n'est ecrit",
              st == 500 and apres == octets_ref
              and "jamais-ecrit" not in apres.decode("utf-8"),
              "HTTP %d" % st)
        os.remove(coffre)

        # L'ECRITURE elle-meme peut echouer (fichier verrouille) : la garde a
        # ete posee, mais la valeur ne rentre pas — 500 « Ecriture impossible »
        # et le fichier n'a pas change d'un octet (issue #77).
        with open(copie, "rb") as f:
            octets_verrou = f.read()
        os.chmod(copie, 0o444)
        try:
            st, _, txt = set_model({"key": "PROXY_MODEL", "value": "verrouille"})
        finally:
            os.chmod(copie, 0o644)
        with open(copie, "rb") as f:
            apres_verrou = f.read()
        check("fichier config verrouille -> 500 « Ecriture impossible », intact",
              st == 500 and "impossible" in txt and apres_verrou == octets_verrou,
              "HTTP %d — %s" % (st, txt[:80]))
        st, _, _ = set_model({"key": "PROXY_MODEL", "value": "deverrouille"})
        with open(copie, encoding="utf-8", newline="") as f:
            texte = f.read()
        check("...et deverrouille, la meme ecriture passe (200)",
              st == 200 and 'PROXY_MODEL: "deverrouille"' in texte,
              "HTTP %d" % st)

        serve.CONFIG_FILE = os.path.join(etabli, "n-existe-pas.js")
        st, _, _ = set_model({"key": "PROXY_MODEL", "value": "x"})
        check("config introuvable -> 404", st == 404, "HTTP %d" % st)

        # L'AUTRE 404 : la cle est autorisee mais le fichier ne la porte pas
        # (config amputee, vieille version). On ne CREE pas la ligne — ecrire
        # une cle que le fichier ne connait pas serait inventer sa config —
        # et rien ne bouge (issue #27).
        ampute = os.path.join(etabli, "config-amputee.js")
        with open(ampute, "w", encoding="utf-8", newline="") as f:
            f.write('window.ULYSSE_CONFIG = {\n  PROXY_MODEL: "",\n};\n')
        with open(ampute, "rb") as f:
            octets_ref = f.read()
        serve.CONFIG_FILE = ampute
        st, _, _ = set_model({"key": "SESSION_MODEL", "value": "x"})
        with open(ampute, "rb") as f:
            apres = f.read()
        check("cle autorisee mais absente du fichier -> 404, fichier intact",
              st == 404 and apres == octets_ref, "HTTP %d" % st)
        st, _, _ = set_model({"key": "PROXY_MODEL", "value": "toujours-la"})
        with open(ampute, encoding="utf-8", newline="") as f:
            texte = f.read()
        check("...et la cle presente, elle, s'ecrit toujours (200)",
              st == 200 and 'PROXY_MODEL: "toujours-la"' in texte,
              "HTTP %d" % st)
    finally:
        serve.CONFIG_FILE = config_avant
    with open(serve.CONFIG_FILE, "rb") as f:
        vrai_apres = f.read()
    check("le vrai ulysse-config.js n'a pas bouge d'un octet",
          vrai_apres == vrai_avant)

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
