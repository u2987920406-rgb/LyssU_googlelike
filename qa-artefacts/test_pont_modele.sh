#!/bin/bash
# Test du pont modèle hors boucle — 2 tailles : santé puis charge.
# La clé est lue dans .env et injectée dans le header, JAMAIS affichée.
set -u
BASE=$(hermes config get model.base_url 2>/dev/null | tail -1)
MODEL=$(hermes config get model.default 2>/dev/null | tail -1)
KEY=$(grep '^XIAOMI_API_KEY=' "$HOME/.hermes/.env" 2>/dev/null | cut -d= -f2)
echo "base=$BASE model=$MODEL cle_presente=$([ -n "$KEY" ] && echo oui || echo NON)"

contenu=$(python3 -c "import json,sys; print(json.dumps('Reponds par OK. ' * int(sys.argv[1])))" "$2")
echo "--- test $1 ---"
curl -s -o /tmp/pont-$1.json -w 'http=%{http_code} total=%{time_total}s\n' \
  --max-time 100 "$BASE/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":$contenu}],\"max_tokens\":20}"
head -c 220 /tmp/pont-$1.json; echo
