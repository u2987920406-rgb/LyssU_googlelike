import json, urllib.request, urllib.error, time

PROXY = "http://127.0.0.1:8645/v1/chat/completions"

def chat(model, history, attempt=1):
    body = {"model": model, "messages": history, "max_tokens": 600}
    req = urllib.request.Request(
        PROXY, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer ulysse"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            d = json.loads(r.read().decode())
        c = d["choices"][0]["message"].get("content")
        return c.strip() if c and c.strip() else None
    except urllib.error.HTTPError as e:
        if e.code == 403 and attempt < 4:
            time.sleep(5)
            return chat(model, history, attempt + 1)
        return f"<HTTP {e.code}>"

for model in ["poolside/laguna-s-2.1:free", "meta/muse-spark-1.2", "stepfun/step-3.7-flash:free"]:
    print(f"\n##### MODELE: {model}")
    h = [{"role": "user", "content": "Bonjour, dis en une phrase qui tu es."}]
    r1 = chat(model, h)
    print("TOUR 1 ->", r1)
    if r1 and not r1.startswith("<HTTP"):
        h.append({"role": "assistant", "content": r1})
        h.append({"role": "user", "content": "Quel est le contraire de 'grand' ?"})
        r2 = chat(model, h)
        print("TOUR 2 ->", r2)
        if r2 and not r2.startswith("<HTTP"):
            print("MULTI-TOUR OK avec", model)
            break
