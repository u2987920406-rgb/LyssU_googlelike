# Relais — 2026-08-11 (21), les deux passes sont faites

> ## ⚠ LU EN PREMIER : le banc était vert, le produit était cassé
>
> Après les 409 vérifications au vert, l'app a été lancée **pour de vrai** et
> pilotée dans Chrome. **Joindre une image échouait**, avec
> `4016 image not found` — et pas seulement le collage : **le « + » aussi, et
> depuis toujours.**
>
> `attacherFichier` appelait **`image.attach`**, qui veut un `path` que le
> gateway voit sur son propre disque et **ne regarde jamais `data_url`**. Un
> navigateur ne peut pas en fournir. La bonne porte est
> **`image.attach_bytes`** (`methods_prompt.py:453`), dont la docstring décrit
> notre cas mot pour mot : *« a web dashboard running on a DIFFERENT machine
> than the gateway can't hand us a local path »*.
>
> **Le faux Hermès acceptait n'importe quel appel RPC**, donc « la pièce est
> jointe » passait au vert sur une pièce refusée. C'est la sixième fois : *un
> faux qui ne ment pas comme le vrai ne prouve rien.* Trois vérifications
> neuves gardent maintenant **la méthode appelée**, pas seulement le chemin
> emprunté. **412 / 412.**
>
> Corrigé et **revérifié en direct** : image collée → pièce jointe prête →
> l'agent répond « 42 » à l'image qu'on lui colle. Bout-en-bout.

> **Les deux fonctions arrivées avant leur dessin sont rentrées dans le rang.**
> Le collage (relais 20 §1) et les fichiers (§2) sont appliqués. Le troisième
> point — `ulysse-artifact.js` sous garde-fou — a ouvert bien plus grand que
> prévu : **le fichier n'était pas hors du champ des vérifications, il était
> hors de la page qu'elles testaient.**
>
> `node test_page.js` : **409 / 409** (382 avant, dont 15 au rouge à l'arrivée).

---

## 0. Ce qui vous attend au premier geste

```
cd web && node test_page.js
```

**Il passe.** Mais il ne passait pas ce matin, et ce n'était ni le test ni
l'app qui avait tort — c'était **l'outil de réparation**. Lisez le §1 avant
de toucher à quoi que ce soit d'autre : c'est la seule chose de ce relais qui
puisse vous surprendre demain.

> **Avant de mesurer dans le vrai produit** : fermez la fenêtre « Ulysse-Serve »
> ouverte, puis relancez `lancer_ulysse.bat`. `serve.py` refuse de démarrer sur
> un port pris et le dit — c'est comme ça que j'ai vérifié que je sondais
> l'ancien serveur, pas le neuf.

---

## 1. ⚠ Le garde qui répare mentait, et c'est lui qu'il fallait croire le moins

À l'arrivée, quinze vérifications au rouge : *« la feuille n'y est plus
reconnaissable »*. Et `python resync_apercus.py --voir` répondait **« 15 à
jour »**.

**Aucun des deux ne parlait de la même chose.**

| | ce qu'il lisait | ce qu'il en disait |
|---|---|---|
| `test_page.js` | les **octets du disque** | 15 divergences — **exact** |
| `resync_apercus.py` | du texte **normalisé** par Python (`\r\n` → `\n`) | « 15 à jour » |

`ulysse.css` était revenu en **CRLF** par un `git checkout` (`core.autocrlf=true`
était la seule règle en vigueur), pendant que les quinze aperçus portaient une
copie en **LF**. Le test avait raison sur toute la ligne.

**Et la réparation promise n'existait pas** : `resync` écrit avec
`newline=""`, donc en LF — exactement ce que le test refusait. Il aurait
annoncé « RÉPARÉ » quinze fois sans rien changer au verdict.

> **Le garde qui répare doit mesurer comme le garde qui alerte**, sinon l'un
> des deux ment — et c'est toujours celui qui rassure.

**Trois choses ont été faites, dans cet ordre :**

1. `ulysse.css` remis en LF — **zéro caractère de style modifié** ;
2. `resync_apercus.py` lit maintenant en `newline=""`. Remis en CRLF pour
   l'essai, il répond « 15 perdus » au lieu de « 15 à jour » : il ne répare
   toujours pas ce cas, mais **il ne le couvre plus** ;
3. **`.gitattributes` (nouveau, à la racine)** — `* text=auto eol=lf`, plus
   `*.bat eol=crlf` et les binaires. C'est la cause, pas le symptôme : sans
   lui, le prochain `checkout` de `ulysse.css` remet quinze lignes au rouge
   pour un fichier dont pas une règle n'a bougé.
   `lancer_ulysse.bat`, qui était en LF sur le disque, est repassé en CRLF.

---

## 2. Le collage est une pièce jointe (passe §1 et §2 — faits)

`collerCapture()` fabrique un `File` et appelle **`surFichiers()`**, le chemin
du « + ». De là `image.attach`, et c'est le gateway qui matérialise l'image
dans l'espace de la session.

**Ont disparu** : la route `/ulysse/capture`, `sauver_capture()`, la liste
`captures[]`, `dessineCaptures()`, `refsCaptures()`, le marqueur
`[capture: …]`, et les imports `base64` / `datetime` de `serve.py` qui ne
servaient plus qu'à eux.

**Une décision que la passe n'avait pas tranchée** : en **Discussion**, coller
ne joint plus rien et le dit. Joindre aurait ouvert une session Cowork dans le
dos de la personne (`attacherFichier` → `ensureSession`) pour une pièce que le
proxy n'envoie pas. Un test l'exige.

### ⛔ Le §3 de cette passe ne doit PAS être appliqué tel qu'il est écrit

La question laissée en réserve — *« Hermès dit-il si le modèle courant voit
les images ? »* — a été posée **au code source**. Réponse : **oui**
(`supports_vision`, `/api/model/info`, `web_server.py:6225`).

**Et c'est justement pour ça que la pastille serait fausse.**

`agent/image_routing.py:461` tranche à chaque tour. En `auto` — le défaut —
si le modèle ne voit pas, le mode est `"text"` et
`tui_gateway/server.py:6733` fait **décrire l'image par `vision_analyze` puis
préfixe la description au message**. L'image passe dans les deux cas.

> Ce que la passe prenait pour le contournement manuel d'Hermès est **le
> comportement par défaut du produit**. Écrire « ce modèle ne voit pas les
> images » ferait renoncer à un geste qui marche — le mal exact que le §4
> redoutait, atteint par l'autre bout : non pas en devinant, mais en croyant
> savoir.

**`.u-jointe.aveugle` n'existe pas.** Ce n'est plus une prudence faute de
réponse, c'est la conclusion d'une réponse. Le §4 de la passe est réécrit avec
les lignes.

---

## 3. Un fichier, un écran (passe §1 à §4 — faits)

**Le volet est le seul visualiseur.** `showFile()` — l'Établi, les Livrables —
tient en une ligne et ouvre le volet. La modale ne s'ouvre plus.

Le volet a récupéré **tout** ce que la modale savait et qu'il ignorait :
l'image, la taille, le refus au-delà de la limite, le téléchargement. Il garde
la source et la copie. Chaque manque est vérifié séparément — sinon on aurait
juste déplacé le trou.

**La carte désigne un chemin.** `ARTIFACT_RE` accepte n'importe lequel ; aucune
route n'a été écrite, `REST.readFile` sait déjà lire. `/ulysse/artifact`,
`sauver_artifact()` et `web/artifacts/` ont disparu.

**Les trois défauts** :

- **le volet ne défilait pas** — `<aside class="u-art-panel">` n'a pas reçu de
  règles : il a été **retiré**. `.u-art-viewer` était déjà la colonne flex ;
  le volet *est* l'aside. Plus `min-height:0` sur le corps, sans quoi un
  enfant flex ne devient jamais plus petit que son contenu ;
- **l'icône creuse** — plus aucun nom hors registre ;
- **le garde-fou** — c'est le §4 ci-dessous.

**Deux ajouts que la passe permettait sans les nommer :**

- la carte dit **la taille**, lue une fois par chemin et gardée — une
  repeinture du fil ne la redemande pas ;
- **`f-carte.absent`** : cette lecture dit aussi quand le fichier n'est **pas
  là**. La carte le dit **avant** le clic et ne s'ouvre pas. Une carte qui
  promet un fichier absent est un bouton mort.

**Non fait, exprès** : le §5 (la carte déduite de l'outil). La vérification
qu'il demande n'a pas été faite ; dans le doute on garde ce qui marche.

---

## 4. ⚠ Le fichier n'était pas hors du champ. Il était hors de la page.

Le relais 20 disait : *« `test_page.js` ne contient pas une fois
`ulysse-artifact.js` »*. C'était vrai, et **très en dessous de la vérité**.

`test_page.js` inline les scripts dans la page pour les faire tourner. La liste
était **écrite à la main** :

```js
const SCRIPTS = ["ulysse-config.js", "ulysse-icons.js", "ulysse-view.js",
                 "ulysse-core.js", "ulysse-app.js"];
```

**Les 382 vérifications tournaient donc contre une page amputée.** Pas
seulement le balayage des icônes : *tout*. Les fonctions du fichier n'existaient
pas dans le DOM testé.

La boucle vérifiait pourtant que chaque fichier de la liste était bien chargé
par la page. **Elle ne vérifiait jamais l'inverse.** C'est par cette asymétrie
que le fichier est entré — et c'est elle qui est refermée : la liste est
maintenant **lue dans `ulysse.html`**, dans son ordre. Comme pour les aperçus,
un fichier de plus entre tout seul.

### Deux pièges trouvés en refermant, et ils mordent

**a. `String.replace` interprète le remplacement.** `$&`, `` $` ``, `$'`, `$1`
y sont des **motifs**. Un fichier qui en contient un — fût-ce dans un
commentaire, et c'est arrivé avec `` $` `` dans une phrase — est inliné
**corrompu**, lève une `SyntaxError`, et plus rien n'y est défini. L'erreur ne
nomme jamais le fichier d'origine : j'ai cherché ailleurs pendant un moment.
Les deux inlinings (scripts et feuille) passent maintenant par une **fonction**
de remplacement, qui rend sa valeur telle quelle.

**b. Le balayage statique des icônes ne voit que `svg("un nom")` littéral.**
L'icône de la carte dépend de l'extension, donc elle sort d'une fonction :
**invisible au garde-fou**. Vérifié en remettant le défaut d'origine — il
repassait au vert. Une vérification **sur le rendu** a été ajoutée : six
extensions, aucun `d="undefined"`. Elle attrape n'importe quel nom inconnu,
quelle que soit la façon dont il est choisi.

### Le faux Hermès mentait sur les fichiers

`/api/files/read` rendait **le même fichier pour n'importe quel chemin**. Un
fichier absent s'affichait donc comme un fichier présent, et `f-carte.absent`
était intestable. Il y a maintenant un faux disque **indexé par chemin**, qui
lève **404 « File not found »** comme le vrai (`web_server.py:2385`).

> C'est la cinquième fois ici. *Un faux qui ne ment pas comme le vrai ne
> prouve rien.*

### Les garde-fous ont été mis à l'épreuve

Cinq défauts remis un par un dans le code, test relancé à chaque fois :

| défaut remis | verdict |
|---|---|
| l'icône inconnue revient | attrapé |
| l'inlining redevient une chaîne | attrapé |
| le volet retrouve son `<aside>` sans règle | attrapé |
| la carte se referme sur `/artifacts/` | attrapé |
| le faux disque redevient constant | attrapé |

**Le premier passait au vert avant la vérification sur le rendu.** C'est pour
ça qu'elle existe.

---

## 4 bis. Ce que la vraie exécution a appris, et que le banc ne pouvait pas dire

Lancé, piloté dans Chrome, contre le vrai gateway et le vrai modèle.

**Ce qui a été prouvé** : zéro erreur console · le volet s'ouvre depuis
l'Établi **et** depuis une carte, la modale jamais · il **défile** (7993 px de
contenu dans 741 px, la fin est atteinte) · source, copie, téléchargement ·
l'agent pose lui-même une carte **sur un chemin du projet** et elle s'ouvre ·
la conversation, l'Établi et le fichier tiennent à l'écran **en même temps**.

**Ce qui était cassé** — voir le bandeau en tête. Trois corrections :

1. **`image.attach_bytes` au lieu de `image.attach`** (`ulysse-core.js`) ;
2. **le plafond des images est 25 Mo, pas 32** — `_ATTACH_BYTES_MAX_BYTES`
   (`server.py:10350`). Refuser à 32 Mo, c'était promettre un envoi que le
   gateway allait rejeter en 4018 ;
3. **le nom affiché est celui d'origine.** `image.attach_bytes` rend le nom
   qu'il a écrit — `upload_20260811_194446_1.png`, constaté. La personne a
   choisi `photo-vacances.png` et ne reconnaîtrait pas le sien.

**Une image ne rend PAS de référence, et c'est correct.** Elle ne se lit pas,
elle se regarde : elle est mise en file sur la session et part au tour suivant.
`refsJointes()` écarte les pièces sans `ref` — rien n'est ajouté au message, et
la bulle ne porte plus aucun marqueur.

### Le §3 du collage confirmé par la machine, pas seulement par la source

En demandant à l'agent ce qu'il voyait sur l'image, sa **réflexion** dit :

> *« I already have the description. »*

Le modèle n'a pas reçu de pixels : il a reçu **la description faite par
Hermès**, exactement le chemin `"text"` de `image_input_mode: auto`. Il a
répondu juste. **Une pastille « ce modèle ne voit pas les images » aurait été
un mensonge**, et elle aurait fait renoncer à un geste qui marche. La réserve
du §4 est donc close deux fois : par la source, puis par l'usage.

### ⚠ Trouvé en chemin, PAS corrigé : `mdRender` abîme les documents longs

Le volet rend maintenant des documents entiers, et ça rend visibles trois
défauts du rendu markdown qui **existaient déjà** dans les bulles :

- **les citations `>` ne sont pas rendues** — le chevron s'affiche en clair ;
- **un retour à la ligne simple coupe la phrase**, alors qu'en markdown il
  joint le paragraphe. Nos fichiers sont coupés à 78 colonnes : chaque
  paragraphe arrive en escalier ;
- **`**gras**` à cheval sur deux lignes reste littéral**, astérisques compris.

Je n'y ai pas touché : ça change l'apparence de **tous** les messages, donc
c'est une décision de design, pas une correction de passe. Mais le volet
l'expose bien plus qu'avant — à trancher avant de montrer ça à quelqu'un.

---

## 4 ter. Le §5 est fait — le lien vient de ce que l'agent A FAIT

Trouvé par kuchu en deux gestes. *« Montre-moi le contrat d'interface »* :
l'agent appelle `read_file`, récite le fichier dans le fil, et **rien ne
permet de l'ouvrir**. *« Il aurait dû me proposer le lien, c'était plus
simple. »*

La balise `[artifact: …]` ne pouvait pas y répondre : **elle dépend de ce que
l'agent pense à écrire, et il n'y pense pas.** C'était le §5, laissé ouvert
faute de vérification. Elle est faite :

| ce qu'Hermès envoie | verdict |
|---|---|
| `tool.complete.args` — le **dict complet** | **toujours envoyé** (`server.py:5423`) |
| `tool.start.args_text` — le JSON | seulement en mode verbeux |
| `tool.start.context` — l'aperçu | **tronqué à 80 caractères** |

Et la clé est `path`, pour `read_file` / `write_file` / `patch` — **la table
d'Hermès lui-même** (`agent/display.py:443`), pas une supposition. Ulysse
recevait tout ça depuis le début et **le jetait** : `ulysse-core.js` ne lisait
jamais `pl.args`.

**Ce n'est PAS une carte de plus.** La ligne d'outil nomme déjà le fichier ;
une carte à côté serait un second signe pour la même chose. **C'est la ligne
qui s'ouvre** — elle porte « Ouvrir › » au survol, et le clic ouvre le volet.
Le `▸ résultat` garde son geste : la délégation ignore les clics dans un
`<details>`.

Deux garde-fous qui comptent : **la liste des outils est fermée** (`path` ne
veut pas dire la même chose partout — vérifié, un `browser_navigate` avec un
`path` ne devient pas un lien), et **un chemin relatif est résolu sur
`conv.info.cwd`**, sinon `/api/files/read` ne saurait pas le trouver.

Vérifié en direct contre le vrai agent : `search_files` et `terminal` restent
inertes, `read_file` s'ouvre, avec le chemin absolu complet. **418 / 418.**

---

## 5. Ce qui reste, et à qui

**À Cowork** :

- **`apercu-fichiers.html` est dépassé.** Il reproduit fidèlement des défauts
  qui n'existent plus, et sa colonne « actuel » montre l'état d'avant. Il ne
  ment pas sur ce qu'il montre — il ment sur le mot « actuel ». À reprendre ou
  à retirer. Les deux passes portent un bandeau qui le dit.
- Les **classes `f-`** et les `id` du volet sont entrés dans
  `CONTRAT-INTERFACE.md`.

**À vous** :

- **`_retire-2026-08-11/`** à la racine : `web/captures/` (12 images) et
  `web/artifacts/` (2 fichiers d'essai) en sont sortis. **Déplacés, pas
  supprimés** — les captures sont les vôtres. Rien ne les utilise ;
  `rm -rf "_retire-2026-08-11"` quand vous voulez.
- **`#sFile` / `#fileBody` / `#fClose`** restent dans `ulysse.html`, **ouverts
  par personne**. Ils sont au contrat et n'en partent qu'avec son accord. Les
  retirer est une décision à prendre là-bas, pas au détour d'une passe.

---

## Les pièges tiennent

`ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`, `NEUTRE` **et `titre`** au
niveau global — **et `ulysse-artifact.js` ajoute `ARTIFACT_RE`** · `#morePop`
et `#tmain` sont reconstruits en `innerHTML`, donc **sortir, réécrire,
réinstaller** · pour réinstaller `#tecran`, **chercher dans `#tmain`, jamais
avec `getElementById`** · `.panel` porte `z-index:1` · **l'écriture passe par
`serve.py`** · `#pTerminal .term.u-plein` a besoin de `.term` dans le
sélecteur · **`Échap` EST le bouton de sortie du plein écran** · toute
correction de `ulysse.css` s'inscrit dans `ECARTS-MAQUETTE.md` · **« ranger »,
jamais « créer »** · **le lieu vient de `conv.info`** · **« Travailler ici » ne
ferme pas le fil** · **`nav()` ouvre les coulisses** · **`drawBell()` compare
`data-nav`, jamais le libellé** · **Ulysse ne choisit jamais le cerveau**
(`LOI-DU-CERVEAU.md`) · **une image collée est une image jointe** · **un
fichier se montre dans un seul écran** : le volet, jamais la modale ·
**Hermès décrit les images que le modèle ne voit pas — ne dites pas qu'il ne
les voit pas** · **le garde qui répare doit mesurer comme le garde qui
alerte** · et **un `$` suivi de `` ` ``, `&`, `'` ou d'un chiffre est un motif
dans un remplacement `String.replace`**.
