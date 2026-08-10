#!/usr/bin/env python3
"""Faux Hermes — rejoue le protocole REEL pour tester Ulysse sans backend.

Ce n'est PAS une simulation de complaisance. Chaque reponse reproduit la forme
exacte du code installe, et chaque controle que Hermes applique est applique
ici aussi :

  · Host verifie          (web_server.py:539  host_header_middleware)
  · jeton verifie         (web_server.py      _token_auth_seam)
  · Origin verifie sur WS (web_server.py:14690 _ws_host_origin_reason)
  · webhooks : POST seul, HMAC-SHA256 V2 obligatoire (webhook.py:653, 1086)
  · session.create renvoie {session_id, stored_session_id, info, …}
  · evenements en JSON-RPC newline-delimited (tui_gateway/ws.py)

Si Ulysse marche contre ce serveur, c'est qu'il franchit les memes portes que
celles que Hermes ferme. Si Ulysse triche, ce serveur le refuse.

    python faux_hermes.py [--port 9123] [--token XXX]
"""

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import socket
import struct
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

TOKEN = "faux_hermes_token"
DASH_PORT = 9123
GW_PORT = 8644
PROXY_PORT = 8645
BOUND = "127.0.0.1"

WEBHOOK_SECRET = "secret-faux-hermes-0123456789"
WEBHOOK_NAME = "resume-lundi"

# Journal partage : ce que les tests de persona inspectent apres coup.
JOURNAL = []
JLOCK = threading.Lock()


def note(kind, **kw):
    with JLOCK:
        JOURNAL.append(dict(kind=kind, t=time.time(), **kw))


def accepted_host(h):
    """web_server.py:_is_accepted_host — port optionnel, alias loopback."""
    h = (h or "").strip().lower()
    if not h:
        return False
    if h.startswith("["):
        close = h.find("]")
        host_only = h[1:close] if close != -1 else h.strip("[]")
    else:
        host_only = h.split(":")[0]
    return host_only in ("127.0.0.1", "localhost", "::1")


# ===========================================================================
# Le dashboard
# ===========================================================================

SESSIONS = [
    {"id": "sess_camille_01", "title": "Site vitrine — poterie",
     "message_count": 14, "cwd": "%USERPROFILE%/Projets/poterie",
     "source": "ulysse", "last_active": time.time() - 3600,
     "started_at": time.time() - 7200, "is_active": False},
    {"id": "sess_karim_02", "title": "Tri des factures 2026",
     "message_count": 7, "cwd": "%USERPROFILE%/Documents/compta",
     "source": "cli", "last_active": time.time() - 300,
     "started_at": time.time() - 900, "is_active": True},
    {"id": "sess_lea_03", "title": "Brouillon sans mémoire",
     "message_count": 2, "cwd": "", "source": "ulysse",
     "last_active": time.time() - 86400, "started_at": time.time() - 86400,
     "is_active": False},
]

FILES = {
    "": {"path": "", "parent": None, "entries": [
        {"name": "Projets", "path": "Projets", "is_directory": True},
        {"name": "Documents", "path": "Documents", "is_directory": True},
        {"name": "notes.md", "path": "notes.md", "is_directory": False,
         "size": 84, "mime_type": "text/markdown"},
        {"name": "gros.bin", "path": "gros.bin", "is_directory": False,
         "size": 210 * 1024 * 1024, "mime_type": "application/octet-stream"},
    ]},
    "Projets": {"path": "Projets", "parent": "", "entries": [
        {"name": "poterie", "path": "Projets/poterie", "is_directory": True},
    ]},
    "Projets/poterie": {"path": "Projets/poterie", "parent": "Projets", "entries": [
        {"name": "plan.md", "path": "Projets/poterie/plan.md", "is_directory": False,
         "size": 152, "mime_type": "text/markdown"},
    ]},
    "Documents": {"path": "Documents", "parent": "", "entries": []},
}

FILE_BODIES = {
    "notes.md": "# Notes\n\nCeci est un vrai fichier lu par /api/files/read.\n",
    "Projets/poterie/plan.md": "# Plan\n\n1. Cadrer\n2. Ecrire\n3. Verifier\n",
}

SKILLS = [
    {"name": "cadrage", "description": "Anime une séance de cadrage avant de construire.",
     "enabled": True, "provenance": "bundled"},
    {"name": "dataviz", "description": "Produit des visualisations lisibles et cohérentes.",
     "enabled": True, "provenance": "bundled"},
    {"name": "vieux-truc", "description": "Skill désactivé, pour vérifier l'affichage.",
     "enabled": False, "provenance": "user"},
]

CRON_JOBS = [
    {"id": "job_veille", "name": "Veille du lundi", "schedule": "0 9 * * 1",
     "prompt": "Résume la veille de la semaine.", "paused": False},
    {"id": "job_backup", "name": "Sauvegarde", "schedule": "0 2 * * *",
     "prompt": "Vérifie les sauvegardes.", "paused": True},
]

WEBHOOK_ENABLED = True

# Un compteur de livraisons : le vrai gateway en tire un par POST.
LIVRAISONS = [0]


class Dashboard(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    # -- helpers --------------------------------------------------------
    def send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def gate(self):
        """Les memes portes que le vrai dashboard, dans le meme ordre."""
        if not accepted_host(self.headers.get("Host")):
            note("dash_reject", why="host", host=self.headers.get("Host"))
            self.send_json(403, {"detail": "Host header does not match the bound host."})
            return False
        if self.headers.get("X-Hermes-Session-Token") != TOKEN:
            note("dash_reject", why="token", got=self.headers.get("X-Hermes-Session-Token"))
            self.send_json(401, {"detail": "Unauthorized"})
            return False
        return True

    LANGUES = {".md": "markdown", ".py": "python", ".js": "javascript",
               ".json": "json", ".txt": "text", ".css": "css", ".html": "html"}
    TEXTE_MAX = 2 * 1024 * 1024      # _FS_TEXT_SOURCE_MAX_BYTES

    def lire_texte(self, brut):
        """web_server.py:2627-2648 — meme forme, memes refus, meme ordre."""
        brut = (brut or "").strip()
        if not brut or "\0" in brut:
            self.send_json(400, {"detail": "Path is required" if not brut
                                 else "Invalid path"})
            return
        cible = os.path.abspath(os.path.expanduser(brut))
        try:
            st = os.stat(cible)
        except FileNotFoundError:
            self.send_json(404, {"detail": "File not found"})
            return
        except NotADirectoryError:
            self.send_json(404, {"detail": "File not found"})
            return
        except PermissionError:
            self.send_json(403, {"detail": "File is not readable"})
            return
        except OSError as exc:
            self.send_json(400, {"detail": str(exc) or "Invalid path"})
            return
        if os.path.isdir(cible):
            self.send_json(400, {"detail": "Path points to a directory"})
            return
        if st.st_size > self.TEXTE_MAX:
            self.send_json(413, {"detail": "File too large"})
            return
        with open(cible, "rb") as fh:
            data = fh.read()
        ext = os.path.splitext(cible)[1].lower()
        self.send_json(200, {
            "binary": b"\0" in data[:4096],
            "byteSize": st.st_size,
            "language": self.LANGUES.get(ext, "text"),
            "mimeType": "text/markdown" if ext == ".md" else "text/plain",
            "path": cible,
            "text": data.decode("utf-8", "replace"),
            "truncated": False,
        })

    # -- routes ---------------------------------------------------------
    def do_GET(self):
        if (self.headers.get("Upgrade") or "").lower() == "websocket":
            self.handle_ws()
            return
        if not self.gate():
            return
        p = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(p.query)
        note("dash_get", path=self.path)

        if p.path == "/api/status":
            self.send_json(200, {
                "version": "0.20.0", "release_date": "2026-07-01",
                "gateway_running": True, "gateway_state": "running",
                "gateway_platforms": {"webhook": {"connected": True}},
                "active_sessions": 1, "active_agents": 0,
                "auth_required": True, "nous_session_valid": True,
                "gateway": {"status": "ok", "state": "running"},
            })

        elif p.path == "/api/sessions":
            limit = int((q.get("limit") or ["20"])[0])
            if limit > 100:
                # Query(le=100) — FastAPI repond 422, pas 200.
                self.send_json(422, {"detail": [{"loc": ["query", "limit"],
                                                 "msg": "ensure this value is <= 100"}]})
                return
            order = (q.get("order") or ["created"])[0]
            if order not in ("created", "recent"):
                self.send_json(400, {"detail": "order must be one of: created, recent"})
                return
            rows = sorted(SESSIONS, key=lambda s: s["last_active"],
                          reverse=(order == "recent"))[:limit]
            self.send_json(200, {"sessions": rows, "total": len(SESSIONS),
                                 "limit": limit, "offset": 0})

        elif re.match(r"^/api/sessions/[^/]+/messages$", p.path):
            sid = p.path.split("/")[3]
            self.send_json(200, {
                "session_id": sid,
                "messages": [
                    {"role": "user", "content": "Peux-tu résumer où on en est ?"},
                    {"role": "assistant", "content": "Voici le point : trois étapes faites."},
                ],
                "pagination": {"limit": 50, "offset": 0, "returned": 2},
            })

        elif p.path == "/api/files":
            path = (q.get("path") or [""])[0]
            d = FILES.get(path)
            if d is None:
                self.send_json(404, {"detail": "Not found"})
                return
            self.send_json(200, d)

        elif p.path == "/api/files/read":
            path = (q.get("path") or [""])[0]
            body = FILE_BODIES.get(path)
            if body is None:
                self.send_json(404, {"detail": "Not found"})
                return
            b64 = base64.b64encode(body.encode("utf-8")).decode()
            self.send_json(200, {"name": path.split("/")[-1], "path": path,
                                 "size": len(body), "mime_type": "text/markdown",
                                 "data_url": "data:text/markdown;base64," + b64})

        elif p.path == "/api/memory":
            self.send_json(200, {
                "active": "builtin",
                "providers": [{"name": "builtin", "available": True}],
                "builtin_files": [
                    {"name": "SOUL.md", "path": "SOUL.md", "exists": True},
                    {"name": "memories/USER.md", "path": "memories/USER.md", "exists": True},
                    {"name": "memories/MEMORY.md", "path": "memories/MEMORY.md", "exists": True},
                ],
            })

        elif p.path == "/api/skills":
            self.send_json(200, SKILLS)          # une LISTE, pas un objet

        elif p.path == "/api/webhooks":
            self.send_json(200, {
                "enabled": WEBHOOK_ENABLED,
                "base_url": "http://localhost:%d" % GW_PORT,
                "subscriptions": [{
                    "name": WEBHOOK_NAME,
                    "description": "Résumé hebdo automatique",
                    "events": [], "deliver": "log", "deliver_only": False,
                    "prompt": "C'est lundi. Résume la veille de {payload.sujet}.",
                    "script": "", "skills": [],
                    "created_at": "2026-08-07T12:19:23Z",
                    "url": "http://localhost:%d/webhooks/%s" % (GW_PORT, WEBHOOK_NAME),
                    "secret_set": True, "enabled": True,
                }],
            })

        elif p.path == "/api/cron/jobs":
            self.send_json(200, {"jobs": CRON_JOBS})

        elif p.path == "/api/fs/read-text":
            # hermes_cli/web_server.py:2627 — la route par laquelle Ulysse LIT
            # un fichier de memoire. Elle manquait ici : tout le chemin de
            # lecture de la memoire n'etait donc jamais joue par les personas,
            # et un nom accentue n'avait jamais ete essaye. Trouve par T4.
            #
            # Le vrai `_fs_path` (l.1910) ne confine a AUCUN dossier : il
            # resout un chemin absolu et le lit. C'est la frontiere d'Hermes,
            # pas celle d'Ulysse — on la rejoue telle quelle, sinon ce faux
            # serait plus severe que ce qu'il imite.
            self.lire_texte((q.get("path") or [""])[0])

        elif p.path == "/api/config":
            self.send_json(200, {"model": {"default": "hy3"}, "approvals": {"mode": "smart"}})

        else:
            self.send_json(404, {"detail": "Not Found: " + p.path})

    def do_POST(self):
        if not self.gate():
            return
        p = urllib.parse.urlsplit(self.path)
        note("dash_post", path=self.path)
        m = re.match(r"^/api/cron/jobs/([^/]+)/(pause|resume|trigger)$", p.path)
        if m:
            jid, action = m.group(1), m.group(2)
            for j in CRON_JOBS:
                if j["id"] == jid:
                    if action == "pause":
                        j["paused"] = True
                    elif action == "resume":
                        j["paused"] = False
                    self.send_json(200, {"ok": True, "id": jid, "action": action})
                    return
            self.send_json(404, {"detail": "job introuvable"})
            return

        # /api/fs/write-text — la vraie route ECRIT vraiment sur le disque
        # (web_server.py:2651), par fichier temporaire puis os.replace. Le faux
        # doit ecrire aussi, sinon on ne pourrait pas verifier que serve.py
        # garde bien la version d'AVANT avant de laisser passer l'ecriture.
        if p.path == "/api/fs/write-text":
            try:
                n = int(self.headers.get("Content-Length") or 0)
                corps = json.loads(self.rfile.read(n).decode("utf-8"))
                chemin = corps["path"]
                with open(chemin, "w", encoding="utf-8") as fh:
                    fh.write(corps.get("content") or "")
            except Exception as exc:
                self.send_json(400, {"detail": str(exc)})
                return
            note("fs_write", path=chemin)
            self.send_json(200, {"ok": True, "path": chemin})
            return

        self.send_json(404, {"detail": "Not Found: " + p.path})

    # -- WebSocket ------------------------------------------------------
    def handle_ws(self):
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)

        def refuse(code, why):
            note("ws_reject", why=why, origin=self.headers.get("Origin"),
                 host=self.headers.get("Host"))
            self.send_response(code)
            self.send_header("X-Reject", why)
            self.send_header("Content-Length", "0")
            self.end_headers()

        # _ws_host_origin_reason : Host d'abord, puis Origin si presente.
        if not accepted_host(self.headers.get("Host")):
            refuse(403, "host_mismatch")
            return
        origin = self.headers.get("Origin")
        if origin:
            parsed = urllib.parse.urlparse(origin)
            if parsed.scheme in ("http", "https"):
                bound = "%s:%d" % (BOUND, DASH_PORT)
                if parsed.netloc != bound:
                    refuse(403, "origin_mismatch")
                    return
        if q.get("token", [""])[0] != TOKEN:
            refuse(401, "token_mismatch")
            return

        key = self.headers.get("Sec-WebSocket-Key", "")
        accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        self.wfile.write(("HTTP/1.1 101 Switching Protocols\r\n"
                          "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                          "Sec-WebSocket-Accept: %s\r\n\r\n" % accept).encode())
        self.wfile.flush()
        note("ws_open", origin=origin)
        Gateway(self.connection).run()


# ===========================================================================
# Le gateway JSON-RPC derriere le WebSocket
# ===========================================================================

def ws_frame(payload):
    data = payload.encode("utf-8")
    n = len(data)
    if n < 126:
        head = struct.pack("!BB", 0x81, n)
    elif n < 65536:
        head = struct.pack("!BBH", 0x81, 126, n)
    else:
        head = struct.pack("!BBQ", 0x81, 127, n)
    return head + data


def ws_read(sock):
    """Lit une trame texte masquee (client -> serveur). None a la fermeture."""
    def recvn(n):
        buf = b""
        while len(buf) < n:
            c = sock.recv(n - len(buf))
            if not c:
                return None
            buf += c
        return buf

    head = recvn(2)
    if not head:
        return None
    opcode = head[0] & 0x0F
    masked = head[1] & 0x80
    ln = head[1] & 0x7F
    if ln == 126:
        ext = recvn(2)
        if not ext:
            return None
        ln = struct.unpack("!H", ext)[0]
    elif ln == 127:
        ext = recvn(8)
        if not ext:
            return None
        ln = struct.unpack("!Q", ext)[0]
    mask = recvn(4) if masked else b"\0\0\0\0"
    if mask is None:
        return None
    data = recvn(ln) if ln else b""
    if data is None:
        return None
    if masked:
        data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    if opcode == 0x8:
        return None
    return data.decode("utf-8", "replace")


# Les sessions vivent AU SERVEUR, pas dans une connexion.
#
# tui_gateway/server.py:143 — `_sessions: dict[str, dict] = {}` au niveau du
# module. C'est ce qui permet a une deuxieme fenetre de reprendre une session
# ouverte par la premiere ; un registre par connexion rendrait `session.resume`
# impossible a jouer honnetement.
#
# Ce faux le gardait par connexion. Consequence : deux onglets recevaient tous
# les deux « live_1 » — le vrai gateway tire un uuid4 (methods_session.py:417),
# donc jamais le meme. Trouve par le scenario T2, qui ouvre deux onglets.
SESSIONS_VIVES = {}
SESS_LOCK = threading.Lock()
_SESS_N = [0]


def nouvelle_session(cwd="", jetable=False):
    """Rend un identifiant vif, unique pour tout le serveur."""
    with SESS_LOCK:
        _SESS_N[0] += 1
        n = _SESS_N[0]
        sid, key = "live_%d" % n, "stored_%d" % n
        SESSIONS_VIVES[sid] = {"key": key, "cwd": cwd, "jetable": bool(jetable)}
    return sid, key


class Gateway:
    """Rejoue les methodes RPC reelles et le decoupage en evenements."""

    def __init__(self, sock):
        self.sock = sock
        self.sessions = SESSIONS_VIVES     # partage : le registre est global
        self.miennes = []                  # celles ouvertes SUR CETTE connexion
        self.lock = threading.Lock()
        self.pending_approval = None

    def moisson(self):
        """server.py:1074 `_close_sessions_for_transport` — a la deconnexion,
        on ferme les sessions qui ont demande `close_on_disconnect`, et SEULEMENT
        celles-la. Les autres survivent, sans quoi `session.resume` depuis une
        nouvelle fenetre n'aurait rien a reprendre.

        Ce faux ne l'implementait pas : son registre etait par connexion, donc
        TOUT mourait avec le lien. Il donnait la bonne reponse a P4 et P10 pour
        la mauvaise raison — et aurait donne la meme a une session qui n'avait
        rien demande. Rendu explicite en branchant le registre global.
        """
        with SESS_LOCK:
            for sid in self.miennes:
                s = SESSIONS_VIVES.get(sid)
                if s and s.get("jetable"):
                    SESSIONS_VIVES.pop(sid, None)
                    note("session_moissonnee", sid=sid)

    def send(self, obj):
        with self.lock:
            try:
                self.sock.sendall(ws_frame(json.dumps(obj) + "\n"))
            except OSError:
                pass

    def emit(self, ev, sid, payload=None):
        params = {"type": ev, "session_id": sid}
        if payload is not None:
            params["payload"] = payload
        self.send({"jsonrpc": "2.0", "method": "event", "params": params})

    def ok(self, rid, result):
        self.send({"jsonrpc": "2.0", "id": rid, "result": result})

    def err(self, rid, code, msg):
        self.send({"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": msg}})

    def run(self):
        # gateway.ready immediatement apres l'accept, comme tui_gateway/ws.py
        self.emit("gateway.ready", "", {"skin": None, "change_events": True})
        try:
            while True:
                raw = ws_read(self.sock)
                if raw is None:
                    break
                for line in raw.split("\n"):
                    line = line.strip()
                    if line:
                        self.dispatch(json.loads(line))
        except (OSError, ValueError):
            pass
        self.moisson()
        note("ws_close")

    def dispatch(self, req):
        rid = req.get("id")
        method = req.get("method")
        params = req.get("params") or {}
        note("rpc", method=method, params=params)

        if method == "session.create":
            sid, key = nouvelle_session(params.get("cwd", ""),
                                        params.get("close_on_disconnect", False))
            self.miennes.append(sid)
            self.ok(rid, {
                "session_id": sid, "stored_session_id": key,
                "message_count": 0, "messages": [],
                "info": {"model": params.get("model") or "hy3", "tools": {}, "skills": {},
                         "cwd": params.get("cwd", ""), "branch": None, "project": None,
                         "lazy": True, "profile_name": "default"},
            })
            self.emit("session.info", sid, {"model": params.get("model") or "hy3",
                                            "cwd": params.get("cwd", "")})

        elif method == "session.resume":
            target = params.get("session_id", "")
            if not target:
                self.err(rid, 4006, "session_id required")
                return
            # methods_session.py:341-359 — une session introuvable est une
            # ERREUR 4007, pas une session neuve. Ce faux acceptait n'importe
            # quel identifiant : le test « sa session existe toujours » passait
            # donc pour un identifiant invente. Trouve par T1.
            with SESS_LOCK:
                connue = (target in {s["key"] for s in SESSIONS_VIVES.values()}
                          or target in SESSIONS_VIVES
                          or any(s["id"] == target for s in SESSIONS))
            if not connue:
                self.err(rid, 4007, "session not found")
                return
            # La reprise ouvre une POIGNEE NEUVE (methods_session.py:417 tire un
            # uuid4) ; la continuite est portee par `session_key` / `resumed`,
            # jamais par `session_id`. ulysse-core.js:599 le dit deja.
            sid, _ = nouvelle_session("", params.get("close_on_disconnect", False))
            self.sessions[sid]["key"] = target
            self.miennes.append(sid)
            self.ok(rid, {
                "session_id": sid, "resumed": target, "message_count": 2,
                "messages": [{"role": "user", "content": "Où en est-on ?"},
                             {"role": "assistant", "content": "Trois étapes faites."}],
                "messages_omitted": False, "info": {"model": "hy3"},
                "inflight": None, "running": False, "session_key": target,
                "started_at": time.time() - 3600, "status": "idle",
            })

        elif method == "prompt.submit":
            sid = params.get("session_id", "")
            if sid not in self.sessions:
                self.err(rid, 4004, "session inconnue : %s" % sid)
                return
            self.ok(rid, {"accepted": True})
            threading.Thread(target=self.play_turn, args=(sid, params.get("text", "")),
                             daemon=True).start()

        elif method == "approval.respond":
            # Pas de request_id dans le protocole : resolution FIFO par
            # session (tools/approval.py:2506). On verifie qu'il y avait bien
            # une demande en attente.
            if not self.pending_approval:
                self.ok(rid, {"resolved": 0})
                return
            choice = params.get("choice", "deny")
            sid = self.pending_approval
            self.pending_approval = None
            note("approval_resolved", choice=choice)
            self.ok(rid, {"resolved": 1})
            threading.Thread(target=self.after_approval, args=(sid, choice),
                             daemon=True).start()

        elif method == "session.interrupt":
            sid = params.get("session_id", "")
            note("interrupt", sid=sid)
            self.ok(rid, {"interrupted": True})
            self.emit("message.complete", sid, {"status": "interrupted"})

        else:
            self.err(rid, -32601, "methode inconnue : %s" % method)

    def play_turn(self, sid, text):
        """Un tour realiste : statut, outil, deltas, fin. Et une demande
        d'accord quand la consigne touche a l'ecriture."""
        low = text.lower()
        self.emit("status.update", sid, {"kind": "", "text": "réflexion…"})
        time.sleep(0.15)

        needs_approval = any(w in low for w in ("écris", "ecris", "supprime", "efface",
                                               "installe", "envoie", "publie", "déploie"))
        if needs_approval:
            self.pending_approval = sid
            self.emit("approval.request", sid, {
                "command": "write_file(\"rapport.md\")",
                "reason": "L'agent veut écrire dans votre dossier de projet.",
                "choices": ["once", "session", "always", "deny"],
            })
            return          # le tour attend l'accord : rien d'autre n'est emis

        self.emit("message.start", sid, {})
        # Apercu de raisonnement livre d'un bloc (server.py:5498).
        self.emit("reasoning.available", sid, {"text": "Je regarde le plan avant de repondre."})
        self.emit("tool.start", sid, {"tool_id": "t1", "name": "read_file",
                                      "context": "plan.md"})
        time.sleep(0.15)
        self.emit("tool.complete", sid, {"tool_id": "t1", "name": "read_file",
                                         "args": {}, "inline_diff": ""})
        for chunk in ("Voici ", "ce que ", "j'ai trouvé ", "dans le plan."):
            self.emit("message.delta", sid, {"text": chunk})
            time.sleep(0.05)
        self.emit("message.complete", sid, {"status": "ok"})
        # Le vrai backend annonce que la liste des sessions a bouge
        # (server.py:3461) — c'est ce qui permet aux listes de ne pas sonder.
        self.emit("sessions.changed", "", {})

    def after_approval(self, sid, choice):
        if choice == "deny":
            self.emit("message.start", sid, {})
            self.emit("message.delta", sid, {"text": "Compris, je n'écris rien."})
            self.emit("message.complete", sid, {"status": "ok"})
            return
        self.emit("message.start", sid, {})
        self.emit("tool.start", sid, {"tool_id": "t2", "name": "write_file",
                                      "context": "rapport.md"})
        time.sleep(0.12)
        self.emit("tool.complete", sid, {"tool_id": "t2", "name": "write_file",
                                         "args": {}, "inline_diff": "+ rapport écrit"})
        self.emit("message.delta", sid, {"text": "C'est écrit."})
        self.emit("message.complete", sid, {"status": "ok"})


# ===========================================================================
# Le gateway webhook (port 8644) — POST seul, HMAC obligatoire
# ===========================================================================

class WebhookGateway(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Le vrai gateway n'a que GET /health. Pas de GET /webhooks.
        if urllib.parse.urlsplit(self.path).path == "/health":
            self.send_json(200, {"status": "ok"})
        else:
            self.send_json(404, {"error": "Not Found"})

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        if not path.startswith("/webhooks/"):
            self.send_json(404, {"error": "Not Found"})
            return
        name = path[len("/webhooks/"):]
        if name != WEBHOOK_NAME:
            self.send_json(404, {"error": "Unknown route: %s" % name})
            return

        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))

        sig = self.headers.get("X-Webhook-Signature-V2", "")
        ts = self.headers.get("X-Webhook-Timestamp", "")
        if not sig or not ts:
            note("webhook_reject", why="pas de signature")
            self.send_json(401, {"error": "Invalid signature"})
            return
        try:
            if abs(int(time.time()) - int(ts)) > 300:
                note("webhook_reject", why="horodatage hors fenetre")
                self.send_json(401, {"error": "Invalid signature"})
                return
        except ValueError:
            self.send_json(401, {"error": "Invalid signature"})
            return
        expected = hmac.new(WEBHOOK_SECRET.encode(), ts.encode() + b"." + body,
                            hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            note("webhook_reject", why="signature invalide")
            self.send_json(401, {"error": "Invalid signature"})
            return

        # gateway/platforms/webhook.py:926 — 202 Accepted, PAS 200, et chaque
        # livraison porte son propre `delivery_id` (le commentaire l.872 dit
        # pourquoi : deux declenchements simultanes sur la meme route doivent
        # obtenir deux runs independants, non mis en file). Ce faux rendait
        # 200 « queued » — l'inverse du contrat. Trouve par T6.
        with JLOCK:
            LIVRAISONS[0] += 1
            livraison = "dlv_%d" % LIVRAISONS[0]
        note("webhook_ok", name=name, body=body.decode("utf-8", "replace"),
             delivery_id=livraison,
             leaked_token=self.headers.get("X-Hermes-Session-Token"))
        self.send_json(202, {"status": "accepted", "route": name,
                             "event": "generic", "delivery_id": livraison})


# ===========================================================================
# Le proxy chat (port 8645)
# ===========================================================================

class Proxy(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        auth = self.headers.get("Authorization")
        note("proxy", path=self.path, auth=auth)
        try:
            req = json.loads(body)
            last = req["messages"][-1]["content"]
        except Exception:
            last = ""
        payload = json.dumps({
            "choices": [{"message": {"role": "assistant",
                                     "content": "Réponse sans outils à : " + str(last)[:60]}}]
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def serve(cls, port):
    srv = ThreadingHTTPServer((BOUND, port), cls)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def write_subscriptions(home):
    os.makedirs(home, exist_ok=True)
    with open(os.path.join(home, "webhook_subscriptions.json"), "w", encoding="utf-8") as fh:
        json.dump({WEBHOOK_NAME: {"secret": WEBHOOK_SECRET,
                                  "prompt": "C'est lundi. Résume la veille."}}, fh)


def main():
    global TOKEN, DASH_PORT, GW_PORT, PROXY_PORT
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=DASH_PORT)
    ap.add_argument("--gateway-port", type=int, default=GW_PORT)
    ap.add_argument("--proxy-port", type=int, default=PROXY_PORT)
    ap.add_argument("--token", default=TOKEN)
    ap.add_argument("--home", default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                   ".faux-home"))
    a = ap.parse_args()
    TOKEN, DASH_PORT, GW_PORT, PROXY_PORT = a.token, a.port, a.gateway_port, a.proxy_port

    write_subscriptions(a.home)
    serve(Dashboard, DASH_PORT)
    serve(WebhookGateway, GW_PORT)
    serve(Proxy, PROXY_PORT)

    print("Faux Hermes")
    print("  dashboard  http://127.0.0.1:%d   (jeton %s)" % (DASH_PORT, TOKEN))
    print("  gateway    http://127.0.0.1:%d   (HMAC obligatoire)" % GW_PORT)
    print("  proxy      http://127.0.0.1:%d" % PROXY_PORT)
    print("  HERMES_HOME de test : %s" % a.home)
    print("Ctrl+C pour arreter.")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nArret.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
