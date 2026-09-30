#!/usr/bin/env python3
"""lancer-ulysse.py — démarrer le serveur Ulysse sur un port libre avec fallback.
Usage : python3 lancer-ulysse.py [PORT]
Si PORT non donné, cherche un port libre automatiquement.
"""
import os
import subprocess
import sys
import time
import socket
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent / "web"
LOG = Path(f"/tmp/ulysse-serve-{os.getpid()}.log")


def port_libre(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), 0.2):
            return False
    except (ConnectionRefusedError, socket.timeout, OSError):
        return True


def trouver_port_libre() -> int:
    for candid in [8095, 8455, 8456, 8457, 8675, 8875, 8096, 8458]:
        if port_libre(candid):
            return candid
    raise SystemExit("ERREUR: aucun port libre trouvé")


def lancer(port: int) -> int:
    os.environ["ULYSSE_PORT"] = str(port)
    processus = subprocess.Popen(
        [sys.executable, "serve.py", "--port", str(port)],
        cwd=WEB_DIR,
        stdout=LOG.open("ab"),
        stderr=LOG.open("ab"),
        start_new_session=True,
    )
    for _ in range(10):
        time.sleep(1)
        try:
            with socket.create_connection(("127.0.0.1", port), 1):
                print(f"✓ Serveur disponible sur http://127.0.0.1:{port}/")
                return processus.pid
        except (ConnectionRefusedError, socket.timeout, OSError):
            pass
    raise SystemExit(f"✗ Serveur non disponible après 10s — voir {LOG}")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else trouver_port_libre()
    print(f"=== Ulysse serve.py port={port} ===", file=LOG.open("w"))
    print(f"Dossier web : {WEB_DIR}", file=LOG.open("a"))
    pid = lancer(port)
    print(f"PID : {pid} (log : {LOG})")