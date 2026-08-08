# Rapport de code review — Ulysse (mis à jour le 2026-08-08)

Ce fichier remplace la revue du 2026-08-08 matin. Cette version-ci n'est plus
une lecture : **tout ce qui est affirmé ici a été vérifié contre le code
source Hermès installé, puis testé.**

- Source de vérité Hermès : `%LOCALAPPDATA%\hermes\hermes-agent`
  (hermes_agent 0.20.0). Détail des vérifications : `AUDIT-ENDPOINTS-REEL.md`.
- Tests : `test_serve.py` (43/43) · `test_personas.py` (100/100) ·
  `test_page.js` (54/54).

---

## 1. Ce que la revue précédente avait mal jugé

La revue de lecture avait produit **2 faux positifs** et **sous-estimé le bug
le plus grave**. C'est la raison pour laquelle on est allés lire Hermès.

### C5 « `session.create` : champ de retour non validé » → FAUX POSITIF
`methods_session.py:127` renvoie bien `session_id`. Il n'y avait ni fuite de
sessions, ni perte de mémoire. Une garde a quand même été ajoutée, mais pour
échouer franchement, pas pour corriger un bug.

### C6 « `approval.respond` n'identifie pas la demande » → FAUX POSITIF
`methods_prompt.py:949` → `resolve_gateway_approval(session_key, choice)`, et
`tools/approval.py:2506` résout la file **FIFO par session**. Le protocole ne
contient **aucun** `request_id`. Ajouter celui que la revue réclamait aurait
été inventer une API inexistante — le contraire de la loi du projet.

### M9 « Origin relayé tel quel » — classé « moyen ». C'était le bug bloquant.
`web_server.py:14690` : le dashboard vérifie l'`Origin` du handshake
WebSocket et ferme en **4403** s'il ne désigne pas son hôte. `serve.py`
relayait `http://127.0.0.1:8080` → **tout Cowork était mort**, avec en plus un
message d'erreur qui accusait la mauvaise cause (« surface désactivée »).

---

## 2. Corrigé et vérifié

### Bugs (rapport précédent)
| | Ce qui cassait | État |
|---|---|---|
| C1 | hash inconnu ⇒ écran entièrement gris | corrigé — repli sur la 1re destination, casse tolérée |
| C2 | état « open » suspendu à `gateway.ready` | corrigé — `open` dès `ws.onopen` |
| C3 | `sessionId` survivait à la mort du WS | corrigé — abandonné, et l'utilisateur est prévenu |
| C4 | `running` bloqué ⇒ saisie masquée à vie | corrigé — chien de garde 3 min réarmé à chaque événement |
| C5 | (faux positif) | garde défensive ajoutée |
| C6 | (faux positif) | boîte vidée **après** l'acquittement, pas avant |
| C7 | aperçu d'un fichier de 200 Mo ⇒ onglet figé | corrigé — refus au-delà de 2 Mo, avec explication |
| C8 | `backend=BACKEND` gelé à `None` | corrigé — argument obligatoire |
| M1 | rôle masqué dès qu'une session existait | corrigé — parenthésé |
| M2 | dates ISO ⇒ « — » | corrigé — nombre **et** chaîne ISO acceptés |
| M3 | un `/api/status` vert effaçait les alertes de config | corrigé — alertes de config persistantes |
| M5 | data URL non-base64 cassée | corrigé — `;base64` testé |
| M6 | réponse non-JSON ⇒ `SyntaxError` hors `ApiError` | corrigé — texte lu puis tenté en JSON |
| M7 | préambule de rôle affiché comme message utilisateur | corrigé — envoyé, pas affiché |
| M8 | query string ⇒ mauvais aiguillage | corrigé — aiguillage sur le chemin **normalisé** |
| M10 | `Date`/`Server` dupliqués | corrigé — `send_response_only` |
| M11 | retour webhook affiché dans un autre onglet | corrigé — affiché sur place |
| M12 | `conv.approval` jamais purgé | corrigé — purgé sur fin de tour |
| M13 | `disc-send.disabled` disputé entre deux modes | corrigé — un drapeau par mode |
| M14 | trois ports différents dans trois fichiers | corrigé — la page suit `location.origin` |

M4 (repeint intégral du DOM) : traité par la refonte — le fil est repeint
une fois par frame, pas une fois par delta.

### Sécurité
| | Faille | Correction |
|---|---|---|
| S1 | écoute sur `0.0.0.0` : tout le LAN avait le disque et l'exécution | `127.0.0.1` en dur |
| S2 | CORS reflétant l'origine du demandeur | aucun en-tête CORS ; `Origin` vérifié, `OPTIONS` refusé |
| S3 | WebSocket sans vérification d'origine (canal RPC ouvert à toute page) | `Origin` vérifié avant relais |
| S4 | pas de contrôle `Host` (DNS rebinding) | liste blanche de `Host` |
| S5 | XSS via `showAlert()` (texte backend en `innerHTML`) | texte externe en nœud texte ; la page produit refuse `innerHTML` pour les données |
| S6 | `ulysse-config.js` servi avec le jeton | expurgé à la volée |
| S7 | jeton dashboard fuité vers le gateway webhook | en-têtes d'auth du client supprimés **inconditionnellement** |
| S8 | `?token=` du client respecté sur le WS | écrasé systématiquement |
| S9 | jeton et clé proxy présents dans la page | **la page ne détient plus aucun secret** |

### Deux failles que la revue de lecture n'avait pas vues
Trouvées par les tests de persona (P7), pas par relecture.

- **S10 — le dossier `web/` était intégralement publié.** `GET /serve.py`
  rendait le code du serveur (où `SESSION_TOKEN` peut être renseigné), et
  n'importe quel fichier déposé là partait en clair, y compris un dossier
  caché contenant des secrets HMAC.
  → Liste **blanche** d'extensions ; segments cachés refusés.

- **S11 — l'expurgation de la config était contournable.** Elle comparait un
  chemin exact ; `GET /../ulysse-config.js` ou `/%2e%2e/ulysse-config.js` ne
  correspondait pas et retombait sur le service statique, qui **normalise** le
  chemin et servait le fichier **brut**, jeton compris.
  → Le chemin est normalisé **avant** tout contrôle, et c'est ce chemin-là
  qui est servi.

Leçon : un contrôle posé sur une forme d'URL, et un service qui en utilise une
autre, se contourne toujours en changeant l'écriture.

---

## 3. Endpoints — les 3 erreurs réelles

Détail complet dans `AUDIT-ENDPOINTS-REEL.md`.

**E1 — `Origin` du WebSocket** (voir §1). Corrigé : `serve.py` réécrit `Origin`
et `Host` vers le backend.

**E2 — la liste des webhooks était demandée au gateway.** Le gateway `:8644`
n'expose que `POST /webhooks/{nom}` (`webhook.py:291`) : il n'y a **pas** de
`GET /webhooks` → 404. La liste vit sur le dashboard : `GET /api/webhooks`
(`web_server.py:12486`), et l'identifiant est `name`, sans ambiguïté.

**E3 — le déclenchement ne pouvait pas partir du navigateur.** Le gateway
valide un HMAC-SHA256 avant tout (`webhook.py:653`) et l'API masque le secret
(`secret_set` seul). → `serve.py` signe en V2 côté serveur, en lisant le
secret dans le Hermes Home. Le secret ne descend jamais dans la page.

**Bonne nouvelle** : tout le reste était juste. Noms de méthodes RPC, noms
d'événements, enveloppe JSON-RPC, clés de payload, formes REST — vérifiés un
par un contre le code, ils correspondent.

**Réserve connue** : `tool.start`/`tool.complete` ne sont émis que si
`display.tool_progress` est actif (`server.py:5408`). Le panneau Plan le dit
explicitement plutôt que de laisser croire que l'agent ne fait rien.

---

## 4. Ce qui a été livré

**Le produit** — la maquette est le produit fini, donc elle est la source :
- `ulysse.css` — extrait **verbatim** du `<style>` de la maquette
  (83 497 octets, identique au caractère près, vérifié par diff)
- `ulysse-icons.js` — table `I` + `svg()`, verbatim (41 icônes nommées)
- `ulysse-view.js` — la **machinerie de rendu** de la maquette rendue
  générique : le schéma (rangement par couches, coudes arrondis, caméra),
  la cloche et les bulles, le bandeau du bas, les feuilles, les rangées de
  réglages, la fenêtre du terminal
- `ulysse.html` + `ulysse-app.js` — la coquille et les 10 panneaux, reliés
  aux endpoints vérifiés
- `ulysse-core.js` — la couche de liaison, partagée et testable

### Fidélité à la maquette — mesurée, pas affirmée

| | |
|---|---|
| CSS | **identique au caractère près** |
| Structures d'écran reprises | **56 / 58** |
| Classes de la maquette employées | **54 / 54** |
| Règles CSS de moi qui recouvrent la sienne | **0** (toutes préfixées `u-`) |

**Le point important :** la maquette est **scriptée**. Ses six étapes, ses
douze agents, ses trois automatisations et ses trois notifications sont des
jeux d'essai écrits en dur. Copier ces tableaux aurait donné une maquette qui
ment. On a donc repris le **rendu** et retiré les **données** : chaque moteur
reçoit ce qu'il doit dessiner et ignore d'où ça vient.

Correspondances établies :

| Élément de la maquette | Alimenté par |
|---|---|
| Schéma du Plan (6 étapes en dur) | la suite **réelle** des outils appelés (`tool.start`/`tool.complete`) |
| Couleurs d'équipe | familles d'outils : lecture, écriture, exécution, réseau |
| Cloche + bulle « à décider » | `approval.request` — l'agent est bloqué, la bulle ne part pas seule |
| Vestiaire (12 agents fictifs) | les 6 rôles + les compétences réelles de `/api/skills` |
| Automatisations (3 tâches) | `/api/cron/jobs` + `/api/webhooks` |
| Projets (5 projets) | les dossiers de travail réels des sessions |
| Travaux | `/api/sessions` |
| Barre de dette (user.md fictif) | les fichiers de mémoire réellement absents |
| Dépenses | `/api/analytics/usage` |

**Deux écrans non repris, et c'est délibéré :** `#first` (premier lancement)
et `#lvl1` (accueil) demandent le fournisseur et la clé — c'est le travail de
l'installateur, que `lancer_ulysse.bat` fait déjà. Ils reviendront avec lui.

**Une adaptation nécessaire :** la maquette interpole ses données directement
dans du `innerHTML` — elle le peut, ses données c'est elle qui les écrit. Ici
elles viennent du backend : un titre de session contenant `<img onerror=…>`
s'exécuterait dans la page. Tout ce qui vient de l'extérieur passe par `esc()`.

**Le serveur** — `serve.py` : statique + relais authentifié + signature des
webhooks + relais du chat pur. Il détient les secrets ; la page, aucun.

**Les bancs d'essai** — `session-b.html` et `discussion.html` restent, corrigés :
ils servent à éprouver un endpoint, pas à être le produit.

**Les tests** — `test_serve.py`, `test_personas.py`, `test_page.js`, et
`faux_hermes.py` qui rejoue le protocole réel **avec les mêmes contrôles**
(jeton, Host, Origin du handshake, HMAC). Ils ne se valident pas eux-mêmes :
un test qui triche est refusé par le faux serveur.

---

## 5. Ce qui reste honnêtement non relié

Affiché comme tel dans l'interface, jamais meublé avec du faux :

- **Terminal intégré** — `POST /api/pty` existe ; il faut un émulateur de
  terminal côté page. Le panneau donne les commandes et les copie.
- **Création de projet / coffre** — les 6 fichiers standard se posent encore à
  la main. `projects.tree` existe et servira de base.
- **Écriture des fichiers de profil** — la lecture est faite ;
  `/api/fs/write-text` existe, non branché tant que les garde-fous d'écriture
  ne sont pas décidés.
- **Vocal STT/TTS** — `/api/audio/transcribe` et `/api/audio/speak` existent
  et sont atteignables ; l'UI de dictée reste à faire.
- **Cerveau par rôle** — `/api/model/options` et `/api/model/set` existent ;
  reste à décider si un rôle porte son modèle ou hérite du profil.

---

## 6. Comment rejouer les vérifications

```
cd web
python test_serve.py            # 43 — frontières et relais
python test_personas.py         # 100 — 10 personas x 2 scénarios
npm install jsdom --no-save && node test_page.js   # 62 — la page dans un DOM réel
```

Les trois montent leur propre pile et n'ont besoin d'aucun backend Hermès.
`test_personas.py` refuse de démarrer si un banc précédent occupe encore les
ports — sous Windows, un nouveau serveur peut se lier sans erreur pendant que
l'ancien continue de répondre, et les tests mesureraient alors le mauvais
serveur. (C'est arrivé pendant cette session.)
