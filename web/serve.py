#!/usr/bin/env python3
"""Serveur statique minimal pour la page Discussion Ulysse.
Sert discussion.html en local pour que le navigateur ait une origine http
propre (le fetch vers le proxy :8645 fonctionne alors sans souci CORS,
le proxy renvoyant de toute façon Access-Control-Allow-Origin: *).
"""
import http.server
import socketserver
import os

PORT = 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with ThreadingServer(("", PORT), Handler) as httpd:
        print(f"Ulysse Discussion : http://127.0.0.1:{PORT}/discussion.html")
        print("Ctrl+C pour arrêter.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nArrêt du serveur.")
