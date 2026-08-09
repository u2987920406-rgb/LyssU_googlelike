# Ulysse — REPRISE

## LA BALLE — qui l'a, et ce qu'il en fait

**La balle est à kuchu, dans Claude Cowork, pour le DESIGN.**

    kuchu (Cowork)  ──── design ────>  retour ici  ──── code ────>  kuchu
         ▲                                                              │
         └──────────────────────────────────────────────────────────────┘

- **Ce que kuchu fait maintenant** : les passes de design dans Claude Cowork.
  Document à emmener : `web/CONTRAT-INTERFACE.md` — il dit ce qui est libre
  (tout le visuel) et ce qui porte la logique (88 `id`, 25 `data-*`, les
  cinq classes d'état). Décidé le 2026-08-08 : le design en dialogue ici prenait
  trop de temps.
- **Ce qu'on fait au retour** : `cd web && node test_page.js`. 313 vérifications
  sur la vraie page dans un DOM réel. **S'il passe au rouge, ce n'est pas le
  test qui a tort** — un `id` ou un `data-*` du contrat a disparu, et le
  contrat dit lequel. Ne jamais adapter `ulysse-core.js` pour faire passer un
  changement de design.
- **Les serveurs et les tests : la règle exacte.** Question de kuchu,
  2026-08-09. La réponse tient en deux temps, et le premier jet écrit ici
  était trop large.

  **Pour lancer les suites : ne rien fermer.** `test_serve.py` et
  `test_personas.py` montent leur propre pile sur des ports **décalés de
  +10000** (18080 · 19123 · 18644 · 18645) — aucune collision possible avec la
  pile réelle (8080 · 8644 · 9123). `test_page.js` ne touche pas au réseau. Et
  `test_reel.py` **exige** que la pile tourne : l'éteindre le rend aveugle.

  **⚠ Mais pour RELANCER `serve.py` : fermer d'abord.** Mesuré le 2026-08-09 :
  sous Windows, `allow_reuse_address` laisse un second serveur se lier au même
  port **sans erreur** — et c'est le **premier** qui continue de répondre (six
  requêtes, six réponses de l'ancien). Relancer sans fermer ne fait donc rien :
  la bannière s'affiche, et l'ancien code répond. C'est arrivé deux fois.
  Et comme un serveur garde le code qu'il avait au démarrage, `test_reel.py`
  mesurerait alors un `serve.py` périmé.

  **On ne compte pas là-dessus** : `serve.py` sonde le port avant de se lier
  et **refuse de démarrer** en disant quoi faire. Un test l'exige.

- **Ce qu'on ne touche pas côté design** : `ulysse-core.js` (câblage vérifié
  contre le code source d'Hermès) et `serve.py` (secrets + frontières).
- **`ulysse.css` n'est plus purement verbatim depuis le 2026-08-09.** Les
  écarts voulus sont au registre `web/ECARTS-MAQUETTE.md`, avec un commentaire
  à chaque endroit du CSS et une vérification qui les tient. La règle :
  **la maquette est la source pour les décisions, pas pour les coquilles.**
- **Après toute retouche de `ulysse.css` : `python resync_apercus.py`.** Les
  dix aperçus RECOPIENT la feuille (ils s'ouvrent seuls, sans serveur) — donc
  dix occasions de diverger en silence. Le test le voit, le script répare.

---

## Dernier jalon
2026-08-09 — **JALON 4, committé** (accord de kuchu, et le dépôt a été
déplacé sur le Bureau à cette occasion) : audit réel des endpoints, correction
des bugs et des failles, produit posé depuis la maquette, premier lancement,
dictée, terminal intégré, 4 suites de tests dont une contre le VRAI Hermès.
(JALON 3 = Session B ; JALON 2 = Session A ; JALON 1 = fusion profil.)

## Prochaine étape

`relais.md` (racine du projet) dit qui a la balle et quoi faire dans l'heure.
Au 2026-08-08 au soir : elle est **côté Cowork**. Les six réparations ET les
cinq passes de design sont appliquées.

1. kuchu revient de Cowork → `node test_page.js` (**313** vérifications ;
   les quatre suites font **563** : 313 page · 99 serveur · 51 réel · 100 personas)
2. ~~Appliquer les cinq passes~~ — **FAIT le 2026-08-08** : la passe
   d'accord, les trois décisions, et le style des cinq panneaux.
   La dette des Repères est éteinte (43 signes sur 43).
3. ~~Premier lancement, dictée, terminal intégré~~ — **FAIT le 2026-08-09.**
   - `#first` : marqueur côté serveur, hors du dossier servi
   - Dictée : `/api/audio/transcribe`, le texte atterrit dans le champ
   - **Terminal** : `hermes --tui` tourne pour de vrai dans Ulysse. Le pont
     est une **WebSocket** `/api/pty` (`@app.websocket`, web_server.py:15736)
     — **pas** un POST, comme ce document l'a longtemps écrit. Le rendu passe
     par `xterm.js` **emprunté** à l'installation d'Hermès (`EMPRUNTS` dans
     `serve.py` : liste fermée, aucun segment ne vient du client) plutôt que
     recopié dans `web/`.
4. ~~Écriture des fichiers de profil~~ — **FAIT le 2026-08-09.** Elle ne passe
   **pas** par `/api/fs/write-text` : quatre routes locales dans `serve.py`
   (`POST /ulysse/ecrire` · `GET /ulysse/versions` · `POST /ulysse/restaurer` ·
   `POST /ulysse/console`). La copie datée a lieu **avant** l'écriture, et si
   elle échoue **rien n'est écrit** — sinon l'écran promettrait un retour en
   arrière qui n'existe pas. `SOUL.md` est refusé côté serveur.
   ⚠ Ce refus ne vaut que pour ce qui passe par Ulysse : **Hermès n'a aucune
   frontière d'écriture par chemin contre l'agent** (`agent/file_safety.py` se
   dit lui-même « not a security boundary »).
5. **Projets** — dessinés (`web/PASSE-DESIGN-PROJETS.md` v2) et **branchés le
   2026-08-09** : la liste vient de `projects.tree`, et « ranger un dossier en
   projet » appelle `projects.create`. L'API d'Hermès est
   complète : `projects.create/list/get/update/add_folder/remove_folder/
   set_primary/archive/delete/set_active/for_cwd` (`tui_gateway/server.py`).
   Trois faits vérifiés contre Hermès en marche, et qui contraignent l'écran :
   - **`create` n'écrit rien sur le disque.** Il désigne un dossier existant,
     il n'en fabrique pas.
   - **La mémoire n'est PAS cloisonnée par projet** — un seul `MEMORY.md` et
     un seul `USER.md` dans `<hermes_home>/memories`
     (`agent/learning_mutations.py:30`). Ce qu'un projet apprend va dans le
     même fichier que tout le reste.
   - **`archive` est réversible et n'expire jamais** : un drapeau, posé à un
     seul endroit, retiré à un seul autre. Aucune purge, aucune échéance.
   ⚠ `projects.tree` mêle **trois espèces** : le vrai projet, le dossier
   **déduit** (`isAuto`, dont l'id est le chemin) et `__no_project__`
   (`isNoProject`). Les deux dernières n'ont ni nom propre, ni couleur, ni
   identifiant à soi. **Trois apparences, pas une étiquette** : le déduit n'a
   qu'« en faire un projet », et « Home » n'est pas une carte mais une ligne
   en pied de liste.
   ⚠ **`projects.create` n'a jamais été appelé pour de vrai** : le lancer
   créerait un projet dans la liste de kuchu. Vérifié en jsdom seulement, et
   c'est dit plutôt qu'oublié.
   ✅ **`projects.create` est prouvé contre le vrai Hermès** : kuchu a cliqué
   le bouton le 2026-08-09, le projet « Desktop » existe. Effet de bord à
   connaître : un projet posé sur un dossier PARENT absorbe ses sous-dossiers
   (`project_for_path` réclame tout le sous-arbre) — « Projet Ulysse » et
   « freeB » ont disparu de l'arbre en tant que dossiers déduits.
   Restent à brancher : l'explorateur de dossiers (qui débloquerait « ranger »
   depuis la barre) et `projects.archive`.
6. **Où le fil travaille** — branché le 2026-08-09
   (`web/PASSE-DESIGN-LIEU.md`). Une gélule dans la barre de Discuter.
   **Le lieu vient de la SESSION** : `conv.info` porte `cwd` ET `project`.
   Une session ne peut pas se tromper sur elle-même. Seule la couleur vient
   d'ailleurs (`projects.list`, lu une fois).
   ⚠ **Ne pas appeler `projects.for_cwd` pour ça** : pour un dossier
   inexistant — ou sans `cwd` — il remplace silencieusement la demande par le
   dossier courant du serveur et répond sur celui-là. Le piège est épinglé
   dans `test_reel.py`.
   ⚠ **En mode Chat, pas de gélule** : ce mode n'ouvre aucune session, donc
   « dossier en attente » annoncerait un dossier qui n'arrive jamais.
   ⚠ **`CFG.SESSION_CWD` n'est pas `conv.info.cwd`** : le premier est le
   dossier de la PROCHAINE session, le second celui de la session EN COURS.
   « Travailler ici » pendant qu'un fil est ouvert ne change que le premier.
   Cet écart est un état à part entière, montré en ambre.

---

## La maquette de référence : la 33, et rien d'autre

Cowork signalait le 2026-08-08 que kuchu avait mentionné **une maquette d'une
version ultérieure à la 33**, introuvable depuis là-bas. Cherchée ici :

| Où | Résultat |
|---|---|
| `Desktop\Projet Ulysse\` | `maquette-ulysse-google-33.html` — seule |
| Tout le profil utilisateur | aucun autre fichier de maquette |
| Le Hermes Home (`…\hermes\`) | aucune maquette du tout |
| L'historique git du dépôt | aucun fichier de maquette ajouté ni supprimé |
| Les documents du projet | tous nomment la **33**, aucun n'en cite d'autre |

### Repris le 2026-08-09, autrement — et cette fois on sait d'où venait le doute

Les recherches précédentes cherchaient **par nom de fichier**. Une maquette
renommée y serait restée invisible. Reprise **par contenu** : tout `.html` de
plus de 40 Ko du profil, filtré sur une signature interne de la maquette
(`pDiscuter`).

| Où | Résultat |
|---|---|
| Recherche par **contenu**, tout le profil | **un seul** fichier de maquette : la 33 |
| `Claude\Artifacts\` | aucun fichier ne porte la signature |
| La corbeille | aucun élément nommé *ulysse* ou *maquette* |
| Le Hermes Home | toujours rien (et il n'a plus de dépôt depuis le 2026-08-09) |

**D'où venait le souvenir.** Les raccourcis récents de Windows gardent la
trace d'une arborescence antérieure :

    05/08 18:51   Desktop\Ulysse\
    07/08 00:34   Desktop\Ulysse\archives\maquettes     ← ouvert ce jour-là
    07/08 08:48   Desktop\Ulysse\FICHE-ULYSSE.md
    08/08 21:39   Desktop\Projet Ulysse\                ← l'arborescence actuelle

`Desktop\Ulysse\` a existé du 5 au 7 août, avec un dossier
`archives\maquettes` — **il n'existe plus**. C'est très probablement lui que
kuchu avait en tête. Son nom dit *archives* : il tenait les versions
**antérieures**, ce qui est cohérent avec la 33 comme dernière.

**La 33 est la référence retenue. La question est close.** Tout ce qui a été
produit s'appuie sur elle — `ulysse.css` en porte la mention en tête, et les
neuf aperçus la recopient.

> Si une version postérieure existe ailleurs (autre poste, pièce jointe,
> téléchargement effacé), la poser dans `Desktop\Projet Ulysse\` suffit : elle
> sera diffée contre la 33, et l'écart dit dans `ulysse.css`, dans le contrat
> et dans les passes concernées. Mais **on ne rouvre plus la question sans un
> fichier en main** — un doute que personne ne tranche revient tous les trois
> mois, et celui-là a déjà coûté trois recherches.

---

## ~~Deux copies de `web/`~~ — tranché le 2026-08-09

Le dépôt vivait dans le Hermes Home, figé au jalon 3, pendant que le vrai
travail avançait sur le Bureau. C'était la « copie parallèle » que la loi du
projet interdit.

**Le `.git` a été déplacé sur le Bureau**, avec l'accord de kuchu. Les trois
jalons ont suivi — l'historique est intact. Le Bureau est désormais le dépôt,
et il n'y a plus qu'un seul arbre de travail.

Ce qui reste dans `…\hermes\Projets\Ulysse\` : des fichiers sans dépôt,
supprimables quand kuchu voudra. Six d'entre eux (`ADM.md`, `BRIEF.md`,
`done.md`, `plan.md`, `reprise.py`, `.hermes.md`) n'existaient que là ; ils
ont été rapatriés AVANT le déplacement, sans quoi le commit aurait enregistré
leur suppression.

---

## État vérifié en réel (2026-08-08, pile lancée)

| | |
|---|---|
| dashboard `127.0.0.1:9123` | OK — `auth_required=false` dans cette config |
| gateway `0.0.0.0:8644` | OK — plateforme webhook connectée |
| serve.py `127.0.0.1:8080` | OK — **loopback seulement** (c'était `0.0.0.0`) |
| WebSocket `/api/ws` | **101 accepté** — Cowork fonctionne |
| Un vrai tour d'agent | « Bonjour, comment puis-je vous aider aujourd'hui ? » |
| Webhook signé | **HTTP 202 accepted** — le HMAC de serve.py est valide |
| `/api/skills` | 99 compétences réelles |

Le proxy 8645 n'était pas lancé pendant le test — le mode Discussion n'a donc
pas été éprouvé de bout en bout contre un vrai modèle.

---

## Ce qui a été résolu (session du 2026-08-08)

**Le bug qui tuait Cowork** — `serve.py` relayait l'`Origin` du navigateur ; le
dashboard vérifie l'origine du handshake WS (`web_server.py:14690`) et fermait
en 4403. La revue précédente le classait « moyen ». Corrigé : l'`Origin` et le
`Host` sont réécrits vers le backend.

**Deux faux positifs de la revue précédente**, à ne pas « corriger » :
- `session.create` renvoie bien `session_id` (vérifié en direct)
- `approval.respond` ne porte **aucun** `request_id` : la file est résolue en
  FIFO par session (`tools/approval.py:2506`). En inventer un = inventer une
  API qui n'existe pas.

**Webhooks** — la liste vient du **dashboard** (`GET /api/webhooks`), pas du
gateway qui n'a pas cette route. Le déclenchement exige un HMAC que le
navigateur ne peut pas produire (le secret est masqué) : `serve.py` signe.

**Sécurité** — S1→S9 corrigées, plus deux failles trouvées par les tests :
- S10 : le dossier `web/` était intégralement publié (`GET /serve.py`)
- S11 : l'expurgation du jeton se contournait par `/../ulysse-config.js`
**Règle posée : la page ne détient plus aucun secret.**

**Les six défauts trouvés par la passe de design** (corrigés le 2026-08-08) —
tous invisibles côté réseau ET côté contrat : la page s'affichait, les
identifiants étaient tous là.
- `incog` n'était jamais posée : toute la mise en scène du fil sans mémoire
  était dans `ulysse.css` et ne sortait jamais
- `#composerHint` portait `.glegend` (`position:absolute`) et se posait
  par-dessus l'interrupteur
- `#vdet` recevait le contenu nu — pas de padding, pas de défilement
- la sélection du Vestiaire était un **index** dans la liste filtrée
- `#ctlEtabli` était dans le HTML et **vide**
- le schéma était un **ruban** : 2766 × 144 à douze outils → **902 × 342**

`test_page.js` passe de 76 à **155** vérifications, et **charge désormais
`ulysse.css`** — sans la feuille, une vérification d'apparence passait aussi
bien avec le défaut qu'avec sa correction.

**Deux bugs que seul le vrai backend pouvait révéler** :
- la clé est `is_directory`, pas `is_dir` → tous les dossiers passaient pour
  des fichiers (le faux Hermès mentait aussi ; corrigé des deux côtés)
- `sessions.changed` et `reasoning.available` étaient ignorés → les listes se
  rafraîchissent maintenant sur événement au lieu de sonder

---

## Le produit (dans `Desktop\Projet Ulysse\web\`)

| Fichier | Rôle |
|---|---|
| `ulysse.css` | le style de la maquette, **identique au caractère près** |
| `ulysse-icons.js` | table `I` + `svg()` — 43 signes, **tous documentés** |
| `ulysse-view.js` | la machinerie de rendu de la maquette, rendue générique |
| `ulysse.html` | la coquille et les 10 panneaux |
| `ulysse-app.js` | les panneaux reliés aux endpoints vérifiés |
| `ulysse-core.js` | **la liaison à Hermès — ne pas toucher côté design** |
| `serve.py` | statique + relais authentifié + signature des webhooks |

La maquette est **scriptée** : ses étapes, agents, automatisations et
notifications sont des jeux d'essai en dur. On a repris le **rendu** et retiré
les **données** — le schéma du Plan montre la suite réelle des outils appelés,
le Vestiaire les vraies compétences, les Automatisations le vrai cron.

Fidélité mesurée : CSS identique · 56/58 structures · 54/54 classes ·
**0 règle qui recouvre la maquette** (les miennes sont préfixées `u-`).

---

## Les tests (tous au vert, rejouables)

```
cd web
node test_page.js        # 173 — la page dans un DOM réel
python test_serve.py     # 52  — frontières et relais
python test_personas.py  # 100 — 10 personas x 2 scénarios
python test_reel.py      # 39  — contre le VRAI Hermès (pile lancée requise)
```

Les trois premiers montent leur propre pile et n'ont besoin d'aucun backend.
`faux_hermes.py` rejoue le protocole réel **avec les mêmes contrôles** (jeton,
Host, Origin, HMAC) : un test qui triche est refusé.

⚠ `test_personas.py` refuse de démarrer si un banc précédent occupe les ports —
sous Windows un nouveau serveur peut se lier sans erreur pendant que l'ancien
répond, et les tests mesureraient le mauvais serveur. (C'est arrivé.)

---

## Relancer la pile

```
cd "%USERPROFILE%\Desktop\Projet Ulysse\web"
lancer_ulysse.bat
```
Puis `http://127.0.0.1:8080/` — on entre par le mot-marque **Ulysse** et la
question ; l'application n'apparaît qu'après la première phrase.

Le jeton de session ne vit qu'en mémoire des processus lancés (il n'est plus
écrit dans `ulysse-config.js`).

Pour arrêter :
```
powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -match 'serve.py|dashboard|gateway' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
```

---

## Contexte repli provider (inchangé)
- Claude Code (forfait kuchu) — utilisé pour tout le code du projet. Règle
  kuchu 2026-08-07 : si le code est lourd ou bloqué, le dire immédiatement
  pour passer Opus 5, ne pas perdre de temps.
- Ollama + GLM 5.2 en repli local.

## Les documents à relire en priorité
1. `web/CONTRAT-INTERFACE.md` — la passe de main design ⇄ code
2. `web/AUDIT-ENDPOINTS-REEL.md` — chaque endpoint, avec sa ligne de source
3. `web/RAPPORT-CODE-REVIEW.md` — ce qui a été corrigé, et les faux positifs
