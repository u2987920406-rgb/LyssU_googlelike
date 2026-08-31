"""Essai manuel d'un webhook : signe le corps en V2, comme le gateway l'exige.

Le gateway (gateway/platforms/webhook.py) calcule HMAC-SHA256(secret,
b"<timestamp>.<body>") et lit X-Webhook-Signature-V2 + X-Webhook-Timestamp
(rejeu refuse au-dela de 300 s). L'ancien en-tete X-Signature (V1 morte) ne
matche aucune branche : 401 garanti — c'est ce que cet outil envoyait.

    python3 sign_webhook.py [url] [secret]
"""
import hashlib, hmac, json, sys, time, urllib.request, urllib.error

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8644/webhooks/resume-lundi"
secret = sys.argv[2] if len(sys.argv) > 2 else "ulysse-test-secret"
body = json.dumps({"sujet": "intelligence artificielle", "user": "Sophie"}).encode()
ts = str(int(time.time()))
sig = hmac.new(secret.encode(), ts.encode("ascii") + b"." + body, hashlib.sha256).hexdigest()
req = urllib.request.Request(url, data=body, headers={
    "Content-Type": "application/json",
    "X-Webhook-Timestamp": ts,
    "X-Webhook-Signature-V2": sig,
}, method="POST")
try:
    r = urllib.request.urlopen(req, timeout=10)
    print("POST webhook HTTP", r.status)
    sys.exit(0 if r.status == 200 else 1)
except urllib.error.HTTPError as e:
    print("POST webhook HTTP", e.code, e.read()[:200])
    sys.exit(1)
