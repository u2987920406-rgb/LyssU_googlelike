# Passe de design — montrer un fichier

> ✅ **APPLIQUÉE le 2026-08-11.** Un seul visualiseur (le volet) ; la carte
> désigne un chemin ; les trois défauts sont corrigés ; `/ulysse/artifact`,
> `sauver_artifact()` et `web/artifacts/` n'existent plus.
>
> ⚠ **`apercu-fichiers.html` est donc DÉPASSÉ** : il reproduit fidèlement des
> défauts qui n'existent plus, et sa colonne « actuel » montre l'état d'avant.
> Il ne ment pas sur ce qu'il montre — il ment sur le mot « actuel ». À
> reprendre côté Cowork, ou à retirer.
>
> **Le §4 a été suivi mais pas au pied de la lettre** : la carte dit le
> dossier **et la taille** — la taille demande une lecture par chemin, faite
> une seule fois et gardée. Cette lecture apporte en prime l'état `absent`,
> que le §6 prévoyait sans dire comment l'atteindre : une carte dont le
> fichier n'est pas là le dit **avant** le clic, et ne s'ouvre pas.
>
> ✅ **Le §5 EST appliqué**, le même jour, après la vérification qu'il
> demandait. Réponse : **oui**, `tool.complete` porte `args` — le dict
> complet, **toujours** (`server.py:5423`, pas seulement en mode verbeux) — et
> la clé est `path` pour `read_file`, `write_file` et `patch`, d'après la
> table d'Hermès lui-même (`agent/display.py:443`).
>
> **Mais pas sous forme de carte.** La ligne d'outil nomme déjà le fichier :
> poser une carte en plus serait un second signe pour la même chose. **C'est
> la ligne qui s'ouvre.** Déclenché par kuchu, le 2026-08-11 : *« montre-moi
> le contrat d'interface »* faisait réciter le fichier dans le fil sans aucun
> moyen de l'ouvrir — *« il aurait dû me proposer le lien, c'était plus
> simple »*. La balise reste, en second : elle marche quand l'agent y pense.

> **Écrite après coup, pour la deuxième fois en deux jours.**
> `ulysse-artifact.js` a été ajouté le **2026-08-11 à 14:26** — 177 lignes,
> 24 règles de feuille, chargé dans `ulysse.html`, et **aucune passe de
> design**.
>
> Ce que kuchu demande existe donc déjà **à moitié**. La moitié qui manque
> n'est pas celle qu'on croit : ce n'est pas une fonction en plus, c'est
> **une fonction en trop**.

Aperçu : `apercu-fichiers.html` (autonome, trois cas × actuel/proposé).

---

## 0. Constaté / supposé

**Constaté**, en lisant le code — chaque point est vérifiable en trois
secondes :

- **deux visualiseurs coexistent** pour le même objet : `showFile()` →
  `#sFile` (une **modale**, depuis l'Établi et les Livrables) et
  `openArtifact()` → `#artifactViewer` (un **volet**, depuis le fil) ;
- la carte du fil ne peut désigner que `/artifacts/…` — la balise est
  `ARTIFACT_RE = /\[artifact:\s*(\/artifacts\/[^\]\s]+)\s*\]/g` ;
- `web/artifacts/` existe **dans le dossier servi**, et contient deux fichiers
  d'essai : `demo_tableau.md`, `test_proto.md` ;
- `.u-art-panel` **n'a aucune règle** dans `ulysse.css`. `.u-art-body` porte
  `flex:1`, mais son parent n'est pas un conteneur flex ;
- `svg("table")` est appelé pour les `.csv` — **`table` n'existe pas** dans le
  jeu d'icônes. `svg()` rend alors `<path d="undefined"/>` ;
- `closeArtifactViewer()` retire une classe `.on` que **personne ne pose et
  qu'aucune règle ne lit** ;
- `test_page.js` **ne regarde pas `ulysse-artifact.js`** — zéro occurrence.

**Supposé** : qu'on puisse fabriquer la carte à partir de ce que l'agent
**fait** plutôt que de ce qu'il **écrit**. C'est le §4, et il est marqué comme
tel.

---

## 1. Le fond : deux visualiseurs pour le même objet

Ouvrez `PASSE-DESIGN-NOTIFICATIONS.md` depuis l'**Établi** : une modale
s'ouvre, le fond s'assombrit, la conversation disparaît. Elle sait la taille,
sait afficher une image, sait télécharger, sait **refuser** un fichier de
200 Mo. Elle ne sait **ni** montrer la source **ni** copier.

Ouvrez le même fichier depuis une **carte du fil** : un volet s'ouvre à droite,
la conversation reste. Il sait montrer la source et copier. Il ne sait **ni**
les images, **ni** la taille, **ni** le téléchargement, **ni** refuser ce qui
est trop lourd.

| | `#sFile` (modale) | `#artifactViewer` (volet) |
|---|---|---|
| Image | ✅ | ⛔ |
| Taille, refus au-delà de la limite | ✅ | ⛔ |
| Télécharger | ✅ | ⛔ |
| Voir la source | ⛔ | ✅ |
| Copier | ⛔ | ✅ |
| Laisse lire la conversation | ⛔ | ✅ |

**Chacun sait exactement ce que l'autre ignore**, et lequel apparaît dépend de
l'endroit où l'on a cliqué — pas du fichier, pas de ce qu'on veut en faire.

> C'est la même faute qu'hier, d'un cran plus haut. Hier : **un geste, deux
> mécaniques**. Aujourd'hui : **un objet, deux écrans**. Et la conclusion
> d'hier vaut mot pour mot — *un signe de trop se voit, une mécanique de trop
> ne se voit pas.*

**Il n'en reste qu'un, et c'est le volet.** Trois raisons, dans l'ordre :

1. **Un fichier se lit à côté de ce qui en parle.** C'est toute la demande de
   kuchu : le fil à gauche, le document à droite. Une modale interdit
   précisément ça.
2. **La géométrie existe déjà.** L'Établi est un volet de droite, masquable,
   dans Discuter. Le visualiseur n'invente pas une place : il prend la sienne.
3. **La modale est réservée à ce qui exige une réponse** — une feuille de
   création, un accord. Assombrir le fond veut dire *« finissez ceci d'abord »*.
   Lire un document n'exige rien.

**L'Établi et le visualiseur sont le même volet à deux moments** : *parcourir*
et *regarder*. D'où le fil d'Ariane plutôt qu'une croix seule — on est allé
quelque part, on doit pouvoir revenir sans refermer.

---

## 2. La carte ne peut pas désigner le fichier qu'on veut ouvrir

`ARTIFACT_RE` n'accepte que `/artifacts/…`. Or **le travail ne se fait pas
là** : il se fait dans `web/`, dans le projet, dans le dossier où l'agent lit
et écrit.

Un agent qui vient d'écrire `web/PASSE-DESIGN-NOTIFICATIONS.md` ne peut pas en
poser la carte. Il écrit son chemin en toutes lettres dans la phrase, et **on
ne peut pas cliquer dessus** — c'est exactement le fichier qu'on voulait
ouvrir.

> C'est le cas de la capture d'écran de kuchu, en haut de cette conversation :
> les bandeaux qu'il montre désignent des fichiers **de son projet**, pas d'un
> dossier réservé.

**La carte désigne un chemin.** `REST.readFile` existe, sait déjà lire
n'importe quel chemin, sait déjà les images, la taille et la limite. Il n'y a
**aucune route à écrire** — il y en a une à retirer.

### Et `web/artifacts/` est le troisième dossier de trop

`web/captures/` a été condamné hier ; `web/artifacts/` est né le même jour,
avec la même forme : **une route neuve** (`/ulysse/artifact`), **une méthode**
(`sauver_artifact()`), **un dossier dans le produit**, **une balise dans le
texte**. Deux fichiers d'essai y dorment déjà — la preuve par l'usage que
personne n'y range rien de vrai.

`serve.py` sert `web/`. La règle S10 a fermé ce dossier parce que c'est du
**produit**, pas un espace de travail. Un fichier produit par l'agent a sa
place là où l'agent travaille : **le dossier de la session**.

### Une différence, et il faut être juste

La balise `[artifact: …]` **n'est pas** `[capture: …]`. La capture était
insérée par la page dans ce que la personne avait écrit, puis cachée à
l'affichage — un texte qu'on ajoute et qu'on masque. La balise d'artefact est
écrite par **l'agent, dans sa propre réponse** : c'est sa manière de dire
*« voici un fichier »*, et c'est légitime, comme un lien.

**Son défaut est ailleurs** : elle dépend de ce que l'agent pense à écrire.

---

## 3. Le volet ne défile pas

`.u-art-body` porte `flex:1` et `overflow-y:auto`. Son parent
`<aside class="u-art-panel">` **n'a aucune règle CSS** : il n'est pas un
conteneur flex, `flex:1` ne s'applique donc à rien, et la hauteur du corps
reste libre. Le volet, lui, coupe (`overflow:hidden`).

**Un document de six écrans est tronqué, sans barre de défilement.** Toutes les
passes de design en font six.

C'est le défaut de `#vdet`, dans la passe du Plan : du contenu posé sans son
enveloppe, qui perd le rembourrage et le défilement. Deuxième prise.

### Le fantôme d'une modale

Le script construit `<div class="u-art-backdrop">`. Aucune règle ne le décrit.
Et le commentaire de la feuille, trois lignes au-dessus, écrit :

> *« Insere apres .work dans #app ; en flex, .work retrecit et le viewer prend
> sa largeur. **Pas de backdrop masquant.** »*

**Les deux moitiés se contredisent par écrit.** C'est la trace d'un volet qui a
commencé sa vie en modale — et qui explique le §1 : `#artifactViewer` est né
comme un second `#sFile`, puis a changé d'avis à mi-course sans que le premier
disparaisse.

### Le troisième garde-fou n'a pas regardé

`svg("table")` rend `<path d="undefined"/>` : **la carte d'un `.csv` a une
icône vide.** Le produit a un test qui attrape exactement ça — et
`test_page.js` ne contient pas une seule fois `ulysse-artifact.js`.

> **Le garde-fou existe, et le fichier neuf est entré à côté.** C'est le vrai
> enseignement de ce point : ce n'est pas une icône qui manque, c'est un
> fichier qui est hors du champ des vérifications.

---

## 4. Ce que la carte doit dire

C'est la demande précise de kuchu, et elle mérite d'être prise au mot.

**Aujourd'hui** : une icône, un nom, et *« généré · artefact »*. Cette
deuxième ligne est vraie de **toutes** les cartes, donc elle n'en distingue
**aucune**. Une ligne qui ne varie jamais n'est pas une information, c'est une
décoration.

**À la place, la seule chose qui varie et qu'on cherche : où il est.**

> 📄 **PASSE-DESIGN-NOTIFICATIONS.md**
> …/Projet Ulysse/web · 6,2 ko                          **Ouvrir ›**

**Tronqué par la tête, jamais par la queue.** La fin d'un chemin dit où l'on
est ; le début dit ce qu'on savait déjà. Un chemin coupé à l'envers ne montre
que la partie inutile.

### Une seule action sur la carte

La carte porte **Ouvrir**, et rien d'autre. Source, copie, téléchargement :
tous dans le visualiseur.

> **Dans le fil, une carte est une mention — pas un panneau de commandes.**
> C'est la règle qu'on tient depuis le premier jour, et c'est elle qui a fait
> replier l'état réseau dans le kebab et rétrécir la gélule Chat/Cowork.

### Et le bouton « Google Drive » de la capture ?

Dans Cowork il dit **où le fichier va s'ouvrir** — ailleurs, dans une autre
application. Chez Ulysse, il s'ouvre **dans Ulysse** : le mot juste est donc
« Ouvrir », et le code actuel l'avait déjà trouvé. C'est bon, ça reste.

**Ouvrir avec l'application du système** est un autre geste, et il demanderait
une route qui exécute une action sur la machine. Je ne le propose pas dans
cette passe : ce serait rouvrir une frontière le jour où on en referme deux.

---

## 5. Ce que je ne propose pas — la carte déduite de l'outil

La balise dépend de ce que l'agent **pense à écrire**. Un fichier écrit sans
balise n'a pas de carte, et rien ne le signale.

Ce que l'agent **a fait** est plus sûr que ce qu'il **a dit** : le fil affiche
déjà les outils appelés, avec `x.args` et `x.result`.

**Mais je ne sais pas si le chemin écrit en sort de façon fiable**, et je ne
vais pas le supposer — c'est la faute que les projets v1 ont payée cinq fois
sur six.

> **À vérifier avant tout dessin** : un `tool.complete` d'écriture porte-t-il
> le chemin du fichier, sous une forme stable ? Si oui, la carte devient
> automatique et la balise n'est plus qu'un raccourci. **Si non, la balise
> reste, et c'est très bien** — elle marche.

Dans le doute, on garde ce qui marche. Même prudence que pour `livrable`,
`auto`, et la pastille de vision.

---

## 6. Contrat d'interface

`#sFile`, `fileBody`, `fClose` sont au contrat : **ils ne partent qu'avec
l'accord du contrat**, pas au détour de cette passe. Ce que je propose, c'est
que `showFile()` **ouvre le volet** au lieu de la feuille — les `id` peuvent
survivre à leur modale le temps qu'on tranche.

**Classes nouvelles**, préfixées `f-` : `f-carte` (avec `absent` en classe
jointe), `f-ic`, `f-txt`, `f-nom`, `f-ou`, `f-go`, `f-fil`, `f-ici`,
`f-outils`.

**Reprises telles quelles** : `.u-art`, `.u-art-viewer`, `.u-art-head`,
`.u-art-body`, `.u-md`, `#app.artifact-split`. Le volet est bon ; c'est son
`<aside>` qui n'a pas de règle.

**À retirer** : `.u-art-backdrop` (le script le fabrique, la feuille écrit
qu'il ne doit pas exister), la classe `.on` de `closeArtifactViewer()`, et —
si le §2 est appliqué — la route `/ulysse/artifact`, `sauver_artifact()`,
`web/artifacts/` et ses deux fichiers d'essai.

**À ajouter au garde-fou** : `ulysse-artifact.js` dans le champ de
`test_page.js`.

### Par quel geste on atteint chaque état

| État | Geste |
|---|---|
| Carte dans le fil | demander un fichier à l'agent |
| Carte d'un fichier du projet | lui demander d'écrire dans `web/` — **impossible aujourd'hui** |
| Volet ouvert, rendu | cliquer la carte |
| Volet ouvert, source | le second bouton du fil d'Ariane |
| Volet tronqué | ouvrir n'importe quelle passe de design — six écrans |
| Modale (à faire disparaître) | cliquer un fichier dans l'Établi ou les Livrables |
| Icône vide | demander un `.csv` |

**Les sept s'atteignent dans l'aperçu**, et les trois défauts y sont
reproduits par le vrai code, pas décrits : le `d="undefined"` est constaté en
jsdom, et l'aside sans règle est recopié tel quel.

---

## 7. La remarque, et elle n'est plus une observation isolée

Hier j'écrivais que c'était **la première fois** qu'une fonction arrivait avant
son dessin. C'est la **deuxième en deux jours**, et les deux fois le défaut est
le même : *un second chemin pour une chose qui en avait déjà un.*

La question qui l'aurait évité tient en huit mots — **« qu'est-ce que ça a de
différent de l'existant ? »** — et elle ne se pose pas toute seule quand on
code, parce qu'en codant on regarde ce qu'on ajoute. En dessinant, on regarde
ce qu'il y a déjà.

> Ce n'est pas un reproche : les deux fonctions marchent, et la seconde répond
> à une vraie demande. C'est juste le seul argument qu'on ait pour l'ordre —
> et il vient d'être vérifié deux fois de suite, par l'exception.
