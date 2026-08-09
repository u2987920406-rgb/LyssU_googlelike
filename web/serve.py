#!/usr/bin/env python3
"""Serveur local Ulysse : fichiers statiques + reverse-proxy vers Hermes.

Pourquoi un proxy
-----------------
1. CORS. La page appelle le dashboard Hermes avec un en-tete personnalise
   (X-Hermes-Session-Token), ce qui rend la requete « non simple » : le
   navigateur envoie d'abord un preflight OPTIONS, que le gate d'auth du
   dashboard rejette en 401. En servant la page et l'API depuis la MEME
   origine (127.0.0.1:8080), il n'y a plus de preflight du tout.

2. Secrets. Le jeton de session du dashboard et les secrets HMAC des
   webhooks ne descendent JAMAIS dans le navigateur. C'est ce serveur qui
   les detient et les injecte au dernier moment.

    navigateur ──(meme origine, sans preflight, sans secret)──> serve.py :8080
                                                                   │
                                            + X-Hermes-Session-Token / HMAC
                                                                   v
                                       dashboard :9123 · gateway :8644 · proxy :8645

Le code Hermes n'est pas touche.

Ce qui est servi / relaye
-------------------------
  /api/ws            -> tunnel WebSocket brut vers le dashboard
  /api/...           -> relais HTTP vers le dashboard (jeton injecte)
  /webhooks/<nom>    -> POST signe HMAC-SHA256 V2 vers le gateway webhook
  /proxy/chat        -> relais vers hermes proxy (chat pur, cle injectee)
  tout le reste      -> fichiers statiques du dossier, Cache-Control: no-store

Frontieres de securite (toutes appliquees ici, pas cote page)
-------------------------------------------------------------
  · ecoute sur 127.0.0.1 uniquement — jamais 0.0.0.0
  · en-tete Host verifie (anti DNS-rebinding)
  · en-tete Origin verifie sur /api/*, /webhooks/*, /proxy/* ET sur le
    handshake WebSocket — une page hostile ne peut pas ouvrir le canal RPC
  · aucun en-tete CORS permissif : tout est en meme origine
  · Origin REECRIT vers le backend avant relais : le dashboard verifie
    l'origine sur le WS et refuserait un Origin :8080 (close 4403)
  · ulysse-config.js est servi expurge de ses secrets
"""

import hashlib
import hmac
import http.client
import http.server
import json
import os
import re
import select
import shutil
import socket
import socketserver
import ssl
import sys
import time
import urllib.parse

# ===========================================================================
# EDITER ICI — configuration du serveur
# ===========================================================================

PORT = 8080

# Interface d'ecoute. 127.0.0.1 = accessible depuis CETTE machine uniquement.
# Ne PAS mettre "" ni "0.0.0.0" : le proxy porte le jeton du dashboard, donc
# l'exposer au reseau revient a offrir a tout le LAN la lecture du disque et
# l'execution de commandes, sans aucune authentification.
HOST = "127.0.0.1"

# Origine du backend Hermes vers lequel /api/* est relaye. Pas de slash final.
# Laisser "" pour lire la cle HERMES_URL dans ulysse-config.js (recommande :
# un seul endroit a modifier). Sinon forcer la valeur ici, par ex.
# "http://127.0.0.1:9123".
DASHBOARD_URL = ""

# Jeton de session Hermes injecte dans chaque requete relayee.
# Ordre de resolution : cette constante > variable d'environnement
# HERMES_DASHBOARD_SESSION_TOKEN > cle SESSION_TOKEN de ulysse-config.js.
# La variable d'environnement est preferable : le jeton ne touche alors aucun
# fichier du dossier web/.
SESSION_TOKEN = None

# Valeurs de repli si ulysse-config.js est absent ou muet.
DASHBOARD_URL_FALLBACK = "http://127.0.0.1:9123"
SESSION_TOKEN_FALLBACK = ""

# Gateway des webhooks (port 8644 par defaut). Le declenchement est signe ici.
WEBHOOK_URL = ""
WEBHOOK_URL_FALLBACK = "http://127.0.0.1:8644"

# Proxy Hermes pour le mode « chat pur » (OpenAI-compatible).
PROXY_URL = ""
PROXY_URL_FALLBACK = "http://127.0.0.1:8645"

CONFIG_FILE = "ulysse-config.js"

# Le marqueur de premier lancement. Il vit DANS LE HERMES HOME, pas dans le
# dossier servi : tout ce qui est ici est publie a qui sait taper une URL.
# Un fichier de plus dans web/ serait aussi un fichier de plus a ignorer dans
# les verifications de fidelite.
MARQUEUR = os.path.join(
    os.environ.get("HERMES_HOME") or os.path.join(
        os.path.expanduser("~"), "AppData", "Local", "hermes"),
    "ulysse-premier-vu")


def premier_lancement():
    """Vrai tant que l'ecran d'accueil n'a pas ete vu une premiere fois."""
    return not os.path.exists(MARQUEUR)


# ---------------------------------------------------------------------------
# Le terminal : xterm.js, EMPRUNTE a Hermes plutot que recopie
# ---------------------------------------------------------------------------
# Le dashboard rend /api/pty avec @xterm/xterm — la meme bibliotheque, deja
# installee sur cette machine par Hermes lui-meme. Ecrire un emulateur ANSI a
# la main pour une TUI Ink (ecran alternatif, adressage du curseur, couleurs
# 24 bits, caracteres larges) serait faire semblant.
#
# On la SERT depuis la ou elle est, on ne la recopie pas dans web/ : une copie
# vieillit, et 500 Ko de code emprunte dans le dossier du produit brouillent
# ce qui est a nous. La liste est FERMEE et les chemins sont absolus — aucun
# segment ne vient du client, ce qui etait precisement la faille S11.

def _hermes_racine():
    base = os.environ.get("HERMES_AGENT_PATH")
    if base:
        return base
    return os.path.join(os.path.expanduser("~"), "AppData", "Local", "hermes",
                        "hermes-agent")


def _nm(*bouts):
    return os.path.abspath(os.path.join(_hermes_racine(), "node_modules", *bouts))


EMPRUNTS = {
    "/xterm/xterm.js":      (_nm("@xterm", "xterm", "lib", "xterm.js"),
                             "application/javascript"),
    "/xterm/xterm.css":     (_nm("@xterm", "xterm", "css", "xterm.css"), "text/css"),
    "/xterm/addon-fit.js":  (_nm("@xterm", "addon-fit", "lib", "addon-fit.js"),
                             "application/javascript"),
}

# Cles de ulysse-config.js expurgees avant de servir le fichier au navigateur.
# La page n'en a pas besoin : c'est le proxy qui authentifie.
SECRET_CONFIG_KEYS = ("SESSION_TOKEN", "PROXY_TOKEN")

# Seules ces extensions sont servies en statique. Liste BLANCHE, pas noire :
# ce dossier contient le code du serveur (serve.py, ou la constante
# SESSION_TOKEN peut etre renseignee), ses tests, et potentiellement tout ce
# qu'on y depose. Avec une liste noire, le premier fichier d'un type oublie
# part en clair. Avec une liste blanche, il faut un geste explicite pour
# publier quoi que ce soit.
STATIC_SUFFIXES = (".html", ".css", ".js", ".svg", ".png", ".jpg", ".jpeg",
                   ".gif", ".webp", ".ico", ".woff", ".woff2", ".map")

# Renseignes dans main().
BACKEND = None
WEBHOOK_BACKEND = None
PROXY_BACKEND = None
ALLOWED_HOSTS = frozenset()
ALLOWED_ORIGINS = frozenset()

# ===========================================================================
# Lecture de ulysse-config.js
# ===========================================================================

# ulysse-config.js est du JavaScript, pas du JSON : on ne l'evalue pas, on y
# pioche simplement les valeurs qui nous interessent. Format attendu :
#     CLE: "valeur",
_VALUE_RE = '(?m)^\\s*%s\\s*:\\s*"([^"]*)"'


def read_config_value(text, key):
    """Retourne la valeur chaine de `key` dans ulysse-config.js, ou None."""
    m = re.search(_VALUE_RE % re.escape(key), text)
    return m.group(1) if m else None


def read_config_text():
    if not os.path.exists(CONFIG_FILE):
        return ""
    with open(CONFIG_FILE, "r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


def load_config():
    """Resout (backend, jeton, webhook, proxy) et leur cle d'authentification."""
    text = read_config_text()

    backend = DASHBOARD_URL
    if not backend:
        # HERMES_URL = le vrai backend, distinct de DASHBOARD_URL qui, cote
        # page, pointe desormais sur ce proxy (127.0.0.1:8080).
        backend = read_config_value(text, "HERMES_URL") or DASHBOARD_URL_FALLBACK

    token = SESSION_TOKEN
    if token is None:
        token = os.environ.get("HERMES_DASHBOARD_SESSION_TOKEN")
    if token is None:
        token = read_config_value(text, "SESSION_TOKEN")
    if token is None:
        token = SESSION_TOKEN_FALLBACK

    wh_url = WEBHOOK_URL or read_config_value(text, "WEBHOOK_URL") or WEBHOOK_URL_FALLBACK

    proxy_url = PROXY_URL
    if not proxy_url:
        # ulysse-config.js porte l'URL complete de la route chat ; on ne garde
        # que l'origine, le chemin est ajoute au relais.
        raw = read_config_value(text, "PROXY_URL") or PROXY_URL_FALLBACK
        parts = urllib.parse.urlsplit(raw)
        proxy_url = "%s://%s" % (parts.scheme or "http", parts.netloc)
    proxy_token = (os.environ.get("HERMES_PROXY_TOKEN")
                   or read_config_value(text, "PROXY_TOKEN") or "")

    return (backend.rstrip("/"), token, wh_url.rstrip("/"),
            proxy_url.rstrip("/"), proxy_token)


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

    @property
    def origin(self):
        """Origine a presenter au backend a la place de celle du navigateur."""
        return "%s://%s" % (self.scheme, self.netloc)

    def connect(self, timeout=120):
        if self.secure:
            return http.client.HTTPSConnection(
                self.host, self.port, timeout=timeout,
                context=ssl.create_default_context())
        return http.client.HTTPConnection(self.host, self.port, timeout=timeout)


# En-tetes « hop-by-hop » : propres a une connexion, jamais relayes tels quels.
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "trailers", "transfer-encoding", "upgrade",
}

# En-tetes d'authentification venant du navigateur : TOUJOURS supprimes, quel
# que soit le backend vise. Sinon un jeton destine au dashboard partirait vers
# le gateway webhook, qui n'a rien a en faire.
CLIENT_AUTH_HEADERS = {"x-hermes-session-token", "authorization", "cookie"}

# ===========================================================================
# Webhooks — signature HMAC calculee ici, secret jamais expose
# ===========================================================================


def hermes_home():
    """Racine Hermes ($HERMES_HOME, sinon %LOCALAPPDATA%\\hermes)."""
    env = os.environ.get("HERMES_HOME")
    if env:
        return env
    local = os.environ.get("LOCALAPPDATA")
    if local:
        return os.path.join(local, "hermes")
    return os.path.join(os.path.expanduser("~"), ".hermes")


# ===========================================================================
# Ecrire dans la memoire — la copie datee AVANT l'ecrasement
#
# `/api/fs/write-text` d'Hermes ecrit proprement (fichier temporaire puis
# `os.replace`, donc pas de troncature en cas de plantage) mais ne garde
# AUCUNE copie : ce qui etait la est perdu. La passe de design pose la regle,
# et elle vient de la maquette elle-meme :
#
#     « Rien ne disparait d'un geste. Ce qui porte des donnees va a la
#       corbeille, et y reste. »
#
# Ecrire par-dessus une memoire EST une destruction, meme si ca s'appelle
# ecrire. Tant que la copie datee n'existe pas, un ecran qui promet un retour
# en arriere ment. Voici donc la copie datee, et rien d'autre pour l'instant.
# ===========================================================================

# Les versions vivent dans un SOUS-DOSSIER, pas dans une convention de nommage.
# `user.md.2026-08-09-1804` a cote de `user.md` encombrerait la liste des
# fichiers — celle que le panneau Fichiers affiche — et melangerait les
# sauvegardes aux originaux. Un dossier se replie ; un nom de fichier, non.
DOSSIER_VERSIONS = "versions-ulysse"

# Ce qui ne s'ecrit JAMAIS par ce chemin. Ce n'est pas un reglage prudent
# qu'on desserrera un jour : SOUL.md dit ce qu'Ulysse s'autorise et ce qu'il
# refuse. Si l'agent pouvait le reecrire, il pourrait lever ses propres
# garde-fous, et il n'y aurait plus rien pour l'en empecher.
#
# ATTENTION A LA PORTEE REELLE DE CETTE FRONTIERE : elle tient pour tout ce
# qui passe par Ulysse. Elle ne tient PAS pour l'agent lui-meme, qui ecrit
# avec ses propres outils dans le processus Hermes, sans passer par ici.
# Verifie dans le code source le 2026-08-09 : Hermes n'expose aucun
# refus par chemin (`agent/file_safety.py` n'a qu'un garde-fou souple pour
# les miroirs de bac a sable, documente comme « not a security boundary »).
# Le dire autrement serait promettre une frontiere qui n'existe pas.
INTERDITS_ECRITURE = ("soul.md",)


def _sous_chemin(parent, enfant):
    """`enfant` est-il DANS `parent` ? Compare des chemins reels, normalises."""
    try:
        p = os.path.realpath(parent)
        e = os.path.realpath(enfant)
    except OSError:
        return False
    if os.name == "nt":
        p, e = p.lower(), e.lower()
    return e == p or e.startswith(p + os.sep)


def ecriture_refusee(chemin):
    """Raison de refus, ou None. C'est la seule porte d'entree des regles."""
    if not chemin or not isinstance(chemin, str):
        return "Aucun fichier n'a ete indique."
    nom = os.path.basename(chemin).lower()
    if nom in INTERDITS_ECRITURE:
        return ("SOUL.md ne se modifie pas depuis Ulysse. Il dit ce qu'Ulysse "
                "s'autorise et ce qu'il refuse : le laisser reecrire d'ici "
                "reviendrait a le laisser lever ses propres garde-fous. "
                "Ouvrez-le vous-meme ; Hermes le relira au prochain lancement.")
    # Hors du Hermes Home, ce n'est pas de la memoire — et ce serveur n'a pas
    # a devenir un editeur de fichiers pour toute la machine.
    if not _sous_chemin(hermes_home(), chemin):
        return ("Ce fichier n'est pas dans le dossier d'Hermes. Ulysse n'ecrit "
                "que dans la memoire, pas ailleurs sur la machine.")
    # Les sauvegardes vivent DANS le Hermes Home : sans cette ligne, la meme
    # route permettrait d'ecraser une version gardee — c'est-a-dire de
    # detruire precisement ce qui existe pour empecher une destruction.
    if DOSSIER_VERSIONS in os.path.abspath(chemin).replace("\\", "/").split("/"):
        return ("Ce fichier est une version gardee. On y revient, on ne "
                "l'ecrase pas : c'est ce qui rend le retour en arriere sur.")
    return None


def dossier_versions(chemin):
    return os.path.join(os.path.dirname(os.path.abspath(chemin)), DOSSIER_VERSIONS)


def garder_version(chemin, horodatage=None):
    """Met la version actuelle de cote, datee. Rend son chemin, ou None.

    None veut dire « il n'y avait rien a garder » (fichier absent : c'est une
    CREATION, elle ne detruit rien). Une exception veut dire qu'on n'a pas pu
    garder — et dans ce cas l'ecriture ne doit pas avoir lieu.
    """
    if not os.path.isfile(chemin):
        return None
    dossier = dossier_versions(chemin)
    # `exist_ok` et non un `if not isdir(...)` : deux copies simultanees
    # voient toutes deux le dossier absent, et la seconde echouerait sur un
    # FileExistsError — en perdant la sauvegarde qu'elle devait faire.
    os.makedirs(dossier, exist_ok=True)
    quand = horodatage or time.strftime("%Y-%m-%d-%H%M%S")
    base = os.path.basename(chemin)

    # Deux ecritures dans la meme seconde ne doivent pas s'ecraser l'une
    # l'autre : ce serait perdre precisement ce qu'on essaie de garder.
    #
    # Un `while os.path.exists(...)` suivi d'une copie laisse une fenetre
    # entre le test et l'ecriture : deux requetes simultanees peuvent choisir
    # le meme nom et l'une effacer l'autre. On demande donc au systeme de
    # creer le fichier de facon EXCLUSIVE — c'est lui qui arbitre.
    n, cible, fd = 0, None, None
    while fd is None:
        cible = os.path.join(dossier, "%s.%s" % (base, quand) if n == 0
                             else "%s.%s-%d" % (base, quand, n))
        try:
            fd = os.open(cible, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_BINARY", 0))
        except FileExistsError:
            n += 1
            if n > 500:                       # garde-fou : on ne boucle pas sans fin
                raise
    try:
        with open(chemin, "rb") as src, os.fdopen(fd, "wb") as dst:
            shutil.copyfileobj(src, dst)
    except BaseException:
        # Une copie a moitie ecrite est pire qu'aucune copie : elle ferait
        # croire a une sauvegarde qui n'en est pas une.
        try:
            os.remove(cible)
        except OSError:
            pass
        raise
    shutil.copystat(chemin, cible)
    return cible


def lister_versions(chemin):
    """Les versions gardees d'un fichier, de la plus recente a la plus ancienne."""
    dossier = dossier_versions(chemin)
    base = os.path.basename(chemin)
    out = []
    try:
        noms = os.listdir(dossier)
    except OSError:
        return out
    for nom in noms:
        if not nom.startswith(base + "."):
            continue
        plein = os.path.join(dossier, nom)
        try:
            st = os.stat(plein)
        except OSError:
            continue
        out.append({
            "nom": nom,
            "quand": nom[len(base) + 1:],
            "octets": st.st_size,
            "horodatage": st.st_mtime,
        })
    out.sort(key=lambda v: v["horodatage"], reverse=True)
    return out


def webhook_secret(name):
    """Secret HMAC d'une route webhook, lu dans webhook_subscriptions.json.

    Le dashboard masque ce secret (`secret_set: true` et rien d'autre) : le
    navigateur ne peut donc pas signer, et il ne doit pas le pouvoir. C'est ce
    serveur, local, qui lit le fichier et signe.
    """
    path = os.path.join(hermes_home(), "webhook_subscriptions.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            subs = json.load(fh)
    except (OSError, ValueError):
        return None
    route = subs.get(name) if isinstance(subs, dict) else None
    if not isinstance(route, dict):
        return None
    secret = route.get("secret")
    return secret if isinstance(secret, str) and secret else None


def sign_webhook_v2(secret, body):
    """En-tetes de signature generique V2 attendus par gateway/platforms/webhook.py.

    Le gateway calcule HMAC-SHA256(secret, b"<timestamp>.<body>") et refuse un
    horodatage vieux de plus de 300 s (protection contre le rejeu).
    """
    ts = str(int(time.time()))
    signed = ts.encode("ascii") + b"." + body
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return {"X-Webhook-Timestamp": ts, "X-Webhook-Signature-V2": digest}


class Handler(http.server.SimpleHTTPRequestHandler):
    """Fichiers statiques, plus un reverse-proxy authentifie."""

    server_version = "Ulysse"
    sys_version = ""

    # ------------------------------------------------------------------
    # Frontieres de securite
    # ------------------------------------------------------------------

    def route(self):
        """Chemin NORMALISE, sans la query string.

        Deux pieges evites ici :
          · `self.path` contient la query — comparer dessus fait tomber
            « /webhooks/x?y=1 » dans le statique.
          · le chemin peut etre encode ou remonter (« /%2e%2e/config.js ») :
            SimpleHTTPRequestHandler, lui, le normalise avant de servir. Si
            l'aiguillage compare la forme brute et le service la forme
            normalisee, tout controle pose sur un chemin exact se contourne
            en changeant l'ecriture de l'URL. C'etait le cas de l'expurgation
            de ulysse-config.js.
        """
        raw = urllib.parse.urlsplit(self.path).path
        raw = urllib.parse.unquote(raw)
        raw = raw.replace("\\", "/")
        parts = []
        for seg in raw.split("/"):
            if seg in ("", "."):
                continue
            if seg == "..":
                if parts:
                    parts.pop()
                continue
            parts.append(seg)
        return "/" + "/".join(parts)

    def is_api(self):
        p = self.route()
        return p == "/api" or p.startswith("/api/")

    def is_webhook(self):
        return self.route().startswith("/webhooks/")

    def is_proxy(self):
        return self.route() == "/proxy/chat"

    def is_relayed(self):
        return self.is_api() or self.is_webhook() or self.is_proxy()

    def is_websocket(self):
        return (self.headers.get("Upgrade") or "").lower() == "websocket"

    def host_ok(self):
        """Anti DNS-rebinding : un nom qui resout vers 127.0.0.1 ne suffit pas.

        Sans ce controle, une page hostile peut faire pointer son propre
        domaine sur 127.0.0.1 ; le navigateur considere alors ses requetes
        comme same-origin avec ce serveur et obtient tout /api/*.
        """
        host = (self.headers.get("Host") or "").strip().lower()
        return host in ALLOWED_HOSTS

    def origin_ok(self):
        """Origine du demandeur. Absente = requete non-navigateur (curl) : OK.

        Presente = c'est un navigateur, et elle doit designer ce serveur. Sans
        ce controle, n'importe quel onglet ouvert sur un site hostile peut
        appeler /api/* — le proxy y ajouterait le jeton et lui rendrait la
        reponse.
        """
        origin = (self.headers.get("Origin") or "").strip().lower()
        if not origin:
            return True
        return origin in ALLOWED_ORIGINS

    def guard(self):
        """Verifie les frontieres avant tout relais. True = requete refusee."""
        if not self.host_ok():
            self.send_error(403, "Forbidden", "En-tete Host non autorise.")
            return True
        if not self.origin_ok():
            self.send_error(403, "Forbidden", "Origine non autorisee.")
            return True
        return False

    # ------------------------------------------------------------------
    # Aiguillage
    # ------------------------------------------------------------------

    def static_allowed(self):
        """Le chemin normalise designe-t-il un fichier publiable ?"""
        p = self.route()
        if p in ("/", ""):
            return True
        name = p.rsplit("/", 1)[-1]
        # Un segment cache (.faux-home, .git, .env) n'est jamais publie : ces
        # dossiers-la contiennent precisement ce qu'on ne veut pas donner.
        if any(seg.startswith(".") for seg in p.split("/") if seg):
            return False
        return name.lower().endswith(STATIC_SUFFIXES)

    def do_GET(self):
        if self.is_relayed():
            if self.guard():
                return
            if self.is_websocket():
                self.proxy_websocket()
            else:
                self.proxy_http("GET")
            return
        if self.route() == "/" + CONFIG_FILE:
            self.serve_redacted_config()
            return
        if self.route() in EMPRUNTS:
            self.serve_emprunt(self.route())
            return
        if self.route() == "/ulysse/versions":
            if self.guard():
                return
            self.dire_versions()
            return
        if not self.static_allowed():
            self.send_error(404, "Not Found")
            return
        # On sert le chemin NORMALISE : c'est celui qu'on vient d'autoriser.
        self.path = self.route()
        super().do_GET()

    def do_HEAD(self):
        if self.is_relayed():
            if self.guard():
                return
            self.proxy_http("HEAD")
            return
        if not self.static_allowed():
            self.send_error(404, "Not Found")
            return
        self.path = self.route()
        super().do_HEAD()

    def do_POST(self):
        # La seule route LOCALE en ecriture. Elle ne relaie rien, ne touche a
        # aucun secret, et n'ecrit qu'un fichier vide hors du dossier servi.
        if self.route() == "/ulysse/premier-vu":
            if self.guard():
                return
            self.marquer_premier_vu()
            return
        # Ecrire dans la memoire ne passe PAS par le relais nu : la copie datee
        # doit avoir lieu avant, et le refus de SOUL.md doit tenir ici, pas
        # seulement dans la page. Une frontiere qui ne tient que dans
        # l'interface n'est pas une frontiere.
        if self.route() == "/ulysse/ecrire":
            if self.guard():
                return
            self.ecrire_memoire()
            return
        if self.route() == "/ulysse/restaurer":
            if self.guard():
                return
            self.restaurer_version()
            return
        self.relay_or_405("POST")

    def do_PUT(self):
        self.relay_or_405("PUT")

    def do_PATCH(self):
        self.relay_or_405("PATCH")

    def do_DELETE(self):
        self.relay_or_405("DELETE")

    def do_OPTIONS(self):
        """Tout est en meme origine : il ne doit plus y avoir de preflight.

        On repond 403 plutot que d'emettre des en-tetes CORS permissifs — un
        `Access-Control-Allow-Origin` qui reflete l'origine du demandeur
        annulerait la protection ci-dessus.
        """
        self.send_error(403, "Forbidden",
                        "Ulysse se sert en meme origine ; aucun CORS n'est accorde.")

    def relay_or_405(self, method):
        if not self.is_relayed():
            self.send_error(405, "Method Not Allowed")
            return
        if self.guard():
            return
        if self.is_webhook():
            self.trigger_webhook()
            return
        self.proxy_http(method)

    # ------------------------------------------------------------------
    # Relais HTTP
    # ------------------------------------------------------------------

    def read_body(self):
        length = self.headers.get("Content-Length")
        if not length:
            return b""
        try:
            return self.rfile.read(int(length))
        except (ValueError, OSError):
            return b""

    def build_upstream_headers(self, backend):
        """Recopie les en-tetes client, expurges, avec l'auth du backend vise."""
        out = {}
        for name, value in self.headers.items():
            low = name.lower()
            if low in HOP_BY_HOP or low in ("host", "content-length", "origin", "referer"):
                continue
            # Inconditionnel : le jeton du dashboard n'a rien a faire chez le
            # gateway webhook, et une valeur venue du navigateur n'a de toute
            # facon aucune autorite ici.
            if low in CLIENT_AUTH_HEADERS:
                continue
            out[name] = value
        out["Host"] = backend.netloc
        # Le dashboard verifie l'Origin sur le WebSocket et le rejette s'il ne
        # designe pas son propre hote. On presente donc la sienne.
        out["Origin"] = backend.origin
        if backend.token:
            out["X-Hermes-Session-Token"] = backend.token
        return out

    def send_upstream_response(self, resp, method):
        """Renvoie la reponse amont sans dupliquer nos propres en-tetes."""
        # send_response_only (et non send_response) : send_response ajoute
        # Server et Date, que l'amont a deja envoyes.
        self.send_response_only(resp.status, resp.reason)
        for name, value in resp.getheaders():
            if name.lower() in HOP_BY_HOP:
                continue
            self.send_header(name, value)
        self.end_headers()
        if method != "HEAD":
            shutil.copyfileobj(resp, self.wfile)

    def proxy_http(self, method):
        if self.is_proxy():
            self.proxy_pure_chat()
            return

        backend = BACKEND
        body = self.read_body()
        headers = self.build_upstream_headers(backend)
        if body:
            headers["Content-Length"] = str(len(body))

        conn = None
        try:
            conn = backend.connect()
            conn.request(method, self.path, body=body or None, headers=headers)
            resp = conn.getresponse()
        except Exception as exc:  # backend eteint, port ferme, timeout...
            if conn:
                conn.close()
            self.send_error(502, "Bad Gateway",
                            "Backend Ulysse injoignable sur %s (%s)" % (backend.url, exc))
            return

        try:
            self.send_upstream_response(resp, method)
        except (BrokenPipeError, ConnectionResetError):
            pass  # le navigateur a coupe : rien a signaler
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Chat pur — relais vers le proxy Hermes, cle injectee ici
    # ------------------------------------------------------------------

    def proxy_pure_chat(self):
        backend = PROXY_BACKEND
        body = self.read_body()
        headers = {
            "Host": backend.netloc,
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
            "Accept": "application/json",
        }
        if backend.token:
            headers["Authorization"] = "Bearer " + backend.token

        conn = None
        try:
            conn = backend.connect()
            conn.request("POST", "/v1/chat/completions", body=body, headers=headers)
            resp = conn.getresponse()
        except Exception as exc:
            if conn:
                conn.close()
            self.send_error(502, "Bad Gateway",
                            "Proxy Hermes injoignable sur %s (%s)" % (backend.url, exc))
            return
        try:
            self.send_upstream_response(resp, "POST")
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Webhooks — POST /webhooks/<nom>, signe ici
    # ------------------------------------------------------------------

    def json_error(self, status, message):
        self.send_json(status, {"error": message})

    def send_json(self, status, obj):
        payload = json.dumps(obj).encode("utf-8")
        self.send_response_only(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def trigger_webhook(self):
        name = urllib.parse.unquote(self.route()[len("/webhooks/"):]).strip("/")
        # Une route est un identifiant simple (cf. la validation cote dashboard :
        # ^[a-z0-9][a-z0-9_-]*$). Refuser le reste evite qu'un nom bricole ne
        # devienne un chemin arbitraire chez le gateway.
        if not re.match(r"^[a-z0-9][a-z0-9_-]*$", name):
            self.json_error(400, "Nom de webhook invalide.")
            return

        secret = webhook_secret(name)
        if not secret:
            self.json_error(
                404,
                "Aucun secret pour la route « %s » dans webhook_subscriptions.json. "
                "Cree-la avec : hermes webhook subscribe %s --prompt \"...\"" % (name, name))
            return

        body = self.read_body()
        if not body:
            # Le gateway attend un payload : les variables {payload.x} du prompt
            # de la route s'y puisent. Un corps vide est un declenchement nu.
            body = json.dumps({"source": "ulysse"}).encode("utf-8")

        headers = {
            "Host": WEBHOOK_BACKEND.netloc,
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
            "User-Agent": "Ulysse/1.0",
        }
        headers.update(sign_webhook_v2(secret, body))

        conn = None
        try:
            conn = WEBHOOK_BACKEND.connect(timeout=30)
            conn.request("POST", "/webhooks/" + name, body=body, headers=headers)
            resp = conn.getresponse()
        except Exception as exc:
            if conn:
                conn.close()
            self.json_error(502, "Gateway webhook injoignable sur %s (%s)"
                            % (WEBHOOK_BACKEND.url, exc))
            return
        try:
            self.send_upstream_response(resp, "POST")
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Relais WebSocket  (/api/ws)
    # ------------------------------------------------------------------

    def ws_path_with_token(self):
        """Impose ?token=<jeton du proxy> : le handshake WS ne porte pas d'en-tete.

        On ECRASE ce que la page envoie plutot que de le completer — une valeur
        venue du navigateur n'a aucune autorite, et la page n'a plus le jeton.
        """
        parts = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(parts.query, keep_blank_values=True)
        query.pop("token", None)
        if BACKEND.token:
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
            # 1. Rejouer le handshake : Host ET Origin reecrits, jeton injecte.
            #    L'Origin est decisif — le dashboard verifie que l'origine du
            #    handshake designe son propre hote (_ws_host_origin_reason) et
            #    ferme en 4403 sinon. Relayer « http://127.0.0.1:8080 » tuait
            #    donc tout Cowork, avec un message trompeur cote page.
            lines = ["GET %s HTTP/1.1" % self.ws_path_with_token(),
                     "Host: %s" % BACKEND.netloc,
                     "Origin: %s" % BACKEND.origin]
            for name, value in self.headers.items():
                low = name.lower()
                if low in ("host", "origin", "referer"):
                    continue
                if low in CLIENT_AUTH_HEADERS:
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
    # Statique
    # ------------------------------------------------------------------

    def serve_redacted_config(self):
        """Sert ulysse-config.js sans ses secrets.

        Le fichier reste la source unique de configuration, mais le navigateur
        n'a aucun besoin du jeton de session : c'est le proxy qui authentifie.
        Le servir en clair reviendrait a le publier a qui sait taper son URL.
        """
        text = read_config_text()
        if not text:
            self.send_error(404, "Not Found")
            return
        for key in SECRET_CONFIG_KEYS:
            text = re.sub(_VALUE_RE % re.escape(key),
                          lambda m: m.group(0).replace('"%s"' % m.group(1), '""'),
                          text)
        # Le seul renseignement AJOUTE au fichier : est-ce le premier
        # lancement ? Il ne peut pas venir de la page — `localStorage` ne
        # survit ni a un autre navigateur ni a une fenetre privee, et le meme
        # poste reverrait l'ecran indefiniment. Il ne peut pas non plus venir
        # de l'absence des fichiers de memoire : ca dit « le profil n'est pas
        # ecrit », qui est autre chose.
        # On ecrit dans `window.ULYSSE_CONFIG`, que ce fichier declare — et
        # non dans `CFG`, qui n'existe pas encore : c'est ulysse-core.js qui
        # le construit, plus tard, a partir de celui-ci.
        text += "\n/* Ajoute par serve.py — le marqueur vit ici, pas dans la page. */\n"
        text += "window.ULYSSE_CONFIG.PREMIER = %s;\n" % (
            "true" if premier_lancement() else "false")
        payload = text.encode("utf-8")
        self.send_response_only(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def serve_emprunt(self, route):
        """Sert un fichier EMPRUNTE a Hermes, depuis une liste fermee.

        Aucun segment du chemin ne vient de la requete : `route` a deja ete
        normalise et compare a une cle de EMPRUNTS. C'est ce qui separe cette
        route de la faille S11, ou un `/../` du client remontait l'arbre.
        """
        chemin, mime = EMPRUNTS[route]
        try:
            with open(chemin, "rb") as f:
                payload = f.read()
        except OSError:
            # Hermes installe ailleurs, ou node_modules absent. On le DIT :
            # un terminal qui ne se charge pas sans explication est pire
            # qu'un terminal absent.
            self.send_error(404, "Not Found",
                            "xterm.js est introuvable dans l'installation Hermes.")
            return
        self.send_response_only(200)
        self.send_header("Content-Type", "%s; charset=utf-8" % mime)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    # ------------------------------------------------------------------
    # Ecrire dans la memoire — copie datee, versions, retour en arriere
    # ------------------------------------------------------------------

    # Le plafond d'Hermes pour une ecriture de texte
    # (`_FS_TEXT_WRITE_MAX_BYTES`, web_server.py:1853), plus la place de
    # l'enveloppe JSON. En mettre un plus bas ici ferait refuser des fichiers
    # qu'Hermes accepterait, avec un message venu du mauvais endroit.
    CORPS_MAX = 8 * 1024 * 1024 + 64 * 1024

    def lire_json(self, limite=None):
        """Corps JSON de la requete, ou (None, raison). Taille bornee."""
        limite = self.CORPS_MAX if limite is None else limite
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None, "En-tete Content-Length illisible."
        if n <= 0:
            return None, "Corps vide."
        if n > limite:
            return None, ("Corps trop gros (%d octets pour %d au plus)."
                          % (n, limite))
        try:
            return json.loads(self.rfile.read(n).decode("utf-8")), None
        except (ValueError, UnicodeDecodeError, OSError) as exc:
            return None, "JSON illisible (%s)." % exc

    def ecrire_memoire(self):
        """Garde la version d'avant, PUIS ecrit. Jamais l'inverse."""
        corps, souci = self.lire_json()
        if not isinstance(corps, dict):
            self.json_error(400, souci or "Corps JSON attendu : {path, content}.")
            return
        chemin = corps.get("path")
        contenu = corps.get("content")
        if not isinstance(contenu, str):
            self.json_error(400, "« content » doit etre du texte.")
            return

        refus = ecriture_refusee(chemin)
        if refus:
            self.json_error(403, refus)
            return

        # La copie AVANT l'ecriture, et si elle echoue on n'ecrit pas. C'est
        # tout l'objet de cette route : sans elle, la promesse de retour en
        # arriere serait fausse.
        try:
            garde = garder_version(chemin)
        except OSError as exc:
            self.json_error(
                500,
                "La version d'avant n'a pas pu etre mise de cote (%s). Rien n'a "
                "ete ecrit : mieux vaut ne pas ecrire que d'ecrire sans retour "
                "possible." % exc)
            return

        rep = self.appeler_backend(
            "POST", "/api/fs/write-text",
            json.dumps({"path": chemin, "content": contenu}).encode("utf-8"))
        statut, texte = rep
        if statut == 0:
            self.json_error(
                502, "Hermes n'a pas repondu (%s) ; rien n'a ete ecrit. La "
                     "version d'avant reste gardee." % texte[:160])
            return
        if statut >= 400:
            self.json_error(statut, "Hermes a refuse l'ecriture : %s" % texte[:300])
            return
        self.send_json(200, {
            "ok": True,
            "path": chemin,
            "version_gardee": os.path.basename(garde) if garde else None,
            "creation": garde is None,
            "versions": len(lister_versions(chemin)),
        })

    def dire_versions(self):
        chemin = urllib.parse.parse_qs(
            urllib.parse.urlparse(self.path).query).get("path", [""])[0]
        if not chemin or not _sous_chemin(hermes_home(), chemin):
            self.json_error(400, "Chemin absent ou hors du dossier d'Hermes.")
            return
        self.send_json(200, {"path": chemin, "versions": lister_versions(chemin)})

    def restaurer_version(self):
        """Revenir en arriere — en gardant d'abord ce qu'on quitte.

        Restaurer est une ecriture comme une autre : elle ecrase l'etat
        courant. Ne pas en garder copie ferait du retour en arriere un aller
        simple, et on aurait juste deplace le probleme d'un cran.
        """
        corps, souci = self.lire_json()
        if not isinstance(corps, dict):
            self.json_error(400, souci or "Corps JSON attendu : {path, nom}.")
            return
        chemin, nom = corps.get("path"), corps.get("nom")
        refus = ecriture_refusee(chemin)
        if refus:
            self.json_error(403, refus)
            return
        # Le nom vient du client : il ne doit designer qu'une version DE CE
        # fichier, dans le dossier des versions, et jamais servir de chemin.
        if (not isinstance(nom, str) or not nom
                or os.path.basename(nom) != nom
                or not nom.startswith(os.path.basename(chemin) + ".")):
            self.json_error(400, "Cette version n'appartient pas a ce fichier.")
            return
        source = os.path.join(dossier_versions(chemin), nom)
        if not os.path.isfile(source) or not _sous_chemin(dossier_versions(chemin), source):
            self.json_error(404, "Version introuvable.")
            return
        try:
            garde = garder_version(chemin)
            shutil.copy2(source, chemin)
        except OSError as exc:
            self.json_error(500, "Le retour en arriere a echoue (%s)." % exc)
            return
        self.send_json(200, {
            "ok": True, "path": chemin, "restauree": nom,
            "version_gardee": os.path.basename(garde) if garde else None,
        })

    def appeler_backend(self, methode, chemin, corps=None):
        """Un appel a Hermes fait PAR ce serveur, avec le jeton qu'il detient.

        Distinct du relais : ici la requete est la notre, pas celle du
        navigateur — c'est ce qui permet d'intercaler la copie datee.
        """
        backend = BACKEND
        entetes = self.build_upstream_headers(backend)
        entetes["Content-Type"] = "application/json"
        if corps:
            entetes["Content-Length"] = str(len(corps))
        conn = None
        try:
            conn = backend.connect()
            conn.request(methode, chemin, body=corps, headers=entetes)
            rep = conn.getresponse()
            return rep.status, rep.read().decode("utf-8", "replace")
        except Exception as exc:
            # On rend la cause : « injoignable » sans raison oblige a deviner,
            # et c'est precisement ce qu'on ne veut pas quand une ecriture
            # vient d'etre refusee.
            return 0, "%s: %s" % (type(exc).__name__, exc)
        finally:
            if conn:
                conn.close()

    def marquer_premier_vu(self):
        """Note que l'ecran de premier lancement a ete vu."""
        try:
            with open(MARQUEUR, "w", encoding="utf-8") as f:
                f.write(time.strftime("%Y-%m-%dT%H:%M:%S"))
            self.send_json(200, {"ok": True})
        except OSError as e:
            # Un marqueur qu'on ne peut pas ecrire n'est pas une panne : on
            # reverra l'ecran une fois de trop, c'est tout. On le dit.
            self.send_json(200, {"ok": False, "raison": str(e)})

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    global BACKEND, WEBHOOK_BACKEND, PROXY_BACKEND, ALLOWED_HOSTS, ALLOWED_ORIGINS
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    url, token, wh_url, proxy_url, proxy_token = load_config()
    backend = Backend(url, token)
    webhook_backend = Backend(wh_url or WEBHOOK_URL_FALLBACK, "")
    proxy_backend = Backend(proxy_url or PROXY_URL_FALLBACK, proxy_token)

    # Garde-fou : relayer vers soi-meme boucle a l'infini.
    loopback = ("127.0.0.1", "localhost", "::1")
    for label, target in (("HERMES_URL", backend),
                          ("WEBHOOK_URL", webhook_backend),
                          ("PROXY_URL", proxy_backend)):
        if target.port == PORT and target.host in loopback:
            print("Erreur : %s (%s) pointe sur ce serveur lui-meme." % (label, target.url))
            print("Corrige %s dans %s." % (label, CONFIG_FILE))
            return 1

    BACKEND = backend
    WEBHOOK_BACKEND = webhook_backend
    PROXY_BACKEND = proxy_backend
    # Les seuls Host / Origin qui designent ce serveur. Tout le reste est
    # soit une erreur de configuration, soit une tentative de rebinding.
    ALLOWED_HOSTS = frozenset({
        "127.0.0.1:%d" % PORT, "localhost:%d" % PORT, "[::1]:%d" % PORT,
    })
    ALLOWED_ORIGINS = frozenset({
        "http://127.0.0.1:%d" % PORT, "http://localhost:%d" % PORT,
        "http://[::1]:%d" % PORT,
    })

    shown = (token[:6] + "…" + token[-3:]) if len(token) > 12 else ("(aucun)" if not token else "…")
    base = "http://127.0.0.1:%d" % PORT
    print("Ulysse            : %s/" % base)
    print("Proxy /api/*      -> %s   (jeton %s)" % (backend.url, shown))
    print("Proxy /webhooks/* -> %s   (signature HMAC posee ici)" % webhook_backend.url)
    print("Proxy /proxy/chat -> %s" % proxy_backend.url)
    print("Ecoute sur %s uniquement. Ctrl+C pour arreter." % HOST)

    with ThreadingServer((HOST, PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nArret du serveur.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
