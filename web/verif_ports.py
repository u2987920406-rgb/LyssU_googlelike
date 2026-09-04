#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verif_ports.py — garde-fou de lancement d'Ulysse.

Ulysse enveloppe Hermes : il suppose pouvoir demarrer SES backend
(gateway 8644, proxy 8645) et ses fronts (dashboard 9123, UI 8080).
Si un de ces ports est deja pris sur la machine, un lancement aveugle
plante ou coince un service existant.

Ce script, lance AVANT lancer_ulysse.bat, decide :
  - port LIBRE                -> on le prend, on le lancera.
  - port OCCUPE + backend     -> on le REUTILISE (Hermes tourne deja), on ne
    Hermes deja actif            relance pas par-dessus.
  - port OCCUPE par un service -> CONFLIT : on bloque (Ulysse pointe en dur
    inconnu (ne repond pas)      sur 8644/8645 dans ulysse-config.js, forcer
                                 un port alt casserait la config).

Pour les fronts Ulysse (9123, 8080) : s'ils sont occupes, on bascule sur le
port libre suivant et on le reporte au .bat via ulysse_ports.bat.

Sortie :
  - exit 0 : OK (tout resolu, avec ou sans reuse)
  - exit 1 : conflit bloquant (port pris par un service inconnu)
  - genere ulysse_ports.bat (fragment SET) et ulysse_flags.bat (flags) que
    lancer_ulysse.bat fait `call`.
"""

import http.client
import os
import socket
import sys

# Ports utilises par Ulysse / Hermes.
GATEWAY_PORT = 8644      # webhook gateway (GET /health)
PROXY_PORT = 8645        # proxy chat OpenAI-compatible (GET /v1/models)
DASH_ULYSSE_PORT = 9123  # dashboard Ulysse (on DEMARRE le notre)
UI_PORT = 8090           # serve.py UI (aligné sur serve.PORT, config Raf)

HERE = os.path.dirname(os.path.abspath(__file__))


def port_libre(port, host="127.0.0.1"):
    """True si rien n'ecoute sur (host, port)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.4)
    try:
        s.connect((host, port))
        s.close()
        return False
    except (ConnectionRefusedError, socket.timeout, OSError):
        return True


def sonde_http(port, path, host="127.0.0.1", timeout=1.0):
    """Renvoie True si un serveur HTTP repond sur /path (meme en erreur HTTP)."""
    try:
        conn = http.client.HTTPConnection(host, port, timeout=timeout)
        conn.request("GET", path)
        conn.getresponse()
        conn.close()
        return True
    except Exception:
        return False


def trouve_port_libre(port_depart, host="127.0.0.1", max_tenta=20):
    """Renvoie le 1er port libre a partir de port_depart."""
    p = port_depart
    for _ in range(max_tenta):
        if port_libre(p, host):
            return p
        p += 1
    return None


def evaluer_backend(port, probe_path):
    """Pour gateway/proxy : dis si libre, reuse, ou conflit.

    Retourne (etat, port_a_utiliser)
      etat == "libre"   -> on lancera notre backend ici
      etat == "reuse"   -> deja actif, on reutilise, on ne lance pas
      etat == "conflit" -> occupé par inconnu -> bloquant
    """
    if port_libre(port):
        return "libre", port
    # Occupe. Est-ce un backend Hermes qui repond ?
    if sonde_http(port, probe_path):
        return "reuse", port
    # Occupe mais ne repond pas en HTTP : service inconnu.
    return "conflit", port


def main():
    # --- Gateway (8644) ---
    gw_etat, gw_port = evaluer_backend(GATEWAY_PORT, "/health")
    # --- Proxy (8645) ---
    px_etat, px_port = evaluer_backend(PROXY_PORT, "/v1/models")

    # --- Fronts Ulysse : bascule sur port libre si occupe ---
    if port_libre(DASH_ULYSSE_PORT):
        dash_port = DASH_ULYSSE_PORT
        dash_bascule = False
    else:
        dash_port = trouve_port_libre(DASH_ULYSSE_PORT + 1)
        dash_bascule = dash_port is not None

    if port_libre(UI_PORT):
        ui_port = UI_PORT
        ui_bascule = False
    else:
        ui_port = trouve_port_libre(UI_PORT + 1)
        ui_bascule = ui_port is not None

    # --- Rapport console ---
    print("Verification des ports Ulysse / Hermes")
    print("  gateway 8644 : %s" % gw_etat)
    print("  proxy  8645 : %s" % px_etat)
    print("  dashboard   : %s (%s)" % (dash_port, "defaut" if not dash_bascule else "bascule, 9123 occupe"))
    print("  UI serve    : %s (%s)" % (ui_port, "defaut" if not ui_bascule else "bascule, 8080 occupe"))

    conflit = (gw_etat == "conflit") or (px_etat == "conflit")
    if conflit:
        print("")
        print("CONFLIT BLOQUANT : 8644 ou 8645 est occupe par un service")
        print("inconnu (ne repond pas en tant que backend Hermes).")
        print("Ulysse pointe en dur sur ces ports dans ulysse-config.js :")
        print("forcer un port alternatif casserait la configuration.")
        print("=> Liberez le port (arretez l'autre service) puis relancez.")
        # Ecrire un fragment vide pour ne pas lancer sur des ports conflicts.
        _ecrire_fragment(dash_port, ui_port, gw_etat, px_etat)
        return 1

    # --- Tout resolu : generer les fragments pour le .bat ---
    _ecrire_fragment(dash_port, ui_port, gw_etat, px_etat)
    print("")
    print("Verification OK. Ports resolus ecrits dans ulysse_ports.bat.")
    if gw_etat == "reuse" or px_etat == "reuse":
        print("(backend Hermes deja actif detecte : ne sera pas relance)")
    return 0


def _ecrire_fragment(dash_port, ui_port, gw_etat, px_etat):
    """Ecrit ulysse_ports.bat (SET) et ulysse_flags.bat (flags)."""
    chem = lambda n: os.path.join(HERE, n)
    with open(chem("ulysse_ports.bat"), "w", encoding="utf-8") as f:
        f.write("@echo off\n")
        f.write("SET DASH_PORT=%d\n" % dash_port)
        f.write("SET ULYSSE_PORT=%d\n" % ui_port)
    with open(chem("ulysse_flags.bat"), "w", encoding="utf-8") as f:
        f.write("@echo off\n")
        f.write("SET GW_DEJA_UP=%s\n" % ("1" if gw_etat == "reuse" else "0"))
        f.write("SET PX_DEJA_UP=%s\n" % ("1" if px_etat == "reuse" else "0"))


if __name__ == "__main__":
    sys.exit(main())
