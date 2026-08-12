# Relais — 2026-08-12 (22), les livrables ont quitté le fil

> ## ⚠ LU EN PREMIER : le banc ne voit pas ce qui compte
>
> Cette session a produit **cinq corrections utiles**. Le banc (484
> vérifications) en a trouvé **zéro**. Toutes sont sorties du produit lancé
> pour de vrai et piloté dans Chrome :
>
> | trouvé en… | quoi |
> |---|---|
> | lançant l'app | `image.attach` → `4016`, cassé **depuis toujours** |
> | lisant une réponse | le ⤓ noyé au milieu du texte, jamais vu |
> | relisant mon code | ` ```bash ` accepté comme fichier |
> | relisant mon code | la Map qui gonflait d'une copie par peinture |
> | kuchu, en s'en servant | le CSV déroulé dans le fil « prend de la place pour rien » |
>
> Le banc trouve les **régressions**. Il ne trouve pas ce qui est **inutile,
> noyé, ou encombrant**. Ne lui demandez pas de vous dire si le produit est
> bon — il ne sait dire que s'il est *le même qu'hier*.

> **`node test_page.js` : 484 / 484.** Huit mutations posées sur les gardes
> neufs, huit mordues.

---

## 0. Ce qui vous attend au premier geste

```
cd web && node test_page.js          # 484/484
python resync_apercus.py             # après TOUTE retouche de ulysse.css
```

Puis, et ce n'est pas facultatif :

```
lancer_ulysse.bat                    # http://127.0.0.1:8080/ulysse.html
```

> **Deux pièges en vérifiant dans le navigateur**, tous deux rencontrés
> aujourd'hui :
>
> 1. **Naviguer vers l'URL courante, hash compris, ne recharge rien.** J'ai
>    failli diagnostiquer un défaut de cache dans `serve.py` — qui envoie
>    pourtant `Cache-Control: no-store`. Utilisez `location.reload()`.
> 2. **Au démarrage la page est sur l'accueil, pas sur le fil.** `#thread` est
>    vide et `paintThread()` n'y peint rien : **ce n'est pas une panne.** Il
>    faut envoyer un vrai message.
>
> Et avant de mesurer : fermez la fenêtre « Ulysse-Serve » ouverte, puis
> relancez le `.bat`. `serve.py` refuse un port pris et le dit.

---

## 1. ⚠ Le contenu d'un fichier ne se déroule plus dans le fil

C'est le changement du jour, et il vient de kuchu :

> *« Les fichiers CSV et tout autre fichier ne doivent pas être développés
> dans le chat. Ça prend de la place pour rien, et ce n'est pas là qu'il faut
> les développer. »*

Un CSV de 300 lignes déroulé dans la conversation **enterre la réponse qui
l'explique**, et il ne s'y lit pas mieux : le fil est étroit, sans gouttière.

**Le bloc sort du fil et entre dans un encart, à la fin du tour.** Il n'en
reste que le **type en pastille** et le **nom**. On clique la ligne, le volet
s'ouvre, on voit le détail. Le ⤓ emporte sans passer par là.

### Ce qui ne bouge pas

Un ` ```bash ` d'exemple, un ` ```texte ` avec une URL : **ils restent où ils
sont.** Rien ne les accueille de l'autre côté — les retirer les ferait
disparaître sans contrepartie.

**La règle d'entrée** : une **langue de fichier** (`csv`, `json`, `md`, `py`,
`html`, `svg`, `sql`, `yaml`…) **ou un nom donné par l'agent**, ET au moins
deux lignes non vides. Une URL seule n'est pas un fichier.

> On préfère **oublier un livrable** que d'en inventer trois. Une liste qui
> contient du bruit cesse d'être lue — c'est exactement ce qui venait
> d'arriver au ⤓.

### ⚠ Une seule découpe, et c'est le point

`decouperLivrables(src)` → `{texte, livrables}` produit **le texte du fil ET
la liste de l'encart**. Deux fonctions séparées finiraient par diverger, et
alors un bloc disparaîtrait du fil **sans arriver dans l'encart** : perdu,
sans un mot. `livrablesDuTexte()` n'est plus qu'une enveloppe.

---

## 2. L'encart : ce qu'il est, et pourquoi il porte un liseré

Le constat qui l'a fait naître : *« j'ai regardé la fin de la discussion, il
n'y avait rien. Par contre, en plein milieu, il y avait plein de fichiers que
je pouvais cliquer. »*

On lit une réponse **en entier**, puis on veut ce qu'elle a produit. À ce
moment-là on est **en bas**.

> **Ce qu'on emporte ne se range pas dans la phrase qui en parle. Ça se range
> là où on arrive quand on a fini de lire.**

C'est **le seul bloc du fil à porter une bordure pleine**, un liseré d'accent
et un fond distinct. Il doit se repérer **en faisant défiler sans lire**,
parce que c'est comme ça qu'on le cherchera. Mesuré dans la page :
`2.67px rgb(11, 87, 208)`.

### Les deux espèces ont le MÊME geste

| espèce | Ouvrir | Emporter |
|---|---|---|
| écrit sur le **disque** (`write_file`, `patch`) | le volet, lu par `REST` | ⤓ |
| écrit dans la **réponse** (un bloc) | le volet, contenu **en mémoire** | ⤓ |

Que les octets soient sur le disque ou dans la réponse **ne regarde pas la
personne qui clique**. `ouvrirTexteEnMemoire(nom, texte)`
(`ulysse-artifact.js`) ouvre le volet sur ce qui n'est nulle part : en
Discussion, le modèle ne peut **rien** écrire sur le disque.

> **La passe disait le contraire, et elle avait tort.** J'avais écrit qu'un
> bloc « n'a rien à ouvrir ». C'était vrai *tant que son contenu restait
> lisible dans le fil*. Il n'y est plus — il faut donc bien un endroit pour le
> regarder, sinon on télécharge à l'aveugle.

### Le ⤓ inline a disparu

L'encart **remplace** le bouton au coin du bloc, il ne s'y ajoute pas : sinon
le même fichier porterait deux boutons. **La ligne d'outil garde son
« Ouvrir › »** — elle dit *ce que l'agent a fait et quand*, c'est un journal ;
l'encart est un **bilan**. Deux moments de lecture différents.

---

## 3. Deux défauts trouvés en me relisant, pas en testant

Ils étaient **dans le code livré la nuit même**, et les 479 vérifications
d'alors les laissaient passer.

**① ` ```bash ` entrait dans l'encart.** La condition lisait *« le nom deviné
n'est pas `extrait.txt`, donc c'est un fichier »*. Or `bash` donne
`extrait.sh`. `nomDeBloc` renvoie maintenant `explicite: true|false` :
**la déclaration du nom se lit, elle ne se déduit plus de sa valeur.**

**② La clé d'un bloc se comptait au lieu de se déduire.**
`"b" + (blocsLivrables.size + 1)` donnait une clé neuve **à chaque peinture du
fil** — et le fil est repeint à chaque frappe. La Map gardait une copie du
fichier par peinture. C'est `t.key + ":" + rang` maintenant ; `turnSeq` est
monotone et ne se réutilise jamais, même en changeant de conversation.
Vérifié dans la page : dix repeintures, **une** entrée.

> Une valeur par défaut qui sert aussi de **signal** (« si c'est `extrait.txt`,
> c'est que rien n'a été déclaré ») est un piège : le jour où le défaut change,
> le signal ment sans bruit.

---

## 4. Éprouvé en vrai, le 2026-08-12

Demande réelle en Discussion : un CSV nommé **et** un ` ```bash ` d'exemple.

- le CSV **a quitté le fil** — `Normandie` introuvable dans `#thread` ;
- le ` ```bash ` **y est resté** — `read_csv` toujours présent ;
- l'encart : pastille `CSV`, « dans cette réponse · 6 lignes », liseré ;
- « Ouvrir » a ouvert le volet, **accents intacts** (`Février`,
  `Île-de-France`), fil d'Ariane « dans cette réponse » ;
- le ⤓ du volet armé sur `ventes-2026.csv` ;
- **aucune erreur en console.**

Non éprouvé : le ⤓ n'a pas été déclenché (il écrit dans les Téléchargements de
kuchu), et l'encart n'a **pas** été vu avec un fichier écrit sur le disque en
**Cowork** — seulement avec un bloc de réponse en Chat.

---

## 5. Ce qui reste, et à qui

**À vous, tout de suite** :

- **Trois fichiers d'essai traînent** à la racine et dans `web/` :
  `personas-ulysse.csv`, `web/personas-ulysse.csv`, `web/personas-csv.html`.
  Ce sont des sous-produits de mes essais — non commités, à supprimer quand
  vous voulez.
- **`_retire-2026-08-11/`** : vos 12 captures et 2 fichiers d'essai.
  **Déplacés, pas supprimés.** Rien ne les utilise.
- **Le chemin dégradé n'a jamais été essayé en vrai** : fermez la fenêtre du
  dashboard Hermès pendant qu'Ulysse tourne, et regardez ce que dit l'app.
  Les messages existent et sont testés au banc — ils n'ont pas été vus.

**Décisions, pas du code.** Chacune est bloquée sur un choix que le produit ne
peut pas faire seul, et il le dit à l'écran plutôt que de faire semblant :
`POST /api/skills/toggle` · les 4 sous-modes de permission · l'écriture du
fichier de profil · la création de projet / de coffre · la passe Plan
§1 bis/ter/quater.

**À Cowork** : `l-livrables`, `l-titre`, `l-item`, `l-type`, `l-nom`, `l-ou`,
`l-actes`, `l-ouvrir`, `l-dl` sont à porter au `CONTRAT-INTERFACE.md`.
`apercu-fichiers.html` a été refait et n'est plus dépassé.

---

## Les pièges tiennent

`ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`, `NEUTRE`, `titre`
**et maintenant `LANGUES_FICHIER`** au niveau global — **et
`ulysse-artifact.js` ajoute `ARTIFACT_RE`** · `#morePop` et `#tmain` sont
reconstruits en `innerHTML`, donc **sortir, réécrire, réinstaller** · pour
réinstaller `#tecran`, **chercher dans `#tmain`, jamais avec
`getElementById`** · `.panel` porte `z-index:1` · **l'écriture passe par
`serve.py`** · `#pTerminal .term.u-plein` a besoin de `.term` dans le
sélecteur · **`Échap` EST le bouton de sortie du plein écran** · toute
correction de `ulysse.css` s'inscrit dans `ECARTS-MAQUETTE.md` **et se suit
d'un `resync_apercus.py`** · **« ranger », jamais « créer »** · **le lieu vient
de `conv.info`** · **« Travailler ici » ne ferme pas le fil** · **`nav()` ouvre
les coulisses** · **`drawBell()` compare `data-nav`, jamais le libellé** ·
**Ulysse ne choisit jamais le cerveau** (`LOI-DU-CERVEAU.md`) · **une image
collée est une image jointe**, et c'est **`image.attach_bytes`**, jamais
`image.attach` · **un fichier se montre dans un seul écran** : le volet,
jamais la modale · **Hermès décrit les images que le modèle ne voit pas — ne
dites pas qu'il ne les voit pas** · **le garde qui répare doit mesurer comme
le garde qui alerte** · **un test qui désigne par la position accuse le
voisin** · **une valeur par défaut ne sert pas de signal** · et **un `$` suivi
de `` ` ``, `&`, `'` ou d'un chiffre est un motif dans un remplacement
`String.replace`**.
