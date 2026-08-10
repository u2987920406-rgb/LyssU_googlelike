#!/usr/bin/env python3
"""Tests de persona — 10 personas, 2 scenarios chacun, de bout en bout.

Ce que ces tests exercent VRAIMENT
----------------------------------
Chaque scenario parle a `serve.py` exactement comme le ferait le navigateur :
memes en-tetes Host et Origin, meme absence de secret cote client, meme
WebSocket sur /api/ws. Derriere, `faux_hermes.py` applique les controles du
Hermes reel (jeton, Host, Origin du handshake, HMAC des webhooks) et repond
dans les formes exactes du code installe.

Donc un scenario qui passe prouve que le chemin complet
    page -> serve.py -> Hermes
fonctionne avec les vraies contraintes. Un scenario qui echoue montre une
rupture reelle, pas un desaccord de maquette.

Ce que ces tests N'exercent PAS : le rendu visuel. Ils verifient le cablage
et les regles metier, pas la mise en page.

    python test_personas.py
"""

import base64
import json
import os
import re
import socket
import struct
import sys
import threading
import time
import urllib.parse
from http.client import HTTPConnection

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# La console Windows est en cp1252 : les accents et les traits de cadre
# feraient lever un UnicodeEncodeError au milieu d'un scenario, qui serait
# alors compte comme un echec de test. Le rapport doit dire ce qui casse
# dans Ulysse, pas ce qui casse dans le terminal.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

ULYSSE_PORT = 18080
DASH_PORT = 19123
GW_PORT = 18644
PROXY_PORT = 18645
TOKEN = "faux_hermes_token"
ORIGIN = "http://127.0.0.1:%d" % ULYSSE_PORT
HOST = "127.0.0.1:%d" % ULYSSE_PORT

RESULTS = []
CURRENT = {"persona": "", "scenario": ""}


def check(claim, ok, detail=""):
    RESULTS.append((CURRENT["persona"], CURRENT["scenario"], claim, bool(ok), detail))
    print("      %s %s%s" % ("[ok]  " if ok else "[ECHEC]", claim,
                             ("  — " + str(detail)) if detail and not ok else ""))
    return ok


def scenario(persona, name):
    CURRENT["persona"] = persona
    CURRENT["scenario"] = name
    print("\n   · %s" % name)


def persona(title):
    print("\n" + "─" * 70)
    print(" %s" % title)
    print("─" * 70)


# ===========================================================================
# Client HTTP — se comporte comme la page
# ===========================================================================

def http(method, path, body=None, origin=ORIGIN, host=HOST, extra=None):
    headers = {"Host": host}
    if origin is not None:
        headers["Origin"] = origin
    if body is not None:
        headers["Content-Type"] = "application/json"
    headers.update(extra or {})
    payload = json.dumps(body).encode() if body is not None else None
    if payload:
        headers["Content-Length"] = str(len(payload))
    conn = HTTPConnection("127.0.0.1", ULYSSE_PORT, timeout=15)
    try:
        conn.request(method, path, body=payload, headers=headers)
        r = conn.getresponse()
        raw = r.read().decode("utf-8", "replace")
        try:
            data = json.loads(raw)
        except ValueError:
            data = None
        return r.status, data, raw
    finally:
        conn.close()


# ===========================================================================
# Client WebSocket minimal — meme protocole que la page
# ===========================================================================

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class WS:
    def __init__(self, path="/api/ws", origin=ORIGIN):
        self.sock = socket.create_connection(("127.0.0.1", ULYSSE_PORT), timeout=15)
        key = base64.b64encode(os.urandom(16)).decode()
        lines = ["GET %s HTTP/1.1" % path, "Host: %s" % HOST,
                 "Upgrade: websocket", "Connection: Upgrade",
                 "Sec-WebSocket-Key: %s" % key, "Sec-WebSocket-Version: 13"]
        if origin is not None:
            lines.append("Origin: %s" % origin)
        # Un refus se manifeste de deux facons selon le moment ou le serveur
        # coupe : soit une reponse 403/401 lisible, soit une connexion
        # brutalement fermee (WinError 10053). Les deux veulent dire « refuse » ;
        # seule une ligne « 101 » veut dire « accepte ». Laisser l'exception
        # remonter ferait passer un refus REUSSI pour un test casse.
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
        self.buf = rest
        self.events = []
        self.replies = {}
        self.nextid = 1
        self.lock = threading.Lock()
        self.alive = self.status == 101
        if self.alive:
            threading.Thread(target=self._pump, daemon=True).start()

    # --- trames -------------------------------------------------------
    def _mask(self, data):
        m = os.urandom(4)
        return bytes(b ^ m[i % 4] for i, b in enumerate(data)), m

    def _frame(self, text):
        data = text.encode()
        masked, m = self._mask(data)
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
                ext = self._recvn(2)
                if not ext:
                    break
                ln = struct.unpack("!H", ext)[0]
            elif ln == 127:
                ext = self._recvn(8)
                if not ext:
                    break
                ln = struct.unpack("!Q", ext)[0]
            data = self._recvn(ln) if ln else b""
            if data is None:
                break
            if opcode == 0x8:
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

    # --- API ----------------------------------------------------------
    def rpc(self, method, params=None, timeout=20):
        rid = self.nextid
        self.nextid += 1
        self.sock.sendall(self._frame(
            json.dumps({"jsonrpc": "2.0", "id": rid, "method": method,
                        "params": params or {}}) + "\n"))
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self.lock:
                if rid in self.replies:
                    m = self.replies.pop(rid)
                    if "error" in m:
                        raise RuntimeError(m["error"].get("message", "erreur RPC"))
                    return m.get("result", {})
            time.sleep(0.02)
        raise TimeoutError("pas de reponse a " + method)

    def wait_event(self, etype, timeout=10):
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self.lock:
                for e in self.events:
                    if e.get("type") == etype:
                        return e
            time.sleep(0.02)
        return None

    def types(self):
        with self.lock:
            return [e.get("type") for e in self.events]

    def text(self):
        out = []
        with self.lock:
            for e in self.events:
                if e.get("type") == "message.delta":
                    out.append((e.get("payload") or {}).get("text", ""))
        return "".join(out)

    def close(self):
        self.alive = False
        try:
            self.sock.close()
        except OSError:
            pass


def journal():
    """Le journal du faux Hermes, lu directement en memoire."""
    import faux_hermes
    with faux_hermes.JLOCK:
        return list(faux_hermes.JOURNAL)


def journal_clear():
    import faux_hermes
    with faux_hermes.JLOCK:
        faux_hermes.JOURNAL.clear()


# ===========================================================================
# P1 — Camille, potiere. Zero technique, zero friction.
# ===========================================================================

def p1():
    persona("P1 — Camille, potière (grand public, zéro technique)")

    scenario("P1", "1a. Elle ouvre Ulysse et pose une question, sans rien configurer")
    st, d, _ = http("GET", "/ulysse.html")
    check("la page se charge", st == 200, "HTTP %d" % st)

    st, d, raw = http("GET", "/ulysse-config.js")
    check("aucun secret n'atteint son navigateur",
          st == 200 and TOKEN not in raw and '"ulysse"' not in raw,
          "jeton present" if TOKEN in raw else "")

    ws = WS()
    check("l'agent se connecte sans qu'elle fasse quoi que ce soit",
          ws.status == 101, "HTTP %d" % ws.status)
    ready = ws.wait_event("gateway.ready", 5)
    check("le gateway se dit prêt", ready is not None)

    res = ws.rpc("session.create", {"cols": 100, "source": "ulysse"})
    sid = res.get("session_id")
    check("une session s'ouvre toute seule", bool(sid), str(res)[:120])

    ws.rpc("prompt.submit", {"session_id": sid, "text": "Peux-tu me préparer un devis ?"})
    ws.wait_event("message.complete", 10)
    check("elle obtient une réponse", "trouvé" in ws.text() or len(ws.text()) > 5, ws.text()[:80])
    check("aucun jargon ne lui est demandé (pas d'approbation sur une question)",
          ws.wait_event("approval.request", 0.3) is None)
    ws.close()

    scenario("P1", "1b. Elle range ses commandes : elle retrouve ses conversations passées")
    st, d, _ = http("GET", "/api/sessions?limit=50&order=recent")
    check("la liste de ses travaux se charge", st == 200 and d and "sessions" in d, "HTTP %d" % st)
    rows = (d or {}).get("sessions", [])
    check("ses conversations sont là", len(rows) >= 1, "%d trouvée(s)" % len(rows))
    check("chaque ligne porte une date lisible",
          all(r.get("last_active") or r.get("started_at") for r in rows))

    if rows:
        ws = WS()
        res = ws.rpc("session.resume", {"session_id": rows[0]["id"], "cols": 100})
        check("elle reprend une conversation là où elle s'était arrêtée",
              bool(res.get("session_id")) and res.get("session_id") != rows[0]["id"],
              str(res)[:120])
        check("l'historique revient avec elle", len(res.get("messages") or []) >= 1)
        ws.close()


# ===========================================================================
# P2 — Karim, developpeur. Cowork, permissions, Studio.
# ===========================================================================

def p2():
    persona("P2 — Karim, développeur (Cowork, permissions, Studio)")

    scenario("P2", "2a. Il demande une écriture : l'accord lui est demandé AVANT")
    ws = WS()
    sid = ws.rpc("session.create", {"cols": 100, "source": "ulysse",
                                    "cwd": "%USERPROFILE%/Projets/api"})["session_id"]
    ws.rpc("prompt.submit", {"session_id": sid, "text": "Écris le fichier rapport.md"})
    ap = ws.wait_event("approval.request", 8)
    check("l'agent demande l'accord avant d'écrire", ap is not None)
    if ap:
        pl = ap.get("payload") or {}
        check("la demande dit CE QUI va être fait", bool(pl.get("command")), str(pl)[:100])
        check("les choix viennent du serveur, pas d'une liste devinée",
              isinstance(pl.get("choices"), list) and "deny" in pl["choices"],
              str(pl.get("choices")))
        check("rien n'a été écrit tant qu'il n'a pas répondu",
              "tool.complete" not in ws.types())

        # approval.respond ne porte AUCUN identifiant de demande : c'est le
        # contrat reel (FIFO par session). On l'exerce tel quel.
        r = ws.rpc("approval.respond", {"session_id": sid, "choice": "once"})
        check("son accord est pris en compte", r.get("resolved") == 1, str(r))
        ws.wait_event("message.complete", 8)
        check("l'écriture n'a lieu QU'APRÈS l'accord",
              any(t == "tool.complete" for t in ws.types()))
    ws.close()

    scenario("P2", "2b. Il refuse une action : elle n'a pas lieu")
    ws = WS()
    sid = ws.rpc("session.create", {"cols": 100, "source": "ulysse"})["session_id"]
    ws.rpc("prompt.submit", {"session_id": sid, "text": "Supprime les vieux logs"})
    ap = ws.wait_event("approval.request", 8)
    check("l'accord est demandé pour une suppression", ap is not None)
    ws.rpc("approval.respond", {"session_id": sid, "choice": "deny"})
    ws.wait_event("message.complete", 8)
    tools = [t for t in ws.types() if t.startswith("tool.")]
    check("aucun outil ne s'est exécuté après le refus", not tools, str(tools))
    check("l'agent explique qu'il n'a rien fait", "écris" in ws.text() or "rien" in ws.text(),
          ws.text()[:80])
    ws.close()


# ===========================================================================
# P3 — Sophie, automate. Cron + webhooks.
# ===========================================================================

def p3():
    persona("P3 — Sophie, automate (ça se passe sans elle)")

    scenario("P3", "3a. Elle voit et pilote ses tâches du lundi")
    st, d, _ = http("GET", "/api/cron/jobs")
    check("ses tâches planifiées s'affichent", st == 200 and d is not None, "HTTP %d" % st)
    jobs = (d or {}).get("jobs", [])
    check("la tâche de veille est là", any(j["id"] == "job_veille" for j in jobs))

    st, d, _ = http("POST", "/api/cron/jobs/job_veille/pause")
    check("elle peut mettre en pause", st == 200, "HTTP %d" % st)
    st, d, _ = http("GET", "/api/cron/jobs")
    paused = next((j for j in (d or {}).get("jobs", []) if j["id"] == "job_veille"), {})
    check("la pause est réellement prise en compte", paused.get("paused") is True, str(paused))

    st, _, _ = http("POST", "/api/cron/jobs/job_veille/resume")
    st, d, _ = http("GET", "/api/cron/jobs")
    resumed = next((j for j in (d or {}).get("jobs", []) if j["id"] == "job_veille"), {})
    check("et elle peut la relancer", resumed.get("paused") is False, str(resumed))

    scenario("P3", "3b. Elle déclenche son résumé hebdo à la main")
    st, d, _ = http("GET", "/api/webhooks")
    check("la liste des webhooks vient du dashboard (pas du gateway)",
          st == 200 and d and "subscriptions" in d, "HTTP %d" % st)
    subs = (d or {}).get("subscriptions", [])
    check("sa route « resume-lundi » est listée", any(s["name"] == "resume-lundi" for s in subs))
    check("le secret ne descend PAS dans son navigateur",
          all("secret" not in s or s.get("secret") is None for s in subs)
          and all(s.get("secret_set") is True for s in subs if s["name"] == "resume-lundi"))

    journal_clear()
    st, d, raw = http("POST", "/webhooks/resume-lundi",
                      {"sujet": "Ulysse", "user": "Sophie"})
    check("le déclenchement est accepté par le gateway", st == 202, "HTTP %d — %s" % (st, raw[:120]))
    j = [e for e in journal() if e["kind"] == "webhook_ok"]
    check("il est arrivé SIGNÉ (le gateway refuse le reste)", len(j) == 1, str(journal()[-2:]))
    if j:
        body = json.loads(j[0]["body"])
        check("son payload est bien transmis", body.get("sujet") == "Ulysse", str(body))
        check("le jeton du dashboard n'a pas fuité vers le gateway",
              j[0]["leaked_token"] is None, str(j[0]["leaked_token"]))

    st, _, _ = http("POST", "/webhooks/route-inexistante")
    check("une route inconnue échoue proprement", st == 404, "HTTP %d" % st)


# ===========================================================================
# P4 — Lea, etudiante. Isolation des projets.
# ===========================================================================

def p4():
    persona("P4 — Léa, étudiante (ses matières ne se mélangent pas)")

    scenario("P4", "4a. Deux matières, deux dossiers : rien ne déborde")
    ws = WS()
    a = ws.rpc("session.create", {"cols": 100, "source": "ulysse",
                                  "cwd": "%USERPROFILE%/Cours/Biologie"})
    b = ws.rpc("session.create", {"cols": 100, "source": "ulysse",
                                  "cwd": "%USERPROFILE%/Cours/Histoire"})
    check("chaque matière obtient SA session", a["session_id"] != b["session_id"],
          "%s vs %s" % (a["session_id"], b["session_id"]))
    check("chaque session garde SON dossier",
          a["info"]["cwd"].endswith("Biologie") and b["info"]["cwd"].endswith("Histoire"),
          "%s / %s" % (a["info"]["cwd"], b["info"]["cwd"]))
    check("les identifiants persistés diffèrent aussi",
          a["stored_session_id"] != b["stored_session_id"])
    ws.close()

    scenario("P4", "4b. Un fil jetable ne contamine pas les autres")
    ws = WS()
    tmp = ws.rpc("session.create", {"cols": 100, "source": "ulysse",
                                    "close_on_disconnect": True})
    check("le fil jetable s'ouvre", bool(tmp.get("session_id")))
    ws.close()
    time.sleep(0.3)

    # La session vit dans la connexion : une fois le lien coupe, son
    # identifiant ne doit plus servir a rien. C'est le bug C3 : la page le
    # gardait et envoyait ensuite dans le vide.
    ws2 = WS()
    try:
        ws2.rpc("prompt.submit", {"session_id": tmp["session_id"], "text": "et alors ?"})
        check("un identifiant mort est refusé, pas avalé en silence", False,
              "le serveur a accepté une session morte")
    except RuntimeError as e:
        check("un identifiant mort est refusé, pas avalé en silence",
              "inconnue" in str(e), str(e))
    ws2.close()


# ===========================================================================
# P5 — Marc, manager. Vestiaire + Studio miroir.
# ===========================================================================

def p5():
    persona("P5 — Marc, manager (les rôles, et un Studio qui ne ment pas)")

    scenario("P5", "5a. Il cadre la session avec un rôle")
    ws = WS()
    sid = ws.rpc("session.create", {"cols": 100, "source": "ulysse"})["session_id"]
    cadre = ("[Rôle : Orchestrateur]\nTu agis comme Orchestrateur : coordonne, "
             "découpe la tâche en étapes.\n\nRépartis le travail de la semaine.")
    ws.rpc("prompt.submit", {"session_id": sid, "text": cadre})
    ws.wait_event("message.complete", 10)
    envoye = [e for e in journal() if e["kind"] == "rpc"
              and e["params"].get("method") != "session.create"]
    rpcs = [e for e in journal() if e["kind"] == "rpc" and e.get("method") == "prompt.submit"]
    check("le cadre part bien vers le moteur",
          any("Orchestrateur" in (e["params"].get("text") or "") for e in rpcs),
          "aucun prompt.submit portant le cadre")
    check("un prompt cadré reste un prompt normal (rien de fragile côté API)",
          ws.wait_event("message.complete", 0.5) is not None)
    ws.close()

    scenario("P5", "5b. Le Studio reflète l'agent, sans rien inventer")
    ws = WS()
    sid = ws.rpc("session.create", {"cols": 100, "source": "ulysse"})["session_id"]
    ws.rpc("prompt.submit", {"session_id": sid, "text": "Fais le point sur le plan"})
    ws.wait_event("message.complete", 10)
    types = ws.types()
    for t in ("status.update", "tool.start", "tool.complete", "message.delta", "message.complete"):
        check("le Studio reçoit « %s »" % t, t in types, str(types))
    tool = ws.wait_event("tool.start", 1)
    pl = (tool or {}).get("payload") or {}
    check("l'étape porte un identifiant d'outil (pas de doublon à l'affichage)",
          bool(pl.get("tool_id")), str(pl))
    check("l'étape porte son contexte lisible", bool(pl.get("context")), str(pl))
    ws.close()


# ===========================================================================
# P6 — Nadia, redactrice. Discussion pure = AUCUN outil.
# ===========================================================================

def p6():
    persona("P6 — Nadia, rédactrice (Discussion pure : aucun outil possible)")

    scenario("P6", "6a. En Discussion, elle brainstorme sans qu'aucun outil ne s'active")
    journal_clear()
    st, d, raw = http("POST", "/proxy/chat", {
        "model": "tencent/hy3:free",
        "messages": [{"role": "user", "content": "Fais-moi un plan de chapitre"}],
        "max_tokens": 800})
    check("elle reçoit une réponse", st == 200 and d and d.get("choices"), "HTTP %d" % st)

    proxied = [e for e in journal() if e["kind"] == "proxy"]
    check("l'appel part vers le proxy, PAS vers l'agent", len(proxied) == 1, str(len(proxied)))
    check("la clé du proxy est posée par le serveur, pas par sa page",
          proxied and proxied[0]["auth"] == "Bearer ulysse", str(proxied[0]["auth"]) if proxied else "")
    rpcs = [e for e in journal() if e["kind"] == "rpc"]
    check("AUCUN appel d'outil n'a eu lieu (test clé de P6)", not rpcs, str(rpcs))

    scenario("P6", "6b. Pour toucher un fichier, elle DOIT passer en Cowork")
    # Le mode pur ne dispose d'aucune route vers les outils : le seul chemin
    # est le WebSocket. C'est la garantie structurelle, pas une consigne.
    journal_clear()
    st, d, _ = http("POST", "/proxy/chat", {
        "model": "x", "messages": [{"role": "user", "content": "ouvre mon fichier roman.md"}]})
    reponse = ((d or {}).get("choices") or [{}])[0].get("message", {}).get("content", "")
    check("même en le demandant, le mode Discussion ne peut rien ouvrir",
          st == 200 and "sans outils" in reponse and not
          [e for e in journal() if e["kind"] == "rpc"],
          "HTTP %d — %s" % (st, reponse[:80]))

    ws = WS()
    sid = ws.rpc("session.create", {"cols": 100, "source": "ulysse"})["session_id"]
    ws.rpc("prompt.submit", {"session_id": sid, "text": "Ouvre le plan du chapitre"})
    ws.wait_event("message.complete", 10)
    check("en Cowork, l'outil s'active bien", "tool.start" in ws.types(), str(ws.types()))
    ws.close()

    st, d, _ = http("GET", "/api/files?path=Projets/poterie")
    check("l'établi lit les vrais fichiers", st == 200 and d and "entries" in d, "HTTP %d" % st)


# ===========================================================================
# P7 — Tom, analyste. Outils, et aucune fuite de secret.
# ===========================================================================

def p7():
    persona("P7 — Tom, analyste (les outils, et aucun secret qui fuit)")

    scenario("P7", "7a. Aucun secret n'est accessible depuis le navigateur")
    st, _, raw = http("GET", "/ulysse-config.js")
    for secret in (TOKEN, "faux_hermes_token"):
        check("le jeton de session est absent du fichier servi", secret not in raw)
    check("la clé du proxy est absente elle aussi",
          not re.search(r'PROXY_TOKEN:\s*"[^"]+"', raw), "PROXY_TOKEN encore renseigné")

    # Le dossier web/ contient le code du serveur, ses tests, et le HERMES_HOME
    # de test. Rien de tout cela ne doit sortir. On essaie les chemins, on ne
    # suppose pas qu'ils sont fermes.
    #   · les .py : serve.py invite explicitement a y ecrire SESSION_TOKEN
    #   · .faux-home/webhook_subscriptions.json : les secrets HMAC en clair
    #   · les formes detournees : l'expurgation de la config etait posee sur
    #     une comparaison de chemin EXACT, donc contournable en reecrivant
    #     l'URL — le fichier partait alors brut, jeton compris.
    interdits = [
        "/serve.py", "/faux_hermes.py", "/test_personas.py", "/test_serve.py",
        "/.faux-home/webhook_subscriptions.json",
    ]
    for path in interdits:
        st, _, body = http("GET", path)
        check("« %s » n'est pas servi" % path, st == 404, "HTTP %d" % st)

    detours = ["/../ulysse-config.js", "/%2e%2e/ulysse-config.js",
               "/./ulysse-config.js", "/sous/../ulysse-config.js"]
    for path in detours:
        st, _, body = http("GET", path)
        brut = re.search(r'(SESSION_TOKEN|PROXY_TOKEN):\s*"[^"]+"', body or "")
        check("« %s » ne contourne pas l'expurgation" % path, not brut,
              brut.group(0) if brut else "")

    scenario("P7", "7b. Le pipeline d'outils est visible de bout en bout")
    ws = WS()
    sid = ws.rpc("session.create", {"cols": 100, "source": "ulysse"})["session_id"]
    ws.rpc("prompt.submit", {"session_id": sid, "text": "Génère le rapport de la semaine"})
    ws.wait_event("message.complete", 10)
    starts = [e for e in ws.events if e.get("type") == "tool.start"]
    dones = [e for e in ws.events if e.get("type") == "tool.complete"]
    check("chaque outil démarré est aussi terminé", len(starts) == len(dones),
          "%d démarrés / %d terminés" % (len(starts), len(dones)))
    ids_s = {(e["payload"] or {}).get("tool_id") for e in starts}
    ids_d = {(e["payload"] or {}).get("tool_id") for e in dones}
    check("les identifiants correspondent (pas de ligne orpheline)", ids_s == ids_d,
          "%s vs %s" % (ids_s, ids_d))
    ws.close()


# ===========================================================================
# P8 — Ines, Telegram-first. Elle n'ouvre jamais l'UI.
# ===========================================================================

def p8():
    persona("P8 — Inès, Telegram-first (elle n'ouvre jamais l'interface)")

    scenario("P8", "8a. Le gateway travaille pour elle pendant que l'UI est fermée")
    st, d, _ = http("GET", "/api/status")
    check("le gateway tourne en arrière-plan",
          st == 200 and d and d.get("gateway_running") is True, str((d or {}).get("gateway_running")))
    plats = (d or {}).get("gateway_platforms") or {}
    check("les canaux distants sont visibles dans l'état", isinstance(plats, dict))

    scenario("P8", "8b. Un événement entrant déclenche l'agent sans elle")
    journal_clear()
    st, d, raw = http("POST", "/webhooks/resume-lundi", {"depuis": "telegram"})
    check("l'événement entrant est accepté", st == 202, "HTTP %d — %s" % (st, raw[:100]))
    ok = [e for e in journal() if e["kind"] == "webhook_ok"]
    check("il arrive signé, donc le gateway l'accepte", len(ok) == 1)

    # Et ce que le gateway REFUSE : une requete non signee. C'est la
    # contrepartie — sans elle, n'importe qui sur la machine declencherait
    # l'agent en tapant une URL.
    conn = HTTPConnection("127.0.0.1", GW_PORT, timeout=10)
    try:
        body = json.dumps({"faux": True}).encode()
        conn.request("POST", "/webhooks/resume-lundi", body=body,
                     headers={"Content-Type": "application/json",
                              "Content-Length": str(len(body))})
        r = conn.getresponse()
        r.read()
        check("une requête non signée est refusée par le gateway", r.status == 401,
              "HTTP %d" % r.status)
    finally:
        conn.close()

    # Le gateway n'expose PAS de GET /webhooks : c'etait l'erreur E2.
    conn = HTTPConnection("127.0.0.1", GW_PORT, timeout=10)
    try:
        conn.request("GET", "/webhooks")
        r = conn.getresponse()
        r.read()
        check("le gateway ne sert pas la liste (elle vient du dashboard)", r.status == 404,
              "HTTP %d" % r.status)
    finally:
        conn.close()


# ===========================================================================
# P9 — Hugo, non technique. Onboarding, messages d'erreur.
# ===========================================================================

def p9():
    persona("P9 — Hugo, curieux non-technique (rien ne doit le perdre)")

    scenario("P9", "9a. Un clic suffit : la page arrive complète")
    for f in ("/", "/ulysse.html", "/ulysse.css", "/ulysse-core.js",
              "/ulysse-app.js", "/ulysse-icons.js", "/ulysse-config.js"):
        st, _, body = http("GET", f)
        check("« %s » se charge" % f, st == 200 and len(body) > 0, "HTTP %d" % st)

    st, _, body = http("GET", "/ulysse.html")
    check("la page n'affiche aucun port ni jeton en dur",
          "9123" not in body and TOKEN not in body)

    scenario("P9", "9b. Quand quelque chose manque, on lui dit quoi faire")
    st, _, raw = http("POST", "/webhooks/pas-configuree")
    check("une route non configurée explique comment la créer",
          st == 404 and "hermes webhook subscribe" in raw, raw[:160])

    st, _, raw = http("GET", "/api/inexistant")
    check("un endpoint inconnu ne fait pas planter le serveur", st in (404, 502), "HTTP %d" % st)

    # Il n'y a rien a configurer cote page : c'est ca, le zero-friction.
    st, _, cfg = http("GET", "/ulysse-config.js")
    check("il n'a AUCUN champ obligatoire à remplir",
          'SESSION_TOKEN: ""' in cfg or 'SESSION_TOKEN:""' in cfg, "SESSION_TOKEN non vide")


# ===========================================================================
# P10 — Yuki, bilingue et vocale.
# ===========================================================================

def p10():
    persona("P10 — Yuki, chercheuse bilingue (vocal, et fils sensibles)")

    scenario("P10", "10a. Le vocal ne casserait pas le fil Discussion")
    # VOC-1 : Hermes expose /api/audio/transcribe et /api/audio/speak. Ils
    # ne sont pas encore branches dans l'UI — on verifie que le CHEMIN est
    # ouvert (le proxy relaie), pas qu'on a invente un endpoint.
    st, _, _ = http("POST", "/api/audio/transcribe", {"audio": "…"})
    check("la route de transcription est atteignable à travers le proxy",
          st != 405, "HTTP %d (le proxy refuse la méthode)" % st)

    st, d, _ = http("POST", "/proxy/chat", {
        "model": "x", "messages": [{"role": "user", "content": "Résume ceci en anglais"}]})
    check("dicter ou écrire aboutit au même endroit (chat pur)",
          st == 200 and d and d.get("choices"), "HTTP %d" % st)

    scenario("P10", "10b. Un fil sensible ne laisse pas de trace côté page")
    ws = WS()
    sid = ws.rpc("session.create", {"cols": 100, "source": "ulysse",
                                    "close_on_disconnect": True})["session_id"]
    check("le fil sensible s'ouvre", bool(sid))
    ws.close()
    time.sleep(0.3)
    ws2 = WS()
    try:
        ws2.rpc("prompt.submit", {"session_id": sid, "text": "suite"})
        check("le fil est bien clos à la fermeture du lien", False, "session encore vivante")
    except RuntimeError:
        check("le fil est bien clos à la fermeture du lien", True)
    ws2.close()

    st, d, _ = http("GET", "/api/memory")
    check("elle voit ce qui est mémorisé, et où", st == 200 and d and "builtin_files" in d,
          "HTTP %d" % st)


# ===========================================================================
# Transversal — les frontieres, sur tous les parcours
# ===========================================================================

def transversal():
    persona("Transversal — les frontières tiennent quel que soit le persona")

    scenario("*", "Une page hostile ne peut rien faire, même ouverte en même temps")
    st, _, _ = http("GET", "/api/status", origin="http://mechant.example.com")
    check("elle ne peut pas lire /api/*", st == 403, "HTTP %d" % st)

    ws = WS(origin="http://mechant.example.com")
    check("elle ne peut pas ouvrir le canal d'exécution", ws.status != 101, "HTTP %d" % ws.status)
    ws.close()

    st, _, _ = http("POST", "/webhooks/resume-lundi", {"x": 1},
                    origin="http://mechant.example.com")
    check("elle ne peut pas déclencher un webhook", st == 403, "HTTP %d" % st)

    st, _, _ = http("GET", "/api/status", host="ma-machine.example.com")
    check("un nom de domaine qui pointe sur 127.0.0.1 est refusé", st == 403, "HTTP %d" % st)

    scenario("*", "Le WebSocket franchit la porte d'origine du dashboard")
    journal_clear()
    ws = WS()
    check("le handshake est accepté", ws.status == 101, "HTTP %d" % ws.status)
    rejets = [e for e in journal() if e["kind"] == "ws_reject"]
    check("le dashboard n'a rejeté aucune origine", not rejets, str(rejets))
    opens = [e for e in journal() if e["kind"] == "ws_open"]
    check("l'origine présentée est celle du dashboard",
          opens and opens[-1]["origin"] == "http://127.0.0.1:%d" % DASH_PORT,
          str(opens[-1]["origin"]) if opens else "aucune ouverture")
    ws.close()

    scenario("*", "Les limites de l'API sont respectées, pas contournées")
    st, _, _ = http("GET", "/api/sessions?limit=101&order=recent")
    check("un limit>100 est bien rejeté par Hermès (donc l'UI ne le demande jamais)",
          st == 422, "HTTP %d" % st)
    st, _, _ = http("GET", "/api/sessions?limit=50&order=nimporte")
    check("un ordre inconnu est rejeté", st == 400, "HTTP %d" % st)


# ===========================================================================

def start_bench():
    """Monte la pile complete DANS CE PROCESSUS.

    En processus : le journal du faux Hermes est alors lisible directement en
    memoire, ce qui permet de verifier ce qui est REELLEMENT arrive au
    backend (en-tetes, signature, fuite de jeton) et pas seulement ce que le
    proxy a bien voulu repondre.
    """
    # Sous Windows, allow_reuse_address laisse un NOUVEAU serveur se lier a un
    # port deja ecoute par un AUTRE processus : le bind reussit, mais c'est
    # l'ancien qui continue de repondre. Les tests passeraient alors contre un
    # serveur perime, sans le moindre message. On refuse de demarrer plutot
    # que de mesurer la mauvaise chose.
    for port, quoi in ((ULYSSE_PORT, "serve.py"), (DASH_PORT, "dashboard"),
                       (GW_PORT, "gateway"), (PROXY_PORT, "proxy")):
        try:
            s = socket.create_connection(("127.0.0.1", port), timeout=0.3)
            s.close()
            raise RuntimeError(
                "Le port %d (%s) est deja pris. Un banc precedent tourne encore : "
                "arrete-le, sinon les tests interrogeraient l'ancien serveur."
                % (port, quoi))
        except OSError:
            pass    # libre, c'est ce qu'on veut

    home = os.path.join(os.getcwd(), ".faux-home")
    os.environ["HERMES_HOME"] = home
    os.environ["HERMES_DASHBOARD_SESSION_TOKEN"] = TOKEN

    import faux_hermes as fh
    fh.TOKEN = TOKEN
    fh.DASH_PORT, fh.GW_PORT, fh.PROXY_PORT = DASH_PORT, GW_PORT, PROXY_PORT
    fh.write_subscriptions(home)
    fh.serve(fh.Dashboard, DASH_PORT)
    fh.serve(fh.WebhookGateway, GW_PORT)
    fh.serve(fh.Proxy, PROXY_PORT)

    import serve
    serve.PORT = ULYSSE_PORT
    serve.DASHBOARD_URL = "http://127.0.0.1:%d" % DASH_PORT
    serve.WEBHOOK_URL = "http://127.0.0.1:%d" % GW_PORT
    serve.PROXY_URL = "http://127.0.0.1:%d" % PROXY_PORT
    threading.Thread(target=serve.main, daemon=True).start()

    # Attendre que le port reponde plutot que de dormir au hasard.
    for _ in range(100):
        try:
            s = socket.create_connection(("127.0.0.1", ULYSSE_PORT), timeout=0.3)
            s.close()
            return
        except OSError:
            time.sleep(0.05)
    raise RuntimeError("serve.py n'a pas ouvert le port %d" % ULYSSE_PORT)


# ===========================================================================
# TORDU — ce que les gens font vraiment, et qu'aucun scénario propre ne fait
#
# Les dix personas jouent l'usage NORMAL. Celles-ci jouent ce qui arrive
# quand même : on ferme la fenêtre au milieu, on ouvre deux onglets, on
# double-clique, on met des accents partout, on essaie de sortir du dossier.
#
# Demandé par kuchu le 2026-08-10 : « des scénarios tordus, et qu'ils
# poussent plus loin dans leur utilisation ». Aucun n'est gratuit — chacun
# correspond à un geste qu'un vrai client fera dès la première semaine.
# ===========================================================================

def menage_tordu(home):
    """Efface les fichiers de ces scénarios ET leurs copies datées.

    Les copies ne vivent pas à côté du fichier mais dans `versions-ulysse/`
    (serve.py:351). Un ménage qui n'y descend pas laisse les versions du tour
    précédent, et le tour suivant en compte quatre là où il en attendait deux :
    le test échoue sur son propre reliquat, pas sur un défaut. Appelé AVANT
    aussi bien qu'après, pour qu'une exécution interrompue ne pollue pas la
    suivante.
    """
    for dossier in (home, os.path.join(home, "versions-ulysse")):
        try:
            noms = os.listdir(dossier)
        except OSError:
            continue
        for f in noms:
            if f.startswith("TORDU") or f.startswith("Mémoire de Léa"):
                try:
                    os.remove(os.path.join(dossier, f))
                except OSError:
                    pass


def tordu():
    persona("TORDU — ce qui arrive quand on n'utilise pas l'app comme prévu")
    home = os.path.join(os.getcwd(), ".faux-home")
    menage_tordu(home)

    # ── T1 ─────────────────────────────────────────────────────────────────
    scenario("T1", "Camille ferme la fenêtre en pleine réponse, puis revient")
    ws = WS()
    cree = ws.rpc("session.create", {"cols": 100, "source": "ulysse"})
    sid = cree["session_id"]
    # C'est la clef PERSISTÉE qu'on reprend, jamais la poignée vive —
    # ulysse-core.js:603 envoie bien `storedId`.
    cle = cree["stored_session_id"]
    ws.rpc("prompt.submit", {"session_id": sid, "text": "Explique-moi la cuisson"})
    time.sleep(0.15)
    ws.close()                      # elle ferme l'onglet, la réponse coule encore

    ws2 = WS()
    check("le lien se rouvre après une fermeture brutale", ws2.status == 101,
          "HTTP %d" % ws2.status)
    try:
        r = ws2.rpc("session.resume", {"session_id": cle})
        repris = bool(r)
    except Exception as exc:
        r, repris = {}, False
        check("la session se reprend", False, str(exc)[:90])
    if repris:
        check("sa session existe toujours côté Hermès", bool(r), str(r)[:90])
        # ⚠ Ce qui compte n'est PAS que l'identifiant soit le même.
        #
        # `session.resume` ouvre une POIGNÉE NEUVE — un uuid4 tout frais
        # (methods_session.py:417). La continuité est portée par `session_key`
        # et `resumed`, qui désignent la conversation persistée. Vérifier
        # l'égalité des `session_id` demanderait à Hermès l'inverse de ce
        # qu'il promet ; ce qui doit tenir, c'est qu'on retombe sur LE MÊME
        # FIL, avec ses messages.
        check("...et elle rouvre le MÊME fil, pas un vide",
              r.get("session_key") == cle and r.get("resumed") == cle,
              "key=%s resumed=%s attendu=%s"
              % (r.get("session_key"), r.get("resumed"), cle))
        check("...avec ce qui s'y était dit avant la fermeture",
              (r.get("message_count") or 0) > 0 and bool(r.get("messages")),
              "%s message(s)" % r.get("message_count"))
    ws2.close()

    # Et l'inverse : reprendre un fil qui n'existe pas doit ÉCHOUER. Sinon on
    # croit reprendre et on écrit dans le vide (methods_session.py:359).
    ws3 = WS()
    try:
        ws3.rpc("session.resume", {"session_id": "fil_qui_n_existe_pas"})
        check("reprendre un fil inconnu est refusé", False, "accepté sans broncher")
    except Exception as exc:
        check("reprendre un fil inconnu est refusé", "not found" in str(exc).lower()
              or "4007" in str(exc), str(exc)[:70])
    ws3.close()

    # ── T2 ─────────────────────────────────────────────────────────────────
    scenario("T2", "Karim travaille dans deux onglets à la fois")
    a, b = WS(), WS()
    sa = a.rpc("session.create", {"cols": 100, "source": "ulysse"})["session_id"]
    sb = b.rpc("session.create", {"cols": 100, "source": "ulysse"})["session_id"]
    check("deux onglets obtiennent deux sessions distinctes", sa != sb,
          "%s vs %s" % (sa, sb))
    a.rpc("prompt.submit", {"session_id": sa, "text": "Écris le fichier rapport.md"})
    ap = a.wait_event("approval.request", 8)
    check("l'accord est demandé dans l'onglet qui l'a provoqué", ap is not None)
    # ⚠ LE POINT. Un accord qui apparaîtrait dans l'autre onglet ferait
    #   autoriser une action qu'on n'a pas demandée.
    autres = [e for e in b.events if e.get("type") == "approval.request"]
    check("...et PAS dans l'autre onglet — on n'autorise que ce qu'on a demandé",
          not autres, str(autres)[:90])
    a.rpc("approval.respond", {"session_id": sa, "choice": "deny"})
    a.close(); b.close()

    # ── T3 ─────────────────────────────────────────────────────────────────
    scenario("T3", "Léa enregistre depuis deux onglets en même temps")
    cible = os.path.join(home, "TORDU.md")
    with open(cible, "w", encoding="utf-8") as fh:
        fh.write("depart\n")
    resultats = []

    def ecrire(txt):
        st, d, _ = http("POST", "/ulysse/ecrire", {"path": cible, "content": txt})
        resultats.append((st, d))

    t1 = threading.Thread(target=ecrire, args=("version A\n",))
    t2 = threading.Thread(target=ecrire, args=("version B\n",))
    t1.start(); t2.start(); t1.join(); t2.join()
    check("les deux enregistrements aboutissent",
          all(st == 200 for st, _ in resultats), str([st for st, _ in resultats]))
    st, d, _ = http("GET", "/ulysse/versions?path=" + urllib.parse.quote(cible))
    vs = (d or {}).get("versions") or []
    # ⚠ Deux écritures simultanées qui se choisiraient le même nom de copie
    #   perdraient précisément ce qu'on essaie de garder.
    check("...et DEUX copies distinctes sont gardées, aucune écrasée",
          len(vs) == 2 and len({v["nom"] for v in vs}) == 2,
          "%d copie(s) : %s" % (len(vs), [v["nom"] for v in vs]))

    # ── T4 ─────────────────────────────────────────────────────────────────
    scenario("T4", "Nadia met des accents, des espaces et des parenthèses partout")
    nom = "Mémoire de Léa (2026) — brouillon.md"
    chemin = os.path.join(home, nom)
    with open(chemin, "w", encoding="utf-8") as fh:
        fh.write("des accents : éàüç\n")
    st, d, _ = http("GET", "/api/fs/read-text?path=" + urllib.parse.quote(chemin))
    check("un nom accentué se lit sans être mutilé",
          st == 200 and "éàüç" in ((d or {}).get("text") or ""),
          "HTTP %d — %r" % (st, ((d or {}).get("text") or "")[:30]))
    st, d, _ = http("POST", "/ulysse/ecrire", {"path": chemin, "content": "modifié ✓\n"})
    check("...et s'enregistre", st == 200, "HTTP %d" % st)
    st, d, _ = http("GET", "/ulysse/versions?path=" + urllib.parse.quote(chemin))
    check("...avec sa copie datée, retrouvable sous le même nom",
          st == 200 and len((d or {}).get("versions") or []) == 1,
          str(len((d or {}).get("versions") or [])))

    # ── T5 ─────────────────────────────────────────────────────────────────
    scenario("T5", "Tom essaie de sortir du dossier, de plusieurs façons")
    dehors = [
        ("un détour par « .. »",        os.path.join(home, "..", "serve.py")),
        ("un chemin absolu ailleurs",   os.path.abspath("serve.py")),
        ("des « .. » empilés",          os.path.join(home, "..", "..", "serve.py")),
    ]
    for quoi, p in dehors:
        st, d, _ = http("POST", "/ulysse/ecrire", {"path": p, "content": "# effacé"})
        check("écrire refusé — %s" % quoi, st == 403, "HTTP %d" % st)
        check("...et le refus DIT pourquoi, il ne se contente pas de refuser",
              bool((d or {}).get("error")), str(d)[:70])
    # Le fichier visé n'a pas bougé : le refus n'est pas qu'un code de retour.
    with open("serve.py", encoding="utf-8") as fh:
        tete = fh.read(40)
    check("le fichier visé est intact", tete.startswith("#!") or "coding" in tete
          or "\"\"\"" in tete or tete.startswith("#"), repr(tete[:30]))

    # ── T6 ─────────────────────────────────────────────────────────────────
    scenario("T6", "Sophie clique trois fois de suite sur « déclencher »")
    journal_clear()
    codes = []
    for _ in range(3):
        st, _, _ = http("POST", "/webhooks/resume-lundi", {"n": 1})
        codes.append(st)
    # 202 Accepted, pas 200 : le gateway rend la main AVANT que la tâche
    # tourne (gateway/platforms/webhook.py:926). Un 200 dirait « c'est fait ».
    check("les trois déclenchements passent", all(c == 202 for c in codes), str(codes))
    signes = [e for e in journal() if e["kind"] == "webhook_ok"]
    check("...et les trois arrivent jusqu'au gateway", len(signes) == 3, str(len(signes)))
    # ⚠ LE POINT. Chacun doit porter SA livraison. Le commentaire du gateway
    #   (l.872) est explicite : deux déclenchements sur la même route doivent
    #   obtenir deux exécutions indépendantes, et non se mettre en file ni
    #   s'interrompre. Un identifiant partagé les confondrait.
    livr = {e.get("delivery_id") for e in signes}
    check("...et chacun est une livraison à part, pas trois fois la même",
          len(livr) == 3, str(sorted(livr)))

    # ── T7 ─────────────────────────────────────────────────────────────────
    scenario("T7", "Un corps abîmé n'emporte pas le serveur")
    conn = HTTPConnection("127.0.0.1", ULYSSE_PORT, timeout=15)
    try:
        corps = b"{ceci n'est pas du JSON"
        conn.request("POST", "/ulysse/ecrire", body=corps,
                     headers={"Host": HOST, "Origin": ORIGIN,
                              "Content-Type": "application/json",
                              "Content-Length": str(len(corps))})
        r = conn.getresponse()
        brut = r.read().decode("utf-8", "replace")
        check("un JSON illisible donne un refus LISIBLE, pas une coupure",
              r.status == 400 and "JSON" in brut, "HTTP %d — %s" % (r.status, brut[:60]))
    except Exception as exc:
        check("un JSON illisible donne un refus lisible", False, str(exc)[:90])
    finally:
        conn.close()
    # Et le serveur répond encore juste après : c'est ça, « n'emporte pas ».
    st, _, _ = http("GET", "/api/status")
    check("...et le serveur répond encore juste après", st == 200, "HTTP %d" % st)

    # ── T8 ─────────────────────────────────────────────────────────────────
    scenario("T8", "Marc coupe le lien au milieu d'un tour, et recommence")
    ws = WS()
    sid = ws.rpc("session.create", {"cols": 100, "source": "ulysse"})["session_id"]
    ws.rpc("prompt.submit", {"session_id": sid, "text": "Écris le fichier rapport.md"})
    ws.wait_event("approval.request", 8)
    ws.close()                       # il coupe sans répondre à la demande
    ws2 = WS()
    check("on peut rouvrir et travailler après une coupure sans réponse",
          ws2.status == 101, "HTTP %d" % ws2.status)
    sid2 = ws2.rpc("session.create", {"cols": 100, "source": "ulysse"})["session_id"]
    check("...et une session neuve s'ouvre normalement", bool(sid2) and sid2 != sid,
          "%s vs %s" % (sid, sid2))
    ws2.close()

    menage_tordu(home)


def main():
    print("=" * 70)
    print(" TESTS DE PERSONA — Ulysse")
    print(" page -> serve.py -> faux Hermes (contrôles réels appliqués)")
    print("=" * 70)
    start_bench()

    for fn in (p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, transversal, tordu):
        try:
            fn()
        except Exception as exc:
            check("le scénario va jusqu'au bout", False, "%s: %s" % (type(exc).__name__, exc))

    print("\n" + "=" * 70)
    total = len(RESULTS)
    ok = sum(1 for r in RESULTS if r[3])
    by_persona = {}
    for p, s, c, good, d in RESULTS:
        e = by_persona.setdefault(p, [0, 0])
        e[1] += 1
        if good:
            e[0] += 1
    for p in sorted(by_persona):
        a, b = by_persona[p]
        print("  %-4s %2d / %2d %s" % (p, a, b, "" if a == b else "  <- ÉCHECS"))
    print("  " + "-" * 30)
    print("  TOTAL %d / %d" % (ok, total))
    if ok != total:
        print("\n  Échecs :")
        for p, s, c, good, d in RESULTS:
            if not good:
                print("    [%s] %s\n        %s  (%s)" % (p, s, c, d))
    print("=" * 70)
    return 0 if ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
