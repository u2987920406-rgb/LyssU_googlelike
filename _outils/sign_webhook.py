import hmac, hashlib, json, urllib.request, sys

secret = "ulysse-test-secret"
url = "http://127.0.0.1:8644/webhooks/resume-lundi"
body = json.dumps({"sujet": "intelligence artificielle", "user": "Sophie"}).encode()
sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", "X-Signature": sig}, method="POST")
try:
    r = urllib.request.urlopen(req, timeout=10)
    print("POST webhook HTTP", r.status)
except urllib.error.HTTPError as e:
    print("POST webhook HTTP", e.code, e.read()[:200])
