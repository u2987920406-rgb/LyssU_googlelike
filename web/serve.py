#!/usr/bin/env python3
"""Serveur statique + reverse-proxy /api/* pour les pages Ulysse.

Pourquoi un proxy
-----------------
session-b.html appelle le dashboard Hermes avec un en-tete personnalise
(X-Hermes-Session-Token). Un en-tete personnalise rend la requete « non
simple » : le navigateur envoie d'abord un preflight OPTIONS. Le dashboard
Hermes fait passer ce OPTIONS par son gate d'authentification et repond 401,
donc le navigateur bloque le fetch (« Failed to fetch »). Le WebSocket, lui,
n'est pas soumis a ce preflight et fonctionnait deja.

La solution ici est de supprimer le cross-origin plutot que de bricoler le
backend : la page appelle http://127.0.0.1:8080/api/... — la MEME origine que
la page elle-meme, donc aucun preflight — et ce serveur relaie vers le
dashboard (127.0.0.1:9123) en injectant lui-meme le jeton de session.

    navigateur ──(meme origine, sans preflight)──> serve.py :8080
                                                      │
                                         + X-Hermes-Session-Token
                                                      v
                                          dashboard Hermes :9123

Le code Hermes n'est pas touche.

Ce qui est servi / relaye
-------------------------
  /api/ws        -> tunnel WebSocket brut vers le dashboard
  /api/pty, /api/... -> relais HTTP (methode, corps et en-tetes conserves)
  tout le reste  -> fichiers statiques du dossier (session-b.html,
                    discussion.html, ulysse-config.js), Cache-Control: no-store
"""

import http.client
import http.server
import os
import re
import select
import shutil
import socket
import socketserver
import ssl
import sys
import urllib.parse

# ===========================================================================
# EDITER ICI — configuration du serveur
# ===========================================================================

PORT = 8080

# Origine du backend Hermes vers lequel /api/* est relaye. Pas de slash final.
# Laisser "" pour lire la cle HERMES_URL dans ulysse-config.js (recommande :
# un seul endroit a modifier). Sinon forcer la valeur ici, par ex.
# "http://127.0.0.1:9123".
DASHBOARD_URL = ""

# Jeton de session Hermes injecte dans chaque requete relayee.
# Laisser None pour lire la cle SESSION_TOKEN dans ulysse-config.js — le jeton
# n'est ainsi ecrit qu'a un seul endroit, non versionne. Sinon mettre la
# chaine ici (ex. "ulysse_TEST_999").
SESSION_TOKEN = None

# Valeurs de repli si ulysse-config.js est absent ou muet.
DASHBOARD_URL_FALLBACK = "http://127.0.0.1:9123"
SESSION_TOKEN_FALLBACK = ""

CONFIG_FILE = "ulysse-config.js"

# ===========================================================================
# Lecture de ulysse-config.js
# ===========================================================================

# ulysse-config.js est du JavaScript, pas du JSON : on ne l'evalue pas, on y
# pioche simplement les deux valeurs qui nous interessent. Format attendu :
#     CLE: "valeur",
_VALUE_RE = '(?m)^\\s*%s\\s*:\\s*"([^"]*)"'


def read_config_value(text, key):
    """Retourne la valeur chaine de `key` dans ulysse-config.js, ou None."""
    m = re.search(_VALUE_RE % re.escape(key), text)
    return m.group(1) if m else None


def load_config():
    """Resout (backend, jeton) : constantes du fichier > ulysse-config.js > repli."""
    backend, token = DASHBOARD_URL, SESSION_TOKEN
    text = ""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()

    if not backend:
        # HERMES_URL = le vrai backend, distinct de DASHBOARD_URL qui, cote
        # page, pointe desormais sur ce proxy (127.0.0.1:8080).
        backend = read_config_value(text, "HERMES_URL") or DASHBOARD_URL_FALLBACK
    if token is None:
        token = read_config_value(text, "SESSION_TOKEN")
        if token is None:
            token = SESSION_TOKEN_FALLBACK

    return backend.rstrip("/"), token


class Backend:
    """Cible du proxy, pre-decoupee une fois pour toutes au demarrage."""

    def __init__(self, url, token):
        parts = urllib.parse.urlsplit(url)
        self.url = url
        self.token = token
        self.scheme = parts.scheme or "http"
        self.host = parts.hostname or "127.0.0.1"
        self.port = parts.port or (443 if self.scheme == "https" else 80)
        self.netloc = parts.netloc
        self.secure = self.scheme == "https"


BACKEND = None  # renseigne dans main()

# En-tetes « hop-by-hop » : propres a une connexion, jamais relayes tels quels.
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "trailers", "transfer-encoding", "upgrade",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    """Fichiers statiques, plus un reverse-proxy sur /api/*."""

    # ------------------------------------------------------------------
    # Aiguillage
    # ------------------------------------------------------------------

    def is_api(self):
        return self.path == "/api" or self.path.startswith("/api/")

    def is_websocket(self):
        upgrade = (self.headers.get("Upgrade") or "").lower()
        return upgrade == "websocket"

    def do_GET(self):
        if self.is_api():
            if self.is_websocket():
                self.proxy_websocket()
            else:
                self.proxy_http("GET")
            return
        super().do_GET()

    def do_HEAD(self):
        if self.is_api():
            self.proxy_http("HEAD")
            return
        super().do_HEAD()

    def do_POST(self):
        self.proxy_or_405("POST")

    def do_PUT(self):
        self.proxy_or_405("PUT")

    def do_PATCH(self):
        self.proxy_or_405("PATCH")

    def do_DELETE(self):
        self.proxy_or_405("DELETE")

    def do_OPTIONS(self):
        """Preflight CORS traite localement.

        Normalement il n'y en a plus (la page est en meme origine), mais si la
        page est ouverte depuis une autre origine on repond nous-memes plutot
        que de relayer le OPTIONS au dashboard — c'est exactement ce OPTIONS
        que son gate d'auth rejetait en 401.
        """
        if not self.is_api():
            self.send_error(405, "Method Not Allowed")
            return
        origin = self.headers.get("Origin") or "*"
        asked = self.headers.get("Access-Control-Request-Headers")
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods",
                         "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers",
                         asked or "Content-Type, X-Hermes-Session-Token, Authorization")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def proxy_or_405(self, method):
        if self.is_api():
            self.proxy_http(method)
        else:
            self.send_error(405, "Method Not Allowed")

    # ------------------------------------------------------------------
    # Relais HTTP  (/api/sessions, /api/files, /api/health, /api/pty, ...)
    # ------------------------------------------------------------------

    def build_upstream_headers(self):
        """Recopie les en-tetes client, sans les hop-by-hop, avec le jeton."""
        out = {}
        for name, value in self.headers.items():
            low = name.lower()
            if low in HOP_BY_HOP or low in ("host", "content-length"):
                continue
            # Le jeton appartient au proxy : on ecrase ce que la page envoie.
            if BACKEND.token and low in ("x-hermes-session-token", "authorization"):
                continue
            out[name] = value
        out["Host"] = BACKEND.netloc
        if BACKEND.token:
            out["X-Hermes-Session-Token"] = BACKEND.token
        return out

    def proxy_http(self, method):
        body = b""
        length = self.headers.get("Content-Length")
        if length:
            try:
                body = self.rfile.read(int(length))
            except (ValueError, OSError):
                body = b""

        headers = self.build_upstream_headers()
        if body:
            headers["Content-Length"] = str(len(body))

        conn = None
        try:
            if BACKEND.secure:
                conn = http.client.HTTPSConnection(
                    BACKEND.host, BACKEND.port, timeout=120,
                    context=ssl.create_default_context())
            else:
                conn = http.client.HTTPConnection(BACKEND.host, BACKEND.port, timeout=120)
            conn.request(method, self.path, body=body or None, headers=headers)
            resp = conn.getresponse()
        except Exception as exc:  # backend eteint, port ferme, timeout...
            if conn:
                conn.close()
            self.send_error(502, "Bad Gateway",
                            "Dashboard Hermes injoignable sur %s (%s)" % (BACKEND.url, exc))
            return

        try:
            self.send_response(resp.status)
            for name, value in resp.getheaders():
                if name.lower() in HOP_BY_HOP:
                    continue
                self.send_header(name, value)
            # Meme origine en pratique, mais inoffensif et utile si la page
            # est ouverte autrement (file://, autre port...).
            self.send_header("Access-Control-Allow-Origin",
                             self.headers.get("Origin") or "*")
            self.end_headers()

            if method != "HEAD":
                # Copie en flux : marche aussi pour une reponse longue ou
                # chunkee (http.client a deja dechunke ; Transfer-Encoding a
                # ete filtre plus haut, le corps se termine a la fermeture).
                shutil.copyfileobj(resp, self.wfile)
        except (BrokenPipeError, ConnectionResetError):
            pass  # le navigateur a coupe : rien a signaler
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Relais WebSocket  (/api/ws)
    # ------------------------------------------------------------------

    def ws_path_with_token(self):
        """Garantit ?token=... dans l'URL : le handshake WS ne porte pas d'en-tete."""
        if not BACKEND.token:
            return self.path
        parts = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(parts.query, keep_blank_values=True)
        if not query.get("token", [""])[0]:
            query["token"] = [BACKEND.token]
        return urllib.parse.urlunsplit(
            ("", "", parts.path, urllib.parse.urlencode(query, doseq=True), parts.fragment))

    def proxy_websocket(self):
        """Tunnel brut.

        Apres le 101, un WebSocket n'est plus qu'un flux d'octets : on rejoue
        le handshake vers le dashboard, on renvoie sa reponse au navigateur,
        puis on recopie les octets dans les deux sens sans decoder les trames.
        Aucune dependance externe.
        """
        self.close_connection = True
        try:
            upstream = socket.create_connection((BACKEND.host, BACKEND.port), timeout=15)
            if BACKEND.secure:
                upstream = ssl.create_default_context().wrap_socket(
                    upstream, server_hostname=BACKEND.host)
        except OSError as exc:
            self.send_error(502, "Bad Gateway",
                            "WebSocket : dashboard injoignable (%s)" % exc)
            return

        try:
            # 1. Rejouer le handshake, jeton injecte, Host reecrit.
            lines = ["GET %s HTTP/1.1" % self.ws_path_with_token(),
                     "Host: %s" % BACKEND.netloc]
            for name, value in self.headers.items():
                low = name.lower()
                if low == "host":
                    continue
                if BACKEND.token and low in ("x-hermes-session-token", "authorization"):
                    continue
                lines.append("%s: %s" % (name, value))
            if BACKEND.token:
                lines.append("X-Hermes-Session-Token: %s" % BACKEND.token)
            upstream.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1"))

            # 2. Lire la reponse en NON bufferise : le dashboard emet
            #    'gateway.ready' immediatement apres le 101, et un buffer
            #    avalerait cette premiere trame avant le tunnel.
            raw = upstream.makefile("rb", buffering=0)
            head, status_line = b"", b""
            while True:
                line = raw.readline()
                if not line:
                    break
                if not status_line:
                    status_line = line
                head += line
                if line in (b"\r\n", b"\n"):
                    break

            self.connection.sendall(head)
            if b" 101 " not in status_line:
                # Refus du dashboard (401/403...) : la reponse est deja
                # transmise telle quelle, inutile d'ouvrir le tunnel.
                return

            # 3. Tunnel bidirectionnel. On lit directement sur la socket : le
            #    navigateur n'envoie aucune trame avant d'avoir recu le 101,
            #    donc self.rfile n'a rien mis en tampon.
            self.tunnel(self.connection, upstream)
        except (OSError, BrokenPipeError):
            pass
        finally:
            try:
                upstream.close()
            except OSError:
                pass

    @staticmethod
    def tunnel(a, b):
        """Recopie les octets entre deux sockets jusqu'a fermeture de l'une."""
        pair = {a: b, b: a}
        while True:
            readable, _, broken = select.select([a, b], [], [a, b], 30)
            if broken:
                return
            if not readable:
                continue  # simple inactivite : le WS a son propre ping/pong
            for sock in readable:
                try:
                    data = sock.recv(65536)
                except OSError:
                    return
                if not data:
                    return
                try:
                    pair[sock].sendall(data)
                except OSError:
                    return

    # ------------------------------------------------------------------
    # Statique (comportement d'origine)
    # ------------------------------------------------------------------

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    global BACKEND
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    url, token = load_config()
    backend = Backend(url, token)

    # Garde-fou : relayer vers soi-meme boucle a l'infini.
    if backend.port == PORT and backend.host in ("127.0.0.1", "localhost", "::1"):
        print("Erreur : le backend (%s) est ce serveur lui-meme." % url)
        print("Corrige HERMES_URL dans %s ou DASHBOARD_URL en tete de serve.py." % CONFIG_FILE)
        return 1

    BACKEND = backend

    shown = (token[:6] + "…" + token[-3:]) if len(token) > 12 else ("(aucun)" if not token else "…")
    print("Ulysse Session B : http://127.0.0.1:%d/session-b.html" % PORT)
    print("Ulysse Discussion : http://127.0.0.1:%d/discussion.html" % PORT)
    print("Proxy /api/*  ->  %s   (jeton %s)" % (backend.url, shown))
    print("Ctrl+C pour arreter.")

    with ThreadingServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nArret du serveur.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
