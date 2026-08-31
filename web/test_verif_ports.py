#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verification de verif_ports.py — le garde-fou de lancement, lui-meme garde.

Rien n'est simule a notre avantage : les ports sont occupes par de VRAIS
sockets, le backend « reuse » est un VRAI serveur HTTP, le service inconnu
est un VRAI socket qui ecoute sans jamais repondre. Les scenarios de main()
tournent sur des ports d'essai (les constantes sont remises apres), et les
fragments .bat s'ecrivent dans un dossier jetable.

    python3 test_verif_ports.py
"""

import http.server
import os
import socket
import sys
import tempfile
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))

import verif_ports as vp  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print("  %s  %s%s" % ("OK  " if ok else "ECHEC", name,
                          ("  — " + detail) if detail and not ok else ""))


def socket_muet():
    """Un service inconnu : il ecoute, il accepte, il ne repond JAMAIS."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    s.listen(5)
    return s, s.getsockname()[1]


class _Sante(http.server.BaseHTTPRequestHandler):
    """Un backend Hermes minimal : il repond, c'est tout ce que sonde_http
    demande (meme une erreur HTTP vaut « ca parle HTTP »)."""

    def do_GET(self):
        corps = b'{"ok": true}'
        self.send_response(200)
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def log_message(self, *a):
        pass


def backend_reel():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Sante)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def main():
    print("\n=== 1. port_libre : dire vrai sur qui ecoute ===")
    muet, p = socket_muet()
    check("un port tenu par un socket n'est pas libre", not vp.port_libre(p))
    muet.close()
    check("...et il redevient libre quand le socket lache", vp.port_libre(p))

    print("\n=== 2. trouve_port_libre : sauter l'occupe, prendre le suivant ===")
    # Trois ports consecutifs a nous : on occupe les deux premiers.
    base = None
    for essai in range(20000, 20400):
        try:
            # Backlog large : chaque sonde de port_libre LAISSE une connexion
            # en file (personne n'accepte jamais) ; a 1, la deuxieme sonde
            # trouverait porte close et croirait le port libre.
            a = socket.socket(); a.bind(("127.0.0.1", essai)); a.listen(16)
            b = socket.socket(); b.bind(("127.0.0.1", essai + 1)); b.listen(16)
        except OSError:
            try: a.close()
            except Exception: pass
            continue
        if vp.port_libre(essai + 2):
            base = essai
            break
        a.close(); b.close()
    check("trois ports consecutifs trouves pour l'essai", base is not None)
    if base is not None:
        check("les occupes sont sautes, le premier libre est rendu",
              vp.trouve_port_libre(base) == base + 2,
              str(vp.trouve_port_libre(base)))
        check("et quand la fenetre ne contient que de l'occupe : None",
              vp.trouve_port_libre(base, max_tenta=2) is None)
        a.close(); b.close()

    print("\n=== 3. evaluer_backend : libre / reuse / conflit ===")
    s, p = socket_muet(); s.close()
    check("port libre -> on lancera notre backend", vp.evaluer_backend(p, "/health") == ("libre", p))

    srv, p = backend_reel()
    check("un backend qui repond en HTTP -> reuse, on ne relance pas",
          vp.evaluer_backend(p, "/health") == ("reuse", p))
    srv.shutdown()

    muet, p = socket_muet()
    check("occupe et muet en HTTP -> conflit bloquant",
          vp.evaluer_backend(p, "/health") == ("conflit", p))
    muet.close()

    print("\n=== 4. _ecrire_fragment : ce que le .bat lira ===")
    ici_avant = vp.HERE
    with tempfile.TemporaryDirectory() as tmp:
        vp.HERE = tmp
        try:
            vp._ecrire_fragment(9123, 8081, "reuse", "libre")
        finally:
            vp.HERE = ici_avant
        with open(os.path.join(tmp, "ulysse_ports.bat"), encoding="utf-8") as f:
            ports = f.read()
        with open(os.path.join(tmp, "ulysse_flags.bat"), encoding="utf-8") as f:
            flags = f.read()
    check("les ports resolus sont poses en SET",
          "SET DASH_PORT=9123\n" in ports and "SET ULYSSE_PORT=8081\n" in ports,
          ports.replace("\n", " / "))
    check("reuse devient un flag 1, libre un flag 0",
          "SET GW_DEJA_UP=1\n" in flags and "SET PX_DEJA_UP=0\n" in flags,
          flags.replace("\n", " / "))

    print("\n=== 5. main() de bout en bout, sur des ports d'essai ===")
    constantes = (vp.GATEWAY_PORT, vp.PROXY_PORT, vp.DASH_ULYSSE_PORT,
                  vp.UI_PORT, vp.HERE)

    def scenario(gw, px, dash, ui, tmp):
        vp.GATEWAY_PORT, vp.PROXY_PORT = gw, px
        vp.DASH_ULYSSE_PORT, vp.UI_PORT = dash, ui
        vp.HERE = tmp
        try:
            code = vp.main()
            with open(os.path.join(tmp, "ulysse_ports.bat"), encoding="utf-8") as f:
                return code, f.read()
        finally:
            (vp.GATEWAY_PORT, vp.PROXY_PORT, vp.DASH_ULYSSE_PORT,
             vp.UI_PORT, vp.HERE) = constantes

    def port_vierge():
        s = socket.socket(); s.bind(("127.0.0.1", 0))
        p = s.getsockname()[1]; s.close()
        return p

    with tempfile.TemporaryDirectory() as tmp:
        code, ports = scenario(port_vierge(), port_vierge(),
                               port_vierge(), port_vierge(), tmp)
    check("tout libre -> exit 0", code == 0, str(code))

    # L'UI occupee (peu importe par quoi : les fronts ne sondent pas HTTP)
    # -> bascule sur le port libre suivant, et c'est LUI qui part au .bat.
    muet, p_ui = socket_muet()
    with tempfile.TemporaryDirectory() as tmp:
        code, ports = scenario(port_vierge(), port_vierge(),
                               port_vierge(), p_ui, tmp)
    muet.close()
    check("UI occupee -> exit 0 quand meme (bascule)", code == 0, str(code))
    check("...et le .bat recoit le port de bascule, pas l'occupe",
          ("SET ULYSSE_PORT=%d" % p_ui) not in ports
          and "SET ULYSSE_PORT=" in ports, ports.replace("\n", " / "))

    # Un service inconnu sur le port gateway -> conflit bloquant, exit 1,
    # et le fragment s'ecrit QUAND MEME (le .bat ne doit pas call dans le vide).
    muet, p_gw = socket_muet()
    with tempfile.TemporaryDirectory() as tmp:
        code, ports = scenario(p_gw, port_vierge(),
                               port_vierge(), port_vierge(), tmp)
    muet.close()
    check("gateway tenu par un inconnu -> exit 1, on bloque", code == 1, str(code))
    check("...mais le fragment existe, le .bat a de quoi call",
          "SET ULYSSE_PORT=" in ports)

    # Un backend Hermes deja actif sur le port proxy -> reuse, exit 0.
    srv, p_px = backend_reel()
    with tempfile.TemporaryDirectory() as tmp:
        code, _ = scenario(port_vierge(), p_px,
                           port_vierge(), port_vierge(), tmp)
    srv.shutdown()
    check("proxy deja actif (repond en HTTP) -> reuse, exit 0", code == 0, str(code))

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
