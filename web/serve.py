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
import subprocess
import ssl
import sys
import time
import urllib.parse

# ===========================================================================
# EDITER ICI — configuration du serveur
# ===========================================================================

PORT = 8090

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

def hermes_home():
    """Racine Hermes ($HERMES_HOME, sinon %LOCALAPPDATA%\\hermes, sinon ~/.hermes)."""
    env = os.environ.get("HERMES_HOME")
    if env:
        return env
    local = os.environ.get("LOCALAPPDATA")
    if local:
        return os.path.join(local, "hermes")
    return os.path.join(os.path.expanduser("~"), ".hermes")


# Le marqueur de premier lancement. Il vit DANS LE HERMES HOME, pas dans le
# dossier servi : tout ce qui est ici est publie a qui sait taper une URL.
# Un fichier de plus dans web/ serait aussi un fichier de plus a ignorer dans
# les verifications de fidelite.
MARQUEUR = os.path.join(hermes_home(), "ulysse-premier-vu")


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
    return os.path.join(hermes_home(), "hermes-agent")


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
                   ".gif", ".webp", ".ico", ".woff", ".woff2", ".map", ".md")

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


def set_config_value(text, key, value):
    """Pose (ou ecrase) `key: "value"` dans ulysse-config.js.

    La valeur est echappee pour ne pas casser le JavaScript : tout guillemet
    double devient `\\"`, et les retours a la ligne sont interdits (une cle de
    config ne doit pas en contenir). Retourne le nouveau texte. Si la cle
    n'existe pas, le texte est rendu tel quel et l'appelant doit le verifier.
    """
    safe = str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
    pat = re.compile(_VALUE_RE % re.escape(key))
    m = pat.search(text)
    if not m:
        return text
    # ⚠ CE QUI PRECEDE LA CLE FAIT PARTIE DU FICHIER, ET LE MOTIF LE MANGE.
    # `_VALUE_RE` commence par `^\s*` : il CONSOMME l'indentation (et, sur une
    # ligne precedee d'une ligne vide, le saut de ligne lui-meme). Une
    # substitution qui ne les remet pas recolle la cle en colonne 0 : changer
    # de modele depuis Reglages abimait la mise en forme de ulysse-config.js a
    # chaque fois. Vu le 2026-08-12 par le banc des ecrans, sur un `git diff`
    # qui montrait une ligne desindentee apres un aller-retour cense ne rien
    # changer. On rend donc le prefixe tel qu'il a ete pris.
    tete = m.group(0)[:m.group(0).index(key)]
    # ⚠ UNE FONCTION, PAS UNE CHAINE. Dans le remplacement de `re.sub`, « \1 »
    # et « \g<1> » sont des MOTIFS : une valeur contenant une contre-oblique —
    # et `safe` en produit justement, en doublant celles qu'on lui donne —
    # serait reinterpretee au lieu d'etre ecrite. C'est le meme piege que
    # « $& » dans `String.replace` cote JavaScript, qui a deja corrompu un
    # fichier inline dans test_page.js le 2026-08-11.
    return pat.sub(lambda _m: '%s%s: "%s"' % (tete, key, safe), text, count=1)


def read_config_text():
    """Le fichier TEL QU'IL EST, fins de ligne comprises.

    ⚠ `newline=""` N'EST PAS UN DETAIL. Sans lui, Python lit en « newlines
    universelles » : tout CRLF devient LF en memoire, et l'ecriture d'a cote
    retraduit ensuite chaque LF en CRLF sur Windows. Poser puis retirer un
    override de modele — un aller-retour qui ne change RIEN — reecrivait donc
    les fins de ligne du fichier ENTIER. `git diff` restait vide (git les
    normalise), mais `git status` le disait modifie a chaque fois, et il
    fallait un `git checkout --` pour retrouver un arbre propre.
    Vu le 2026-08-12, apres chaque passage de `banc_ecrans.js`.

    Avec `newline=""` des deux cotes, un fichier en CRLF reste en CRLF, un
    fichier en LF reste en LF, et l'aller-retour est identique OCTET POUR
    OCTET — ce que le banc verifie maintenant, plutot que de se contenter de
    l'indentation.
    """
    if not os.path.exists(CONFIG_FILE):
        return ""
    with open(CONFIG_FILE, "r", encoding="utf-8", errors="replace", newline="") as fh:
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


# ═══ LA CORBEILLE ════════════════════════════════════════════════════════════
#
# ⚠ HERMES N'EN A AUCUNE. Verifie dans son code source le 2026-08-22 :
# `DELETE /api/files` (web_server.py:2576) fait un `unlink` / `rmtree`
# IMMEDIAT, `projects.delete` efface la ligne en base, et les cinq routes de
# suppression de sessions sont toutes definitives. Aucun `send2trash`, aucun
# `shell.trash`, nulle part dans l'arbre. Ce qui part ne revient pas.
#
# Le glossaire d'Ulysse dit pourtant, depuis toujours, ce qu'une corbeille
# doit etre : « Met a la corbeille. NE DETRUIT PAS : l'objet y reste. » Cette
# section-ci tient cette promesse, en la fabriquant ici — c'est-a-dire dans
# l'enveloppe, sans toucher aux binaires d'Hermes.
#
# ⚠ ET ELLE N'EFFACE JAMAIS. Arbitre avec kuchu le 2026-08-22 : Ulysse
# DEPLACE et sait remettre, mais « vider pour de bon » reste un geste que la
# personne fait elle-meme, ailleurs. Il n'y a donc AUCUNE route de purge dans
# ce fichier, et ce n'est pas un oubli : ajouter `rmtree` ici rendrait faux le
# seul mot qui protege — « ne detruit pas ».
DOSSIER_CORBEILLE = "corbeille-ulysse"
INDEX_CORBEILLE = "corbeille.json"


def corbeille_dir():
    """La corbeille vit dans le Hermes Home, jamais dans `web/`.

    `web/` est le PRODUIT (regle S10) : tout ce qui y tombe est telechargeable
    depuis :8080. Deux routes ont deja ete supprimees pour l'avoir oublie.
    """
    return os.path.join(hermes_home(), DOSSIER_CORBEILLE)


def _chemins_proteges():
    """Ce qu'on ne met pas a la corbeille, quoi qu'il arrive."""
    return [
        os.path.dirname(os.path.abspath(__file__)),   # web/ — le produit lui-meme
        corbeille_dir(),                              # la corbeille
    ]


def corbeille_refusee(chemin):
    """Raison de refus, ou None. Seule porte d'entree des regles du jeter."""
    if not chemin or not isinstance(chemin, str):
        return "Aucun fichier n'a ete indique."
    if not os.path.exists(chemin):
        return "Ce fichier n'existe plus."
    plein = os.path.abspath(chemin)

    nom = os.path.basename(plein).lower()
    if nom in INTERDITS_ECRITURE:
        return ("SOUL.md ne se jette pas depuis Ulysse, pas plus qu'il ne "
                "s'ecrit : il dit ce qu'Ulysse s'autorise et ce qu'il refuse.")

    # La racine d'un disque, ou le Hermes Home lui-meme : un geste par
    # inadvertance ne doit pas pouvoir emporter tout l'espace de travail.
    if os.path.dirname(plein) == plein:
        return "On ne met pas la racine d'un disque a la corbeille."
    if _sous_chemin(plein, hermes_home()):
        return ("Ce dossier CONTIENT le dossier d'Hermes. Le deplacer "
                "emporterait la corbeille elle-meme, et la memoire avec.")

    for garde in _chemins_proteges():
        if _sous_chemin(garde, plein) or _sous_chemin(plein, garde):
            return ("Ce chemin fait partie d'Ulysse ou de sa corbeille. "
                    "Ulysse ne se jette pas lui-meme.")

    # Une version gardee est precisement ce qui existe pour empecher une
    # perte : la jeter reviendrait a desarmer le retour en arriere.
    if DOSSIER_VERSIONS in plein.replace("\\", "/").split("/"):
        return ("Ce fichier est une version gardee. On y revient, on ne la "
                "jette pas : c'est ce qui rend le retour en arriere sur.")
    return None


def corbeille_index():
    """Ce que la corbeille contient, lu depuis son index. Jamais devine.

    L'index est la SEULE chose qui sache d'ou vient un objet : sans lui, on
    saurait remettre un nom mais pas une place, et « restaurer » ne voudrait
    plus rien dire.
    """
    fichier = os.path.join(corbeille_dir(), INDEX_CORBEILLE)
    try:
        with open(fichier, "r", encoding="utf-8") as f:
            donnees = json.load(f)
    except (OSError, ValueError):
        return []
    return donnees if isinstance(donnees, list) else []


def corbeille_ecrire_index(entrees):
    os.makedirs(corbeille_dir(), exist_ok=True)
    fichier = os.path.join(corbeille_dir(), INDEX_CORBEILLE)
    # Ecriture par un temporaire puis remplacement : un index a moitie ecrit
    # perdrait la trace de TOUT ce que la corbeille contient.
    temp = fichier + ".tmp"
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(entrees, f, ensure_ascii=False, indent=1)
    os.replace(temp, fichier)


def corbeille_jeter(chemin):
    """Deplace vers la corbeille. Rend l'entree d'index creee."""
    plein = os.path.abspath(chemin)
    dossier = corbeille_dir()
    os.makedirs(dossier, exist_ok=True)
    quand = time.strftime("%Y-%m-%d-%H%M%S")
    base = os.path.basename(plein)
    # Le nom range porte la date : deux fichiers du meme nom, jetes deux jours
    # differents, ne doivent pas s'ecraser dans la corbeille.
    cible = os.path.join(dossier, quand + "__" + base)
    n = 2
    while os.path.exists(cible):
        cible = os.path.join(dossier, "%s-%d__%s" % (quand, n, base))
        n += 1
    shutil.move(plein, cible)
    entree = {
        "id": os.path.basename(cible),
        "nom": base,
        "origine": plein,
        "quand": quand,
        "dossier": os.path.isdir(cible),
    }
    entrees = corbeille_index()
    entrees.insert(0, entree)
    corbeille_ecrire_index(entrees)
    return entree


def corbeille_restaurer(ident):
    """Remet a sa place. Rend (entree, souci) — l'un des deux est None."""
    entrees = corbeille_index()
    entree = next((e for e in entrees if e.get("id") == ident), None)
    if entree is None:
        return None, "Cet element n'est plus dans la corbeille."
    source = os.path.join(corbeille_dir(), entree["id"])
    if not os.path.exists(source):
        return None, ("Cet element a ete sorti de la corbeille a la main : "
                      "Ulysse ne sait plus ou il est.")
    origine = entree.get("origine") or ""
    if not origine:
        return None, "On ne sait pas d'ou venait cet element."
    # On n'ECRASE PAS ce qui a repris la place entre-temps : ce serait
    # detruire pour restaurer, exactement ce que la corbeille evite.
    if os.path.exists(origine):
        return None, ("Quelque chose occupe deja « %s ». Ulysse ne l'ecrase "
                      "pas : deplacez-le d'abord." % origine)
    parent = os.path.dirname(origine)
    if parent and not os.path.isdir(parent):
        try:
            os.makedirs(parent, exist_ok=True)
        except OSError as exc:
            return None, "Le dossier d'origine n'a pas pu etre recree (%s)." % exc
    shutil.move(source, origine)
    corbeille_ecrire_index([e for e in entrees if e.get("id") != ident])
    return entree, None


def corbeille_vider(ident=None):
    """Effacer POUR DE BON. Rend (nombre efface, souci).

    ⚠ CETTE ROUTE N'EXISTAIT PAS, ET SON ABSENCE ETAIT LE COEUR DE LA
    PROMESSE. Elle est ajoutee le 2026-08-22 sur demande explicite de kuchu
    (« il faut pouvoir supprimer ce qui est supprimable »), qui revient sur
    l'arbitrage du matin meme. Ce qui part d'ici ne revient pas : Hermes n'a
    aucune corbeille systeme, et nous n'en avons plus derriere celle-ci.

    Deux gardes tiennent la frontiere, et aucun n'est decoratif :
      · l'identifiant est un NOM DE FICHIER, jamais un chemin — sinon
        « ../../Documents » sortirait du dossier ;
      · la cible est confrontee au dossier de la corbeille par un chemin
        REEL (`_sous_chemin`), donc un lien symbolique qui pointe ailleurs
        est refuse lui aussi.
    Sans `ident`, on vide tout — mais seulement ce que l'index connait, pas
    ce qui traine dans le dossier.
    """
    dossier = corbeille_dir()
    entrees = corbeille_index()
    if ident is not None:
        if ident != os.path.basename(ident):
            return 0, "Identifiant invalide."
        vises = [e for e in entrees if e.get("id") == ident]
        if not vises:
            return 0, "Cet element n'est plus dans la corbeille."
    else:
        vises = list(entrees)

    efface = 0
    for e in vises:
        cible = os.path.join(dossier, e.get("id") or "")
        # La cible doit etre DANS la corbeille, chemins reels compares.
        if not _sous_chemin(dossier, cible) or os.path.realpath(cible) == os.path.realpath(dossier):
            continue
        try:
            if os.path.isdir(cible) and not os.path.islink(cible):
                shutil.rmtree(cible)
            elif os.path.exists(cible) or os.path.islink(cible):
                os.remove(cible)
            else:
                # Sorti a la main : rien a effacer ICI. L'index est purge
                # plus bas, mais « efface » ne compte que ce que NOTRE geste
                # a fait disparaitre — un compteur qui compte l'absent ment.
                continue
            efface += 1
        except OSError:
            continue          # on garde l'entree : elle est encore la
    restants = [e for e in entrees
                if os.path.exists(os.path.join(dossier, e.get("id") or ""))]
    corbeille_ecrire_index(restants)
    return efface, None


def corbeille_liste():
    """L'index, mais confronte au disque — on n'affiche pas ce qui n'est plus la."""
    dossier = corbeille_dir()
    vues = []
    for e in corbeille_index():
        chemin = os.path.join(dossier, e.get("id") or "")
        if not os.path.exists(chemin):
            continue          # sorti a la main : on ne pretend pas le detenir
        taille = None
        try:
            if os.path.isfile(chemin):
                taille = os.path.getsize(chemin)
        except OSError:
            taille = None
        vue = dict(e)
        vue["taille"] = taille
        vues.append(vue)
    return vues


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


def _cle_version(quand):
    """Ordre de garde, lu dans le NOM : « 2026-08-09-131500 » ou « ...-2 ».

    Pourquoi pas la date du fichier : `garder_version` recopie la date de
    l'ORIGINAL sur la copie (c'est ce qu'on affiche, et c'est juste : ca dit
    quand ce texte-la a ete ecrit). Mais deux ecritures dans la meme seconde
    donnent alors deux dates identiques, et l'egalite se tranchait dans
    l'ordre de `os.listdir` — au hasard. « Revenir a la version precedente »
    pouvait donc rendre la mauvaise. Le nom, lui, est pose en ordre strict.

    Le compteur est compare en NOMBRE et non en texte : « -10 » vient apres
    « -2 », alors que l'ordre alphabetique le mettrait avant.
    """
    bouts = quand.split("-")
    if len(bouts) == 5 and bouts[4].isdigit():
        return ("-".join(bouts[:4]), int(bouts[4]))
    return (quand, 0)


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
    out.sort(key=lambda v: _cle_version(v["quand"]), reverse=True)
    return out


# ===========================================================================
# Ouvrir une VRAIE console Hermes, hors d'Ulysse
#
# Le bouton copiait une commande et disait de la coller ailleurs. kuchu a
# demande qu'il fasse ce qu'il annonce. C'est le seul endroit ou Ulysse lance
# un processus sur la machine : il merite donc d'etre etroit.
#
# CE QUI REND CECI SUR :
#   · la commande est ECRITE ICI, en dur, sous forme de liste — aucun mot ne
#     vient du navigateur, donc rien a echapper et rien a injecter ;
#   · la route n'accepte AUCUN corps, aucun parametre ;
#   · meme origine exigee, comme tout le reste ;
#   · la fenetre ouverte est VISIBLE. Un lancement qu'on ne verrait pas serait
#     une porte derobee ; celui-ci se voit, se lit et se ferme.
#
# Ce qui s'y ouvre n'est rien de plus que ce que la personne taperait
# elle-meme dans son terminal. Mais c'est Ulysse qui le fait, alors on le dit.
# ===========================================================================

# La forme de cette ligne a ete eprouvee pour de vrai, pas seulement en test.
# Le piege : `start` ne prend un premier mot pour un TITRE que s'il est entre
# guillemets. Or Popen ne met de guillemets qu'autour des arguments contenant
# une espace : `start Hermes cmd /k hermes` cherchait donc un PROGRAMME nomme
# "Hermes", ne le trouvait pas, et ouvrait une boite d'erreur bloquante.
# D'ou le titre VIDE ici, et le vrai titre pose par `title` dans la fenetre.
# Rendu : cmd /c start "" cmd /k "title Hermes & hermes"
#
# On garde `start` plutot que creationflags=CREATE_NEW_CONSOLE : la fenetre
# est alors detachee du serveur, elle survit a son arret et ne meurt pas avec.
CONSOLE_ARGV = ["cmd", "/c", "start", "", "cmd", "/k", "title Hermes & hermes"]

# Point d'injection pour les tests : une suite de verifications ne doit PAS
# ouvrir de fenetres sur la machine de quelqu'un.
LANCEUR = None


def ouvrir_console():
    """Ouvre une console Hermes. Rend (True, None) ou (False, raison)."""
    if not sys.platform.startswith("win"):
        return False, ("Cette machine n'est pas sous Windows : Ulysse ne sait "
                       "pas y ouvrir de console. Copiez la commande et "
                       "lancez-la vous-meme.")
    lanceur = LANCEUR or subprocess.Popen
    try:
        lanceur(CONSOLE_ARGV, close_fds=True)
    except OSError as exc:
        return False, ("La console n'a pas pu s'ouvrir (%s). Hermes est-il "
                       "bien dans le PATH ?" % exc)
    return True, None


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
        if self.route() == "/ulysse/corbeille":
            if self.guard():
                return
            self.send_json(200, {"entrees": corbeille_liste(),
                                 "dossier": corbeille_dir()})
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
        # Le seul endroit ou Ulysse lance un processus. La commande est ecrite
        # dans ce fichier, en dur : rien de ce qui arrive ici n'entre dedans,
        # donc il n'y a rien a echapper et rien a injecter. Un corps envoye
        # quand meme est vide puis jete (cf. vider_corps) : ne pas le lire du
        # tout brisait la connexion, et la reponse se perdait.
        if self.route() == "/ulysse/set-model":
            if self.guard():
                return
            self.set_modele_config()
            return
        if self.route() == "/ulysse/console":
            if self.guard():
                return
            ok, souci = ouvrir_console()
            if ok:
                self.send_json(200, {"ok": True})
            else:
                self.json_error(500, souci)
            return
        # La corbeille. DEUX gestes seulement — jeter, remettre. Il n'y a pas
        # de troisieme route, et c'est le coeur de la promesse : voir le bloc
        # `DOSSIER_CORBEILLE` plus haut.
        if self.route() == "/ulysse/corbeille/jeter":
            if self.guard():
                return
            self.corbeille_jeter_route()
            return
        if self.route() == "/ulysse/corbeille/restaurer":
            if self.guard():
                return
            self.corbeille_restaurer_route()
            return
        if self.route() == "/ulysse/corbeille/vider":
            if self.guard():
                return
            self.corbeille_vider_route()
            return
        # ⚠ NI /ulysse/capture NI /ulysse/artifact. Les deux ont existe, les
        # deux ecrivaient dans web/ — le dossier SERVI, donc le produit — et
        # les deux doublaient un chemin qui marchait deja :
        #   · la capture collee est une piece jointe (image.attach), et c'est
        #     le gateway qui la materialise dans l'espace de la session ;
        #   · un artefact est un fichier comme un autre : `/api/files/read`
        #     sait deja le lire, ou qu'il soit.
        # La regle S10 a ferme web/ a la publication parce que c'est du
        # produit, pas un espace de travail. Ces deux routes le rouvraient par
        # la fenetre. Voir PASSE-DESIGN-COLLER-IMAGE.md §2 et
        # PASSE-DESIGN-FICHIERS.md §2.
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

    # ------------------------------------------------------------------
    # Le corps non lu
    #
    # Repondre a une requete sans avoir lu son corps laisse des octets en
    # attente dans la connexion. Le serveur ferme, le systeme envoie un RST,
    # et le client PERD la reponse qu'on venait pourtant de lui ecrire
    # (WinError 10053 sous Windows). Constate en vrai : un POST avec corps sur
    # /ulysse/console — une route qui se targue justement de n'en lire aucun.
    #
    # « Ignorer le corps » doit donc vouloir dire le LIRE et ne pas s'en
    # servir. La vidange est faite ici, une fois pour toutes, avant toute
    # reponse : chaque route n'a pas a y penser, et une route ecrite demain
    # ne pourra pas oublier de le faire.
    # ------------------------------------------------------------------

    VIDANGE_MAX = 1024 * 1024

    def handle_one_request(self):
        # Une connexion gardee ouverte sert plusieurs requetes avec le MEME
        # objet : sans cette remise a zero, la deuxieme se croirait deja lue.
        self._corps_lu = False
        super().handle_one_request()

    def vider_corps(self):
        """Lit et jette le corps qui n'a pas ete lu. Sans effet s'il l'a ete."""
        if getattr(self, "_corps_lu", False):
            return
        self._corps_lu = True
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.close_connection = True
            return
        if n <= 0:
            return
        if n > self.VIDANGE_MAX:
            # On n'avale pas des megaoctets par politesse. On ferme la
            # connexion : c'est franc, et la reponse est deja partie.
            self.close_connection = True
            return
        try:
            self.rfile.read(n)
        except OSError:
            self.close_connection = True

    def read_body(self):
        self._corps_lu = True
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

    def send_error(self, code, message=None, explain=None):
        self.vider_corps()
        super().send_error(code, message, explain)

    def send_json(self, status, obj):
        self.vider_corps()
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
        # Marque AVANT la lecture : meme si le JSON est illisible, les octets
        # ont quitte la connexion et il ne faut pas les relire.
        self._corps_lu = True
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

    # On n'ecrit PAS n'importe quelle cle de ulysse-config.js depuis la page :
    # seules ces deux-la concernent le choix du modele, et c'est tout ce que le
    # panneau Reglages > Le cerveau est autorise a toucher. Toute autre cle est
    # refusee (400), pour ne pas laisser la page muter la config du proxy ou
    # des webhooks.
    CLES_MODELE_AUTORISEES = ("PROXY_MODEL", "SESSION_MODEL")

    def set_modele_config(self):
        """Pose PROXY_MODEL / SESSION_MODEL dans ulysse-config.js, versionnee.

        Corps attendu : {key, value}. `value` vide = vider l'override (on
        remet la chaine vide, Ulysse herite alors du profil Hermes). Copie
        datee avant ecriture, comme pour la memoire : le retour en arriere est
        reel, pas promis.
        """
        corps, souci = self.lire_json()
        if not isinstance(corps, dict):
            self.json_error(400, souci or "Corps JSON attendu : {key, value}.")
            return
        cle = corps.get("key")
        valeur = corps.get("value", "")
        if cle not in self.CLES_MODELE_AUTORISEES:
            self.json_error(400,
                "Cle non autorisee. Acceptees : %s."
                % ", ".join(self.CLES_MODELE_AUTORISEES))
            return
        if not isinstance(valeur, str):
            self.json_error(400, "« value » doit etre du texte (vide = heritage).")
            return

        texte = read_config_text()
        if not texte:
            self.json_error(404, "ulysse-config.js introuvable.")
            return
        if not re.search(_VALUE_RE % re.escape(cle), texte):
            self.json_error(404,
                "La cle %s n'existe pas dans ulysse-config.js." % cle)
            return

        # Garde AVANT ecriture ; si elle echoue, on n'ecrit pas.
        try:
            garde = garder_version(CONFIG_FILE)
        except OSError as exc:
            self.json_error(500,
                "La version d'avant n'a pas pu etre mise de cote (%s). Rien "
                "n'a ete ecrit." % exc)
            return

        nouveau = set_config_value(texte, cle, valeur)
        try:
            # `newline=""` : on ecrit les fins de ligne telles qu'elles ont ete
            # lues, sans les retraduire. Voir `read_config_text`.
            with open(CONFIG_FILE, "w", encoding="utf-8", newline="") as fh:
                fh.write(nouveau)
        except OSError as exc:
            self.json_error(500, "Ecriture impossible (%s)." % exc)
            return
        self.send_json(200, {
            "ok": True,
            "key": cle,
            "value": valeur,
            "version_gardee": os.path.basename(garde) if garde else None,
        })

    def dire_versions(self):
        chemin = urllib.parse.parse_qs(
            urllib.parse.urlparse(self.path).query).get("path", [""])[0]
        if not chemin or not _sous_chemin(hermes_home(), chemin):
            self.json_error(400, "Chemin absent ou hors du dossier d'Hermes.")
            return
        self.send_json(200, {"path": chemin, "versions": lister_versions(chemin)})

    def corbeille_jeter_route(self):
        """Mettre a la corbeille : un DEPLACEMENT, jamais un effacement."""
        corps, souci = self.lire_json()
        if not isinstance(corps, dict):
            self.json_error(400, souci or "Corps JSON attendu : {path}.")
            return
        chemin = corps.get("path")
        refus = corbeille_refusee(chemin)
        if refus:
            self.json_error(403, refus)
            return
        try:
            entree = corbeille_jeter(chemin)
        except OSError as exc:
            self.json_error(500, "Le deplacement a echoue (%s). Rien n'a "
                                 "bouge." % exc)
            return
        self.send_json(200, {"ok": True, "entree": entree})

    def corbeille_restaurer_route(self):
        """Remettre a sa place, sans jamais ecraser ce qui l'occupe."""
        corps, souci = self.lire_json()
        if not isinstance(corps, dict):
            self.json_error(400, souci or "Corps JSON attendu : {id}.")
            return
        ident = corps.get("id")
        if not isinstance(ident, str) or not ident:
            self.json_error(400, "« id » manquant.")
            return
        # Un identifiant est un NOM DE FICHIER dans la corbeille, jamais un
        # chemin : sans cette ligne, « ../../ailleurs » sortirait du dossier.
        if ident != os.path.basename(ident):
            self.json_error(400, "Identifiant invalide.")
            return
        try:
            entree, souci = corbeille_restaurer(ident)
        except OSError as exc:
            self.json_error(500, "La remise en place a echoue (%s)." % exc)
            return
        if souci:
            self.json_error(409, souci)
            return
        self.send_json(200, {"ok": True, "entree": entree})

    def corbeille_vider_route(self):
        """Effacer pour de bon. Le seul endroit d'Ulysse qui detruise."""
        corps, souci = self.lire_json()
        if not isinstance(corps, dict):
            self.json_error(400, souci or "Corps JSON attendu : {id} ou {tout:true}.")
            return
        ident = corps.get("id")
        tout = corps.get("tout") is True
        if not tout and not isinstance(ident, str):
            self.json_error(400, "Indiquez « id », ou « tout: true ».")
            return
        try:
            n, souci = corbeille_vider(None if tout else ident)
        except OSError as exc:
            self.json_error(500, "L'effacement a echoue (%s)." % exc)
            return
        if souci:
            self.json_error(409, souci)
            return
        self.send_json(200, {"ok": True, "efface": n})

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


# ===========================================================================
# Le piege du serveur deja en marche
#
# Sous Windows, `allow_reuse_address` laisse un SECOND serveur se lier au meme
# port SANS ERREUR — et c'est le PREMIER qui continue de repondre. Mesure du
# 2026-08-09 : deux serveurs sur le meme port, six requetes, six reponses du
# premier.
#
# Consequence : relancer sans fermer l'ancienne fenetre ne fait RIEN. Le
# nouveau serveur demarre, affiche sa banniere, dit « Ulysse : http://... » —
# et c'est l'ANCIEN CODE qui repond. On croit avoir relance, on mesure
# l'etat d'avant. C'est arrive deux fois dans ce projet.
#
# On ne peut pas compter sur le fait d'y penser. Le serveur le dit lui-meme.
# ===========================================================================

def port_deja_pris(host, port, delai=0.4):
    """Quelqu'un repond-il deja sur ce port ? Rend True, False, ou None.

    None veut dire « on n'a pas pu savoir » — et on ne bloque pas sur un
    doute : refuser de demarrer pour une raison qu'on ne sait pas nommer
    serait pire que le piege qu'on essaie d'eviter.
    """
    cible = "127.0.0.1" if host in ("", "0.0.0.0") else host
    try:
        with socket.create_connection((cible, port), timeout=delai):
            return True
    except (ConnectionRefusedError, socket.timeout, OSError):
        # Refus = personne n'ecoute, c'est le cas normal. Les autres erreurs
        # (nom introuvable, pile reseau capricieuse) ne prouvent rien.
        return False


def port_effectif(argv, env):
    """Le port d'ecoute reel : --port N (argv) prime, sinon ULYSSE_PORT (env),
    sinon la constante PORT du fichier.

    C'est le contrat de verif_ports.py : quand 8080 est pris, il resout un
    port libre et le transmet via ulysse_ports.bat — un serveur qui l'ignore
    rend la bascule inutile (le navigateur s'ouvre sur un port ou personne
    n'ecoute)."""
    if "--port" in argv:
        try:
            return int(argv[argv.index("--port") + 1])
        except (IndexError, ValueError):
            raise SystemExit("Usage : python serve.py [--port N]")
    brut = env.get("ULYSSE_PORT", "")
    if brut:
        try:
            return int(brut)
        except ValueError:
            raise SystemExit("ULYSSE_PORT doit etre un entier, pas %r" % brut)
    return PORT


def main():
    global BACKEND, WEBHOOK_BACKEND, PROXY_BACKEND, ALLOWED_HOSTS, ALLOWED_ORIGINS, PORT
    PORT = port_effectif(sys.argv[1:], os.environ)
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
        # Acces tailnet (telephone de Raf) — expose via `tailscale serve`.
        "raf-bmax.tail14baaa.ts.net:%d" % PORT,
    })
    ALLOWED_ORIGINS = frozenset({
        "http://127.0.0.1:%d" % PORT, "http://localhost:%d" % PORT,
        "http://[::1]:%d" % PORT,
        "https://raf-bmax.tail14baaa.ts.net:%d" % PORT,
    })

    # AVANT toute banniere : si quelqu'un repond deja ici, se lier par-dessus
    # ne prendrait pas la main — on le dit et on s'arrete, plutot que de
    # laisser croire a un demarrage qui n'a pas lieu.
    if port_deja_pris(HOST, PORT):
        print("Un serveur repond DEJA sur http://127.0.0.1:%d" % PORT)
        print("")
        print("Ulysse ne demarre pas : sous Windows, se lier par-dessus")
        print("reussit sans erreur mais c'est l'ANCIEN qui continue de")
        print("repondre. Vous croiriez avoir relance, et vous mesureriez")
        print("l'etat d'avant.")
        print("")
        print("Fermez la fenetre « Ulysse-Serve » deja ouverte, puis")
        print("relancez lancer_ulysse.bat.")
        return 2

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
