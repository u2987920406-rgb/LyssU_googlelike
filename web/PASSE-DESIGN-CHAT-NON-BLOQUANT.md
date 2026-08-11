# Passe de design — la Discussion ne doit pas bloquer

> Demandée par kuchu le 2026-08-11 au soir : *« même pendant un chat, on peut
> demander des tableaux, des comptes rendus en `.md`, des graphiques. Ça
> n'impacte rien à la dangerosité. »*
>
> **Il a raison, et la restriction actuelle repose sur une phrase fausse que
> j'ai écrite moi-même ce matin.**

Écrite **avant** de coder, cette fois. Les deux dernières fonctions sont
arrivées avant leur dessin et les deux ont créé un second chemin ; celle-ci
attend son tour.

---

## 0. Constaté / supposé

**Constaté**, en lisant le code — chaque point est vérifiable :

- **le proxy transmet le corps INTACT.** `hermes_cli/proxy/server.py` :
  *« Forward body verbatim »*. Il échange l'en-tête `Authorization` et
  transmet le JSON tel quel. Il n'inspecte pas `messages`, il ne retire pas un
  `content` en tableau. **Un contenu multimodal OpenAI passe donc sans être
  touché** ;
- `ulysse-app.js` écrit pourtant, en commentaire : *« en Discussion le proxy
  n'envoie que du texte »*. **C'est faux.** C'est une supposition, écrite
  aujourd'hui, et elle a produit un refus ;
- **`PROXY_MAX_TOKENS` vaut 800** (`ulysse-config.js:67`). C'est un plafond
  dur sur la réponse : environ 3 200 caractères ;
- **`finish_reason` n'est lu nulle part.** Zéro occurrence dans tout le
  produit. Une réponse coupée par le plafond s'affiche **comme si elle était
  complète** ;
- en Discussion il n'y a **ni session ni outil** : `sendPure()` pousse dans
  `pureHistory` et appelle `/proxy/chat`. Le modèle ne peut rien écrire sur le
  disque, et ce n'est pas une bride — c'est la définition du mode ;
- les blocs de code sont rendus depuis ce soir : `<pre class="u-md-c">`.

**Supposé** : que le modèle branché derrière le proxy accepte les images. Ça
dépend de lui, pas du mode — et c'est traité au §6 sans le supposer.

---

## 1. La frontière est au mauvais endroit

Aujourd'hui la ligne passe entre **« avec outils »** et **« sans outils »**.
C'est une frontière de plomberie, et elle interdit des choses inoffensives.

**Elle devrait passer entre ce qui reste dans la page et ce qui touche la
machine.**

| | Discussion | Cowork |
|---|---|---|
| Fabriquer un tableau, un rapport, un SVG | **oui** | oui |
| L'emporter sur son disque | **oui — en cliquant** | oui |
| Écrire un fichier sans qu'on l'ait demandé | non | oui, avec accord |
| Lancer une commande, modifier du code | non | oui, avec accord |

**Fabriquer n'a jamais été le danger.** Le danger, c'est d'écrire quelque part
sans qu'on l'ait demandé. Un texte dans une bulle n'écrit nulle part ; il
devient un fichier au moment où **la personne clique**, et ce clic *est*
l'accord. Il n'y a rien à approuver, parce qu'il n'y a rien à risquer.

> C'est la même règle que partout ailleurs ici : **on n'interdit pas un geste
> parce qu'il ressemble à un geste dangereux.** On regarde ce qu'il fait.

---

## 2. Le plafond de 800 tokens, et la coupure muette

**C'est le vrai obstacle, et il n'a rien à voir avec une permission.**

On ne fabrique pas un compte rendu en 800 tokens. Un CSV de trente lignes non
plus. Poser un bouton « Télécharger » au-dessus de ce plafond donnerait un
fichier **tronqué en silence** — on aurait construit une promesse sur une
coupure.

Et la coupure est déjà là, aujourd'hui, pour toutes les réponses un peu
longues :

> **`finish_reason` n'est lu nulle part.** Le modèle dit « j'ai été coupé »
> à chaque réponse trop longue, dans le champ prévu pour ça, et le produit
> n'écoute pas. La bulle s'arrête au milieu d'une phrase et rien ne le dit.

**Deux décisions, dans cet ordre :**

1. **Dire la coupure. Toujours, et indépendamment du reste.** C'est une
   correction d'honnêteté, pas une fonctionnalité : un écran qui montre un
   texte tronqué comme un texte complet ment. Elle vaut même si rien d'autre
   de cette passe n'est fait.
2. **Relever le plafond par défaut**, parce que 800 dément la promesse du
   mode. Il reste un réglage de `ulysse-config.js` — Ulysse n'impose rien —
   mais son défaut doit permettre ce que l'écran laisse espérer.

> ⚠ **Ne pas retirer le plafond.** Un plafond absent n'est pas une liberté,
> c'est une facture qu'on ne voit pas venir. Il doit exister, être réglable,
> et **se faire entendre quand il agit**.

---

## 3. Le fichier généré : ce qu'on montre, et ce qu'on ne montre pas

Un bloc de code dans une réponse **est déjà un fichier qui s'ignore**. Il a un
contenu, souvent une langue (` ```csv `), parfois un nom.

**On ajoute une seule chose : de quoi l'emporter.**

```
┌──────────────────────────────────────────┐
│ csv                              ⤓       │   ← discret, au coin du bloc
├──────────────────────────────────────────┤
│ mois,ventes                              │
│ janvier,1240                             │
└──────────────────────────────────────────┘
```

**Pas de carte.** On vient de passer la journée à retirer les seconds signes :
la carte de fichier désigne un fichier **qui existe sur le disque** et qu'on
va lire. Ici il n'y a pas de fichier — il y a un texte qu'on peut emporter.
Deux choses différentes, deux apparences différentes. Une carte dirait
« ouvrir », et il n'y a rien à ouvrir.

### La règle ne dépend PAS du mode

Un bloc de code est téléchargeable **en Discussion comme en Cowork**. Le rendre
téléchargeable seulement d'un côté serait une seconde mécanique pour la même
chose — la faute exacte du collage et des deux visualiseurs.

### Le nom du fichier

Par ordre : ce que l'agent écrit après la clôture (`csv ventes-2026.csv`),
sinon la langue seule (`extrait.csv`), sinon `.txt`. **Jamais un nom inventé
qui ressemble à un vrai** : mieux vaut `extrait.csv` qu'un `rapport-final.csv`
que personne n'a demandé.

### Ce qui n'est pas un bloc de code

Un **tableau markdown** est déjà un tableau à l'écran. Le rendre téléchargeable
en CSV serait utile — mais c'est une **conversion**, pas un transport, et une
conversion peut se tromper (virgules, guillemets, cellules vides).
**Pas dans cette passe.** On commence par ce qui ne peut pas mentir : les
octets qui sont déjà là.

---

## 4. L'image collée en Discussion

**Le refus posé ce matin est retiré.** Il reposait sur la phrase fausse du §0.

L'image part dans le contenu multimodal OpenAI, que le proxy transmet intact.
Ce qui décide, c'est le modèle.

**Mais il n'y a pas de filet, et il faut le dire.** En Cowork, si le modèle ne
voit pas, Hermès fait **décrire** l'image par un autre modèle et préfixe la
description — vérifié en direct le 2026-08-11, l'agent a répondu « 42 ». En
Discussion il n'y a pas d'agent : **ce filet n'existe pas**, et un modèle sans
vision échouera.

> **On laisse passer, et on dit la vérité si ça échoue.** Un refus préventif
> interdit un geste qui marche ; une erreur honnête n'interdit rien. C'est
> exactement la même prudence qu'au §4 de la passe du collage : ne pas
> annoncer d'avance ce qu'on ne sait pas.

**Et surtout, pas d'ouverture de session dans le dos.** Le refus de ce matin
protégeait une chose réelle : `attacherFichier()` appelle `ensureSession()`,
donc joindre en Discussion ouvrait une session Cowork sans le dire. Le collage
en Discussion ne doit **pas** passer par `image.attach_bytes` — il n'y a pas de
session à nourrir. Il part **dans le message**, comme du contenu.

**C'est donc bien deux chemins, et c'est légitime cette fois** : Cowork nourrit
une session, Discussion compose un message. La différence n'est pas dans le
geste, elle est dans ce qu'il y a en face.

---

## 5. Ce qui reste interdit, et pourquoi ce n'est pas une bride

En Discussion, l'agent ne peut ni écrire sur le disque, ni lancer une commande,
ni modifier du code. **Ce n'est pas une restriction qu'on pourrait lever** :
il n'y a pas d'agent derrière, seulement un modèle. Il n'y a rien à débrider.

Ce qu'il faut corriger, c'est **ce que l'écran en dit**. Le libellé actuel —
*« le modèle seul — il répond, il n'agit pas et ne touche à rien »* — est vrai
mais s'entend comme une punition. Il dira ce que le mode **permet**, pas
seulement ce qu'il refuse.

Et la phrase qui apparaît quand on joint un fichier — *« les pièces jointes ne
servent qu'en Cowork »* — devra dire **quoi faire à la place**, pas seulement
constater.

---

## 6. Ce que je ne propose pas

- **Joindre un fichier à lire en Discussion.** On pourrait coller le contenu
  d'un `.md` court dans le message. C'est tentant et ça marcherait — mais ça
  ouvre une question de taille, de binaire, de troncature, et **kuchu ne l'a
  pas demandé**. À part.
- **Convertir un tableau markdown en CSV** — voir §3.
- **Écrire le fichier sur le disque depuis la Discussion.** Ce serait franchir
  la frontière du §1 le jour où on la trace.

---

## 7. Contrat d'interface

**Inchangé** : `#reply`, `#jointes1`, `.u-modeseg`, `pureHistory`, `sendPure`.

**Classe nouvelle** : `.u-md-dl` — le bouton d'emport, dans le coin d'un
`<pre class="u-md-c">`. Le bloc de code garde sa classe ; on ne l'enveloppe
que si c'est nécessaire au positionnement.

**Nouveau, côté état** : la coupure. Un tour porte `coupe: true` quand
`finish_reason === "length"`, et la bulle le dit sous le texte.

**À retirer** : le refus de `collerCapture()` en mode `pur`, et le commentaire
qui l'explique par une phrase fausse.

### Par quel geste on atteint chaque état

| État | Geste |
|---|---|
| Bloc téléchargeable | demander un CSV, un `.md`, un SVG — dans les deux modes |
| Nom pris de la clôture | l'agent écrit ` ```csv ventes.csv ` |
| Nom par défaut | l'agent écrit ` ```csv ` seul |
| Réponse coupée | demander un long document en Discussion (plafond à 800) |
| Image vue | coller une image, modèle avec vision |
| Image refusée par le modèle | coller une image, modèle sans vision |

---

## 8. La remarque

Cette passe a été écrite avant le code, et **elle a payé son écriture avant
d'être finie** : j'allais construire le téléchargement au-dessus d'un texte
coupé à 800 tokens sans que rien ne le dise. Le bouton aurait marché. Le
fichier aurait été tronqué. Et personne n'aurait su pourquoi, parce que le
champ qui le dit n'est lu nulle part.

> On ne voit pas ça en codant, parce qu'en codant on regarde ce qu'on ajoute.
