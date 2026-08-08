# Audit des endpoints — Ulysse vs code source Hermès RÉEL

Méthode : lecture du code source installé
`%LOCALAPPDATA%\hermes\hermes-agent` (hermes_agent 0.20.0, install
éditable). Pas de supposition : chaque ligne ci-dessous renvoie à un fichier réel.

Sources de vérité :
- REST dashboard : `hermes_cli/web_server.py` + `hermes_cli/web_routers/*.py`
- RPC/events     : `tui_gateway/server.py`, `tui_gateway/methods_*.py`, `tui_gateway/ws.py`
- Webhooks       : `gateway/platforms/webhook.py`, `hermes_cli/webhook.py`

---

## 1. Verdict global

Le câblage deviné en Session B est **majoritairement JUSTE**. Les noms de
méthodes RPC, les noms d'events, les enveloppes JSON-RPC et les formes de
réponse REST correspondent au code réel.

**3 erreurs réelles** (dont 1 qui tue Cowork), et **2 faux positifs** du
rapport précédent qu'il ne faut PAS « corriger ».

---

## 2. CE QUI EST JUSTE (vérifié ligne par ligne)

### 2.1 Enveloppe WebSocket
`tui_gateway/ws.py:10` — « newline-delimited JSON-RPC in both directions ».
`tui_gateway/server.py:1566` `_event_frame()` :
```json
{"jsonrpc":"2.0","method":"event","params":{"type":…,"session_id":…,"payload":{…}}}
```
→ Exactement ce que `HermesLink._dispatch()` attend. **Correct.**

`gateway.ready` est bien émis immédiatement après l'accept
(`tui_gateway/ws.py:316-325`), payload `{skin, change_events:true}`.

### 2.2 Méthodes RPC — toutes existent
| Appel Ulysse | Source | Statut |
|---|---|---|
| `session.create` | `methods_session.py:14` | ✅ |
| `session.resume` | `methods_session.py:306` | ✅ |
| `session.interrupt` | registre `@method` | ✅ |
| `prompt.submit` | `methods_prompt.py:67` | ✅ |
| `approval.respond` | `methods_prompt.py:949` | ✅ |

**`session.create` retourne bien `session_id`** (`methods_session.py:127-131`) :
```python
return _ok(rid, {"session_id": sid, "stored_session_id": key,
                 "message_count": …, "messages": […], "info": {…}})
```
Params reconnus : `cwd`, `model`, `provider`, `cols`, `title`, `messages`,
`reasoning_effort`, `fast`, `profile`, `parent_session_id`, `source`,
`close_on_disconnect`.

**`session.resume`** (`methods_session.py:306`) prend `session_id` = l'identifiant
**persisté** (celui de `GET /api/sessions`) et retourne un **nouveau**
`session_id` vivant + `session_key` = la cible. Les deux noms ne se contredisent
pas : `stored_session_id` (create) et `session_key` (resume) désignent la même
notion persistée. Le rapport précédent les croyait contradictoires — ils ne le
sont pas.

**`prompt.submit`** : `{session_id, text}` (`methods_prompt.py:71-73`). ✅

### 2.3 Events — tous réels
`message.start` · `message.delta` · `message.complete` · `message.interim` ·
`reasoning.delta` · `thinking.delta` · `tool.start` · `tool.complete` ·
`status.update` · `session.info` · `approval.request` · `error` · `gateway.ready`

Payload `tool.start` (`server.py:5409`) : `{tool_id, name, context, args_text?}`.
Payload `tool.complete` (`server.py:5424`) : `{tool_id, name, args, inline_diff?}`.
→ Les clés utilisées par le Studio sont exactes.

Payload `approval.request` (`server.py:1826-1845`) : contient `choices`, valeurs
`["once","deny"]` / `["once","session","deny"]` / `["once","session","always","deny"]`
selon le cas. Le repli `["once","deny"]` d'Ulysse est correct.

### 2.4 REST — formes de réponse exactes
| Endpoint | Retour réel | Source |
|---|---|---|
| `GET /api/status` | `{version, gateway_running, gateway_state, gateway_platforms, active_sessions, auth_required, …}` | `web_server.py:3115+` |
| `GET /api/sessions` | `{sessions, total, limit, offset}` | `web_routers/sessions.py:156` |
| `GET /api/sessions/{id}/messages` | `{session_id, messages, pagination}` | `sessions.py:621` |
| `GET /api/files?path=` | `{path, parent, entries}` | `web_server.py:2377` |
| `GET /api/files/read?path=` | `{name, path, size, mime_type, data_url}` | `web_server.py:2410` |
| `GET /api/memory` | `{active, providers, builtin_files}` | `web_server.py:2834` |
| `GET /api/skills` | **une liste**, pas un objet | `web_routers/skills.py:395` |

Contraintes réelles à respecter :
- `/api/sessions` : `limit` borné `ge=0, le=100` → **51+ passe, 101 = 422**.
  `order` ∈ `{created, recent}` uniquement (`sessions.py:87`).
- `/api/sessions/{id}/messages` : `limit` clampé à 500 côté serveur.

---

## 3. LES 3 ERREURS RÉELLES

### E1 — CRITIQUE : le WebSocket est refusé (close 4403). Cowork mort.
`web_server.py:14690` `_ws_host_origin_reason()` :
```python
origin = ws.headers.get("origin", "")
if not origin: return None                       # absent → accepté
if not _is_accepted_host(parsed.netloc, bound_host):
    return f"origin_mismatch origin={origin} bound={bound_host}"
```
`serve.py:326-327` relaie l'`Origin` du navigateur (`http://127.0.0.1:8080`)
tel quel vers le dashboard lié à `127.0.0.1:9123` → `origin_mismatch` →
`_ws_request_is_allowed()` faux → `await ws.close(code=4403)` (`web_server.py:15934`).

La page affiche alors « surface Cowork désactivée côté serveur (4403) », ce qui
est un **diagnostic faux** : la surface est active (`_DASHBOARD_EMBEDDED_CHAT_ENABLED
= True`, `web_server.py:355`), c'est l'origine qui est rejetée.

Le rapport précédent classait ça en **M9 « moyen »**. C'est en réalité le bug
qui empêche tout Cowork de fonctionner.

**Correction** : `serve.py` doit réécrire `Origin` vers l'origine du backend
(ou le supprimer) sur le handshake WS. Le `Host` est déjà réécrit correctement.

À noter : le middleware HTTP ne vérifie que le `Host` (`web_server.py:539-555`),
pas l'`Origin` — donc `/api/*` en HTTP n'était pas touché. Seul le WS l'est.

### E2 — La liste des webhooks est demandée au mauvais serveur.
Le gateway `:8644` n'expose **que** `POST /webhooks/{route_name}`
(`gateway/platforms/webhook.py:291`) et `GET /health`. **Il n'y a pas de
`GET /webhooks`** → l'onglet Webhooks reçoit un 404.

La liste vit sur le **dashboard** : `GET /api/webhooks` (`web_server.py:12486`)
```json
{"enabled": bool, "base_url": "http://localhost:8644",
 "subscriptions": [{"name","description","events","deliver","prompt","url",
                    "secret_set","enabled","created_at"}]}
```
→ L'identifiant est **`name`**, sans ambiguïté. La cascade
`w.id || w.name || w.endpoint` doit disparaître.

### E3 — Le déclenchement de webhook ne peut pas partir du navigateur.
`webhook.py:653-674` : la signature HMAC est validée **avant tout**, et un
secret manquant fait échouer fermé (403). Sans signature → **401 Invalid signature**.

Formats acceptés (`webhook.py:1086-1135`) :
- `X-Webhook-Signature-V2` = HMAC-SHA256(secret, `"<timestamp>.<body>"`) hex,
  avec `X-Webhook-Timestamp` (fenêtre ±300 s) ← **à utiliser**
- `X-Webhook-Signature` = HMAC-SHA256(secret, body) hex (V1, déprécié)
- styles GitHub / Svix

Or l'API masque le secret (`secret_set: bool` seulement) — le navigateur ne
peut **pas** signer, et il ne le doit pas.

**Correction** : `serve.py` signe côté serveur. Il lit le secret dans
`$HERMES_HOME/webhook_subscriptions.json` (déjà présent, route `resume-lundi`),
calcule la V2 et POSTe un corps JSON. Le secret ne quitte jamais le serveur
local. C'est du câblage, pas une réinvention.

---

## 4. LES 2 FAUX POSITIFS DU RAPPORT PRÉCÉDENT

### C5 « `session.create` : champ de retour non validé » → NON.
Le champ s'appelle bien `session_id`. Une garde défensive reste utile pour
échouer proprement, mais il n'y a pas de bug ni de « fuite de sessions ».

### C6 « `approval.respond` n'identifie pas la demande » → NON.
`methods_prompt.py:949-966` → `resolve_gateway_approval(session["session_key"],
choice, resolve_all=params.get("all"))`, et `tools/approval.py:2506-2523` résout
la file **FIFO par session** :
```python
targets = [queue.pop(0)]        # la plus ancienne
```
Il n'existe **aucun** `request_id` dans le protocole. Le payload
`{session_id, choice}` est exactement le contrat. Ajouter un `request_id`
aurait été inventer une API inexistante.

Paramètre supplémentaire réel et utile : `all: true` (= « approuver tout »).

---

## 5. RÉSERVE À CONNAÎTRE (pas un bug)

`tool.start` / `tool.complete` ne sont émis que si
`_tool_progress_enabled(sid)` est vrai (`server.py:5408`, `5466`) — sinon le
Studio ne verra aucun outil alors que la session travaille. Réglage Hermès :
`display.tool_progress`, modifiable par le RPC `config.set` (méthode réelle).
Le Studio doit donc soit le poser au démarrage, soit l'exposer comme un
interrupteur.

---

## 5 bis. Un accord « toujours » se retire-t-il depuis Ulysse ? — OUI

Question posée par `PASSE-DESIGN-ACCORD.md` : la passe promet « Vous pourrez
revenir sur "toujours" dans Réglages · Sécurité et accords. » Vérifié.

**Où va un `always`** — `approval.py:2698` `save_permanent_allowlist()` écrit la
clé racine **`command_allowlist`** dans `~/.hermes/config.yaml`. Ce n'est pas
la même chose que `approvals.deny` (une liste de blocages) ni que
`approvals.mode` (global) : c'est une liste de motifs de commandes.

| | |
|---|---|
| **Lire la liste** | `GET /api/config` (`web_server.py:6128`) renvoie toute la config sauf les clés en `_`. `command_allowlist` en fait partie. |
| **En retirer une** | `PUT /api/config` (`web_server.py:6915`) fusionne en profondeur, et `_deep_merge` (`config.py:2435`) **remplace** toute valeur qui n'est pas un dictionnaire — donc une liste. Envoyer la liste filtrée retire l'entrée. |
| **Filtrage du corps ?** | non. `_denormalize_config_from_web` (`web_server.py:6838`) ne touche qu'à `model`, `model_context_length` et `_model_meta`. |
| **Portée gérée ?** | non. `command_allowlist` est une clé racine ordinaire, sans traitement de scope. |

**Donc la phrase peut rester** — à une condition : que l'écran montre vraiment
la liste. Promettre un lieu où revenir sans l'écrire ferait exactement le tort
qu'on cherchait à éviter.

> ⚠ Une écriture ici touche `~/.hermes/config.yaml`, **qui EST la politique de
> sécurité** (`approval.py:279`). Un retrait est sans danger — il ne fait que
> réduire un pouvoir. Une addition depuis la page ne doit pas exister : c'est
> à Hermès de demander, et à l'accord de répondre.

---

## 6. Endpoints Hermès disponibles et NON encore câblés

Utiles pour les panneaux de la maquette qui n'ont pas encore de câblage :

| Panneau maquette | Endpoint réel disponible |
|---|---|
| Automatisations | `GET/POST /api/cron/jobs`, `/api/cron/jobs/{id}/pause|resume|trigger|runs` |
| Projets | RPC `projects.tree`, `projects.discover_repos`, `projects.project_sessions` |
| Vestiaire | RPC `agents.list`, `tools.list`, `toolsets.list`, `skills.manage` |
| Réglages | `GET/PUT /api/config`, `/api/config/raw`, `/api/model/options`, `/api/model/set` |
| Terminal CLI | **WebSocket** `/api/pty` (`@app.websocket`, web_server.py:15736), RPC `shell.exec`, `cli.exec` |
| Livrables | `GET /api/git/review/diff`, `/api/git/status`, `/api/files` |
| Permissions (4 sous-modes) | RPC `config.set` sur `approvals.mode` (`off`/`smart`/`manual`) |
| Vocal | `POST /api/audio/transcribe`, `/api/audio/speak`, RPC `voice.tts` |
| MCP | `GET/POST /api/mcp/servers`, `/api/mcp/catalog` |
| Canaux distants | `GET /api/messaging/platforms`, onboarding Telegram/WhatsApp |

Rien à inventer : tout existe déjà côté Hermès.
