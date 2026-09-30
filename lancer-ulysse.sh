#!/usr/bin/env bash
# lancer-ulysse.sh — démarrer le serveur Ulysse sur un port libre
# Usage : bash lancer-ulysse.sh [PORT]
# Si PORT non donné, choisit un port libre automatiquement.

set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/web" && pwd)"
LOG=/tmp/ulysse-serve-$$.log

# Port par défaut
PORT="${1:-}"

# Si pas de port explicite, chercher un libre
if [ -z "$PORT" ]; then
  for CAND in 8095 8455 8456 8457 8675 8875 8096 8458; do
    if ! python3 -c "import socket,sys; s=socket.create_connection(('127.0.0.1',${CAND}),0.2); s.close()" 2>/dev/null; then
      PORT=$CAND
      break
    fi
  done
  if [ -z "$PORT" ]; then
    echo "ERREUR: aucun port libre trouvé (8095,8455,8456,8457,8675,8875,8096,8458)" >&2
    exit 1
  fi
fi

echo "=== Ulysse serve.py port=$PORT ===" | tee "$LOG"
echo "Dossier web : $WEB_DIR" | tee -a "$LOG"

cd "$WEB_DIR"
export ULYSSE_PORT="$PORT"
nohup python3 serve.py --port "$PORT" >> "$LOG" 2>&1 &
PID=$!
echo "PID : $PID (log : $LOG)" | tee -a "$LOG"

# Attente de la disponibilité
for i in $(seq 1 10); do
  if curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:${PORT}/" 2>/dev/null | grep -q 200; then
    echo "✓ Serveur disponible sur http://127.0.0.1:${PORT}/" | tee -a "$LOG"
    echo "$PORT" > /tmp/ulysse-port.txt
    exit 0
  fi
  sleep 1
done

echo "✗ Le serveur n'est pas encore disponible après 10s — voir $LOG" | tee -a "$LOG"
echo "$PORT" > /tmp/ulysse-port.txt 2>/dev/null || true
exit 1