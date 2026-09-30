#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Harnais de test des skills du picker « / » du chat Ulysse (Raf, 2026-09-05).

Rejoue le plan PLAN-TEST-SKILLS.md SANS intervention :
  1. connexion WS 127.0.0.1:8090 (origin obligatoire) ;
  2. commands.catalog -> inventaire (pairs / skills) ;
  3. session.create (source='qa', session JETABLE) ;
  4. slash.exec sur les commandes internes (famille A) ;
  5. fallback command.dispatch sur un échantillon de skills (B/C) ;
  6. vérifs de prérequis fichiers (skills sur disque, CLI, plugins) ;
  7. bilan OK/KO compté, exit 0 si tout OK ;
  8. nettoyage : sessions 'qa' supprimées de state.db du profil ulysse.

Les skills à variable d'environnement requise manquante (gif-search, notion,
airtable, teams-meeting-pipeline) HANGUENT le gateway 300 s (secret.request
TUI jamais répondu sur WS non interactif) : on les teste avec un timeout court
et on les compte « KO-DEGRADE » — c'est le comportement documenté du plan.

Usage : python3 test_skills.py [--port 8090] [--quiet]
"""
import json
import os
import re
import shutil
import sqlite3
import sys
import time

PORT = 8090
ORIGIN = "http://127.0.0.1:%d" % PORT
HOST = "127.0.0.1:%d" % PORT

HERMES_HOME = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
PROFILE_SKILLS = os.path.join(HERMES_HOME, "profiles", "ulysse", "skills")
GLOBAL_SKILLS = os.path.join(HERMES_HOME, "skills")
STATE_DB = os.path.join(HERMES_HOME, "profiles", "ulysse", "state.db")

# Index des SKILL.md (recherche récursive par nom de dossier skill) — construit
# une seule fois. Le picker s'appuie sur scan_skill_commands() qui scanne le
# profil ET ~/.hermes/skills/ (les deux sources sont donc légitimes ici).
_skill_index = None


def _skills_index():
    global _skill_index
    if _skill_index is None:
        _skill_index = {}
        for base in (PROFILE_SKILLS, GLOBAL_SKILLS):
            if not os.path.isdir(base):
                continue
            for root, _dirs, files in os.walk(base):
                if ".archive" in root or ".git" in root:
                    continue
                if "SKILL.md" in files:
                    _skill_index.setdefault(os.path.basename(root), []).append(
                        os.path.join(root, "SKILL.md"))
    return _skill_index

QUIET = "--quiet" in sys.argv

# ---------------------------------------------------------------------------
# Familles (voir PLAN-TEST-SKILLS.md)
# ---------------------------------------------------------------------------

# (A) commandes internes : slash.exec direct, réponse {output}
COMMANDES_A = [
    "/help", "/version", "/whoami", "/profile", "/status", "/config",
    "/usage", "/subscription", "/tools", "/toolsets", "/skills", "/plugins",
    "/platforms", "/approvals", "/timestamps", "/focus", "/footer",
    "/statusbar", "/verbose", "/indicator", "/busy", "/model", "/history",
    "/memory", "/reasoning show", "/fast status", "/journey list",
    "/learning", "/heartbeat status", "/egress status", "/battery status",
    "/diff session", "/agents", "/tasks", "/cron", "/bundles",
    "/suggestions", "/insights", "/curator", "/codex-runtime", "/sessions",
    "/goal", "/subgoal", "/loop", "/kanban", "/review", "/pwf", "/pwf-status",
    "/blueprint", "/refine", "/title", "/save", "/export", "/import",
    "/worktree list", "/branch", "/compress --preview", "/rollback",
    "/snapshot", "/handoff", "/hb", "/snap", "/stop", "/battery", "/diff",
    "/wake", "/voice", "/image", "/copy", "/browser", "/topup", "/reload",
    "/resume", "/pet", "/plan-status", "/learn", "/init", "/plan", "/skin",
    "/palette", "/personality", "/btw", "/bg",
]

# (A) KO réels attendus : 5030 worker timeout — le test note KO et le harnais
#     échoue SEULEMENT si ces commandes renvoient autre chose qu'un timeout.
A_TIMEOUT_ATTENDU = {"/hatch", "/update", "/reload-mcp"}

# (A) extras TUI annoncées par commands.catalog mais « Unknown command » au
#     worker : KO documenté (lacune n°3 du plan).
A_TUI_FANTOMES = {"/density", "/logs", "/mouse"}

# (B/C) skills : slash.exec doit répondre 4018, puis command.dispatch {name, arg}
SKILLS_DISPATCH = [
    # -- profil ulysse / global, endpoints variés --
    "ulysse-deploy",      # serveur Ulysse + hermes CLI
    "hermes-ops",         # hermes CLI + ~/.hermes
    "qa-loop",            # gh (issue tracker) — lue dans ~/.hermes/skills
    "himalaya",           # CLI himalaya (email)
    "github",             # CLI gh
    "xlsx",               # openpyxl (payload OK ; module absent = usage KO)
    "pdf",                # pypdf
    "maps",               # curl OSM/OSRM
    "arxiv",              # API arXiv
    "humanizer",          # méthodo (sans endpoint)
    "obsidian",           # vault Obsidian (absent sur cette machine)
    "youtube-content",    # yt-dlp
    "blocked-page-recovery",  # navigateur/curl
    "freebuff",           # pont MCP freeB
    "planning-with-files",    # plugin ~/.hermes/plugins
    "tdd",                # famille B pure
    "grill-me",           # famille B pure
    "wait-what",          # famille B pure
    "cabinet-agentique",  # orchestration agents
    "xurl",               # CLI xurl (absent)
    "google-workspace",   # CLI gws (absent)
    "dogfood",            # QA navigateur
    "transfert-projet",   # Discord
    "raf-discord-conventions",  # Discord
]

# (C) skills à env var requise manquante : dispatch HANG (timeout court).
SKILLS_ENV_HANG = {
    "gif-search": "TENOR_API_KEY",
    "notion": "NOTION_API_KEY",
    "airtable": "AIRTABLE_API_KEY",
}

# (B) prérequis fichiers : skills qui doivent EXISTER sur disque
SKILLS_FICHIERS = [
    ("reasoning-verification-patterns", ""),
    ("computer-use", "autonomous-ai-agents"),
    ("claude-code", "autonomous-ai-agents"),
    ("code-review", "mattpocock/engineering"),
    ("la-methode", "engineering"),
    ("godot-android-game", "engineering"),
    ("manim-video", "creative"),
    ("xurl", "social-media"),
    ("hermes-usage-tracking", ""),
    ("port-server-scan", "devops"),
    ("google-drive-ocamlfuse", ""),
]

# (C) prérequis CLI (endpoint réel)
CLI_REQUIS = {
    "gh": ["github", "qa-loop"],
    "himalaya": ["himalaya"],
    "jq": ["gif-search"],
    "curl": ["maps", "arxiv", "freebuff"],
    "claude": ["claude-code"],
    "google-drive-ocamlfuse": ["google-drive-ocamlfuse"],
    "hermes": ["ulysse-deploy", "hermes-ops"],
}

# (C) CLI dont l'ABSENCE dégrade les skills concernées (déjà documenté)
CLI_ABSENCES_DOCUMENTEES = {
    "xurl": ["xurl"],
    "gws": ["google-workspace"],
    "yt-dlp": ["youtube-content"],
    "pygount": ["codebase-inspection"],
    "manim": ["manim-video"],
    "godot": ["godot-android-game"],
    "codex": ["codex"],
    "opencode": ["opencode"],
}

PLUGIN_PWF = os.path.join(HERMES_HOME, "plugins", "planning-with-files")


# ---------------------------------------------------------------------------
# WS minimal (même contrat que web/test_reel.py)
# ---------------------------------------------------------------------------
import base64
import socket
import struct
import threading


class WS:
    def __init__(self, path="/api/ws", port=None, timeout_connect=30):
        port = port or PORT
        self.status = 0
        self.buf = b""
        self.events, self.replies = [], {}
        self.nextid = 1
        self.lock = threading.Lock()
        self.alive = False
        self.closed_code = None
        try:
            self.sock = socket.create_connection(("127.0.0.1", port), timeout=timeout_connect)
        except OSError as exc:
            self.sock = None
            return
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
        self.buf = rest
        self.alive = self.status == 101
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
        raise TimeoutError("pas de réponse à %s après %.0fs" % (method, timeout))

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass
        self.alive = False


# ---------------------------------------------------------------------------
# Harnais
# ---------------------------------------------------------------------------

class Bilan:
    def __init__(self):
        self.ok = []
        self.ko = []          # (nom, cause)
        self.degrade = []     # (nom, cause) — KO documenté/attendu
        self.na = []          # (nom, raison)

    def ok_(self, nom, detail=""):
        self.ok.append(nom)
        if not QUIET:
            print("OK   %-34s %s" % (nom, detail))

    def ko_(self, nom, cause):
        self.ko.append((nom, cause))
        print("KO   %-34s %s" % (nom, cause))

    def degrade_(self, nom, cause):
        self.degrade.append((nom, cause))
        print("DEGR %-34s %s" % (nom, cause))

    def na_(self, nom, raison):
        self.na.append((nom, raison))
        if not QUIET:
            print("N-A  %-34s %s" % (nom, raison))


def env_var_manquante(nom):
    """True si la variable d'environnement requise par la skill manque
    (on lit le frontmatter prerequisites.env_vars + ~/.hermes/.env)."""
    env_path = os.path.join(HERMES_HOME, ".env")
    contenu = ""
    if os.path.exists(env_path):
        try:
            contenu = open(env_path, errors="replace").read()
        except OSError:
            pass
    return nom not in os.environ and (nom + "=") not in contenu


def prerequis_env(nom_skill, base_dirs):
    for base in base_dirs:
        for root, _dirs, files in os.walk(base):
            if os.path.basename(root) == nom_skill and "SKILL.md" in files:
                try:
                    t = open(os.path.join(root, "SKILL.md"), errors="replace").read(2500)
                except OSError:
                    return False
                m = re.search(r"env_vars:\s*\[([^\]]+)\]", t)
                if m:
                    for v in m.group(1).split(","):
                        if env_var_manquante(v.strip().strip("'\"")):
                            return False
                return True
    return False


def skill_sur_disque(nom, sous_dossier=""):
    """SKILL.md d'une skill, trouvé récursivement (profil d'abord, puis global)."""
    hits = _skills_index().get(nom, [])
    if sous_dossier:
        hits = [p for p in hits if ("/" + sous_dossier.strip("/") + "/") in p]
    return hits[0] if hits else None


def main():
    bilan = Bilan()
    ws = WS(port=PORT)
    if not ws.alive:
        print("FATAL: WS 127.0.0.1:%d injoignable (serveur Ulysse éteint ?)" % PORT)
        return 2

    # -- 1. health + catalog ------------------------------------------------
    try:
        cat = ws.rpc("commands.catalog", {}, 30)
        pairs = [p for p, _d in cat.get("pairs", [])]
        skills_map = cat.get("skills", {})
        bilan.ok_("commands.catalog", "%d paires, %d skills" % (len(pairs), len(skills_map)))
    except Exception as e:
        bilan.ko_("commands.catalog", str(e)[:100])
        ws.close()
        return 2

    # -- 2. session jetable -------------------------------------------------
    sid = None
    try:
        res = ws.rpc("session.create", {"cols": 100, "source": "qa"}, 30)
        sid = res.get("session_id")
        bilan.ok_("session.create source=qa", "sid=%s" % (sid or "?"))
    except Exception as e:
        bilan.ko_("session.create source=qa", str(e)[:100])

    # -- 3. famille A : slash.exec -----------------------------------------
    for cmd in COMMANDES_A:
        if sid is None:
            bilan.na_(cmd, "pas de session")
            continue
        try:
            t0 = time.time()
            r = ws.rpc("slash.exec", {"session_id": sid, "command": cmd}, 30)
            out = str(r.get("output", ""))
            if "Unknown command" in out:
                if cmd in A_TUI_FANTOMES:
                    bilan.degrade_(cmd, "annoncée par commands.catalog, Unknown command au worker (lacune n°3)")
                else:
                    bilan.ko_(cmd, "Unknown command")
            else:
                bilan.ok_(cmd, "%.1fs" % (time.time() - t0))
        except RuntimeError as e:
            msg = str(e)
            if "5030" in msg and cmd in A_TIMEOUT_ATTENDU:
                bilan.degrade_(cmd, "5030 worker timeout (documenté, lacune n°4)")
            elif "4004" in msg or "4018" in msg and ("usage" in msg.lower() or "no previous" in msg.lower() or "no user messages" in msg.lower()):
                # usage-only / historique vide : la commande répond normalement
                bilan.ok_(cmd, "réponse d'usage attendue (%s)" % msg[:40])
            else:
                bilan.ko_(cmd, msg[:100])
        except Exception as e:
            bilan.ko_(cmd, str(e)[:100])

    # -- 4. familles B/C : slash.exec -> 4018 -> command.dispatch ----------
    for name in SKILLS_DISPATCH:
        cmdkey = "/" + name
        if sid is None:
            bilan.na_(cmdkey, "pas de session")
            continue
        # 4a. slash.exec DOIT refuser avec 4018
        try:
            ws.rpc("slash.exec", {"session_id": sid, "command": cmdkey}, 20)
            bilan.ko_(cmdkey, "slash.exec a accepté une skill (contrat 4018 violé)")
            continue
        except RuntimeError as e:
            if "4018" not in str(e):
                bilan.ko_(cmdkey, "slash.exec erreur inattendue: %s" % str(e)[:80])
                continue
        # 4b. fallback command.dispatch (comme le desktop)
        try:
            r = ws.rpc("command.dispatch", {"session_id": sid, "name": name, "arg": ""}, 30)
            if r.get("type") == "skill" and r.get("message"):
                bilan.ok_(cmdkey + " (dispatch)", "payload skill chargé")
            else:
                bilan.ko_(cmdkey + " (dispatch)", "réponse sans payload: %s" % str(r)[:80])
        except TimeoutError:
            if prerequis_env(name, (PROFILE_SKILLS, GLOBAL_SKILLS)):
                bilan.ko_(cmdkey + " (dispatch)", "hang malgré env vars présentes — inattendu")
            else:
                bilan.degrade_(cmdkey + " (dispatch)",
                               "hang: secret.request TUI jamais répondu (env var requise absente, lacune n°2)")
        except RuntimeError as e:
            msg = str(e)
            if "not a quick" in msg:
                bilan.ko_(cmdkey + " (dispatch)", "skill introuvable côté dispatch: " + msg[:80])
            else:
                bilan.ko_(cmdkey + " (dispatch)", msg[:100])
        except Exception as e:
            bilan.ko_(cmdkey + " (dispatch)", str(e)[:100])

    # -- 5. skills à env var manquante : hang DOCUMENTÉ (timeout court) -----
    for name, var in SKILLS_ENV_HANG.items():
        if env_var_manquante(var):
            try:
                ws.rpc("command.dispatch", {"session_id": sid, "name": name, "arg": ""}, 6)
                bilan.ko_("/" + name, "env %s absente mais dispatch a répondu (comportement changé ? re-vérifier)" % var)
            except TimeoutError:
                bilan.degrade_("/" + name,
                               "confirme le hang documenté (secret.request, %s absente)" % var)
            except Exception as e:
                bilan.ko_("/" + name, str(e)[:90])
        else:
            bilan.na_("/" + name, "%s désormais définie — retirer de SKILLS_ENV_HANG" % var)

    # -- 6. prérequis fichiers ---------------------------------------------
    for nom, sous in SKILLS_FICHIERS:
        p = skill_sur_disque(nom, sous)
        if p:
            bilan.ok_("prérequis fichier: " + nom, p.replace(os.path.expanduser("~"), "~"))
        else:
            bilan.ko_("prérequis fichier: " + nom, "SKILL.md introuvable (profil ET global)")

    if os.path.isdir(PLUGIN_PWF):
        bilan.ok_("prérequis plugin: planning-with-files", "v0.2.0 attendu")
    else:
        bilan.ko_("prérequis plugin: planning-with-files", PLUGIN_PWF + " absent")

    # -- 7. prérequis CLI ----------------------------------------------------
    for binaire, skills_liees in CLI_REQUIS.items():
        p = shutil.which(binaire)
        if p:
            bilan.ok_("CLI présent: " + binaire, p)
        else:
            for s in skills_liees:
                bilan.ko_("CLI requis: " + binaire, "absent -> usage KO pour /" + s)

    for binaire, skills_liees in CLI_ABSENCES_DOCUMENTEES.items():
        if not shutil.which(binaire):
            for s in skills_liees:
                bilan.degrade_("/" + s, "endpoint %s absent sur la machine (dégradé, documenté)" % binaire)

    # -- 8b. providers (demande Raf : « il faudrait plus de providers ») ----
    # model.options = seule source ; on exige >= 4 providers authentifiés
    # (état relevé le 2026-09-05 : nous, moa, anthropic, copilot,
    #  ollama-cloud, opencode-free — 6).
    # ⚠ Un dispatch resté en secret.request pendu pollue la connexion WS
    # courante (tous les RPCs suivants hanguent) — on repart sur un WS NEUF.
    ws.close()
    ws = WS(port=PORT)
    try:
        mo = ws.rpc("model.options", {}, 30)
        provs = [p for p in mo.get("providers", []) if p.get("authenticated")]
        courant = mo.get("provider", "")
        if len(provs) >= 4:
            bilan.ok_("model.options (providers)",
                      "%d providers authentifiés, courant=%s (%s)"
                      % (len(provs), courant,
                         ", ".join(sorted(p["slug"] for p in provs))))
        else:
            bilan.ko_("model.options (providers)",
                      "seulement %d providers authentifiés (< 4): %s"
                      % (len(provs), ", ".join(p["slug"] for p in provs)))
        if courant not in {p["slug"] for p in provs}:
            bilan.ko_("provider courant", "%s absent des providers authentifiés" % courant)
    except Exception as e:
        bilan.ko_("model.options (providers)", str(e)[:100])

    # -- 8c. catalogue vs disque ---------------------------------------------
    manquantes = [k for k in skills_map if skill_sur_disque(k.lstrip("/")) is None
                  and not k.lstrip("/").startswith("apple")]
    if manquantes:
        bilan.degrade_("catalogue vs disque",
                       "%d skills annoncées sans SKILL.md local (hub/externe): %s"
                       % (len(manquantes), ", ".join(sorted(manquantes)[:5])))
    else:
        bilan.ok_("catalogue vs disque", "toutes les skills annoncées existent sur disque")

    ws.close()

    # -- 9. nettoyage sessions 'qa' -----------------------------------------
    nettoye = 0
    try:
        db = sqlite3.connect(STATE_DB, timeout=10)
        cur = db.execute("DELETE FROM sessions WHERE source='qa'")
        nettoye = cur.rowcount
        db.commit()
        db.close()
        if not QUIET:
            print("NETTOYE %d session(s) 'qa' de %s" % (nettoye, STATE_DB))
    except Exception as e:
        print("WARN nettoyage state.db: %s" % e)

    # -- 10. bilan ------------------------------------------------------------
    print("")
    print("═══ BILAN ═══")
    print("OK          : %d" % len(bilan.ok))
    print("DEGRADÉ     : %d (KO documentés dans PLAN-TEST-SKILLS.md)" % len(bilan.degrade))
    print("KO          : %d" % len(bilan.ko))
    print("N-A         : %d" % len(bilan.na))
    for nom, cause in bilan.ko:
        print("   KO %s : %s" % (nom, cause))
    print("sessions 'qa' nettoyées : %d" % nettoye)

    # exit 0 : tout OK. Les DEGRADÉS sont des KO documentés/attendus du plan ;
    # un vrai KO (inattendu) => exit 1.
    return 0 if not bilan.ko else 1


if __name__ == "__main__":
    sys.exit(main())