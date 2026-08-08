import json, urllib.request

body = {
    "model": "tencent/hy3:free",
    "messages": [{"role": "user", "content": "Réponds en français, en une phrase: comment t'appelles-tu?"}],
    "max_tokens": 300,
}
req = urllib.request.Request(
    "http://127.0.0.1:8645/v1/chat/completions",
    data=json.dumps(body).encode(),
    headers={"Content-Type": "application/json", "Authorization": "Bearer any"},
)
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read().decode())
    msg = d["choices"][0]["message"]
    c = msg.get("content")
    print("CONTENT:", repr(c) if c else "VIDE")
    print("finish:", d["choices"][0]["finish_reason"])
except Exception as e:
    print("ERR:", e)
