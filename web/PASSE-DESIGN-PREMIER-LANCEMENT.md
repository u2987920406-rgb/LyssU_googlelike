# Passe de design — le premier lancement (`#first`)

Le seul écran du produit qui n'avait aucun design : il appartenait à
l'installateur, et l'installateur ne l'a jamais dessiné.

Aperçu : `apercu-premier-lancement.html` — cinq cas jouables.

---

## 1. Tout son style dormait déjà dans `ulysse.css`

`#first`, `.firstcard`, `.defs`, `.defl` (`.dd` / `.dn` / `.dt`), `.lead`,
`.q`, `.ex2` / `.exl`, `.cout`, `.lienr` — tous présents depuis la maquette,
**aucun employé**. On ne dessine rien de neuf.

La maquette avait même deux états : `first1()` (« Tout est prêt ») et
`firstVide()` (« Il manque une chose »). La structure est bonne. Ce qui ne va
pas, c'est ce qu'elle affirme.

---

## 2. Ce que la maquette affirmait sans pouvoir le savoir

Décidé avec kuchu : **seulement ce qui est vérifié.**

Trois lignes sortent, faute d'endpoint qui les dise :

| Ligne de la maquette | Pourquoi elle sort |
|---|---|
| « Sept assistants, installés et décrits » | le nombre est faux et invérifiable ; `/api/skills` en donne 99 |
| « Votre coffre de notes est relié » | rien dans Hermès ne parle d'un coffre de notes |
| « Rien ne part sur Internet sans vous » — « la mise en ligne est **éteinte** » | aucun réglage ne correspond ; `approvals.mode` est autre chose |

C'est la règle STU-1, appliquée à l'écran qui l'engage le plus : **c'est la
première phrase qu'Ulysse adresse à quelqu'un.** S'il commence par affirmer
quatre choses dont trois qu'il ne sait pas, tout le reste devient suspect.

### Les cinq qui restent, avec leur source

| Vérification | Appel |
|---|---|
| Hermès répond | `GET /api/status` |
| L'agent est joignable | handshake `/api/ws` |
| Les compétences sont chargées | `GET /api/skills` (le compte réel) |
| Le gateway | `GET /api/status · gateway_running` |
| Aucun secret dans cette page | vérifié à la construction |

**Chaque ligne porte sa source à l'écran**, en 11 px sous le texte. Une
pastille verte sans source est une affirmation ; avec sa source, c'est un
constat. C'est ce qui sépare un diagnostic d'une liste rassurante.

---

## 3. Une pastille qui n'a pas encore répondu n'est pas verte

`.defl .dd` n'a que deux états dans la maquette : vert, ou gris (`.off`).
C'était assez pour une liste écrite d'avance. Ici chaque ligne attend le
réseau, et il existe un troisième état — **celui d'avant**.

Le relais signale exactement ce défaut au Terminal : « gateway arrêté »
affiché tant que `/api/status` n'a pas répondu. *« Arrêté » n'est pas « je ne
sais pas ».* Sur un écran d'accueil ce serait pire : on accuserait une
installation qui va très bien, dès la première seconde.

Quatre états, donc : **en attente** (gris qui respire) · **vert** · **ambre**
(ça marche sans) · **rouge** (ça ne marche pas).

Et un compte au-dessus de la liste — « Vérifié : 80 % » — pour qu'on sache si
l'écran a fini de parler.

---

## 4. Le cas dégradé n'est pas unique

`firstVide()` ne prévoyait qu'une panne : pas de fournisseur. Il y en a trois,
et elles n'appellent pas la même réponse :

| Cas | Ce que l'écran fait |
|---|---|
| **Hermès muet** | « Hermès ne répond pas. » La commande de lancement est **écrite à l'écran**, puis copiable — même règle qu'au Terminal : on ne copie pas ce qu'on n'a pas vu. |
| **Gateway arrêté** | « Presque tout est prêt. » Une ligne ambre, et on dit ce qu'on perd : *les webhooks et les canaux distants* — pas plus. |
| **Profil absent** | Tout est prêt, mais `GET /api/memory` dit que `user.md` et `soul.md` n'existent pas. C'est le seul endroit où l'écran demande quelque chose. |

> **Ulysse ne lance pas Hermès à votre place.** Il donne la commande. C'est la
> même frontière qu'au Terminal : il n'exécute rien que vous n'ayez lancé.

---

## 5. On peut toujours entrer

Dans les cinq cas, il existe un chemin vers l'application — « Entrer sans
attendre », « Entrer quand même », « Plus tard, je verrai ».

Un écran d'accueil qui **retient** ment sur ce qu'il est : ce n'est plus un
accueil, c'est une barrière. Et la première chose qu'on apprendrait d'Ulysse
serait qu'il faut le contourner.

La seule action mise en avant (`.validate`) est celle qui sert vraiment :
écrire son profil quand il manque, ou commencer quand tout va bien.

---

## 6. La dette de profil, reprise de la maquette

Le bloc `.avert` + `.ex2` est repris presque tel quel — il est excellent, et
c'est le seul endroit du produit qui **montre** la différence entre un profil
générique et un profil écrit :

> **Sans vous** — « Je mets mon savoir-faire à votre service. » *Vrai pour tout
> le monde, donc utile à personne.*
> **Avec vous** — la même phrase, avec votre métier, vos mots, et ce que vous
> ne voulez pas qu'on écrive à votre place.

Deux différences : les fichiers nommés viennent de `GET /api/memory`
(`builtin_files` avec `exists === false`), pas d'une supposition ; et le texte
dit *« n'existe pas encore »*, pas *« contient l'exemple livré »* — c'est ce
que l'endpoint permet d'affirmer.

C'est la même dette que `majDette()` affiche déjà dans l'application. **Le
premier lancement est simplement le premier endroit où on la voit.**

---

## 7. Ce que le code doit faire

1. Rétablir `<section class="scene" id="first">` avec `.mark` et
   `#firstcard`, avant `#app`.
2. Au démarrage : lancer les quatre appels **en parallèle**, afficher la carte
   immédiatement avec toutes les pastilles en attente, et les résoudre à mesure.
   Ne jamais attendre que tout soit revenu pour afficher.
3. Décider de l'écran suivant : si `/api/status` échoue → cas « muet » ; sinon
   la carte de constat.
4. **N'afficher `#first` qu'au premier lancement.** Reste à décider comment on
   le sait — un marqueur côté `serve.py`, ou l'absence des fichiers de mémoire.
   `localStorage` est exclu : le produit n'en utilise nulle part.

### Contrat d'interface

`first` et `firstcard` **entrent** au §2.1 — ils étaient dans la maquette,
jamais dans le produit, donc jamais dans le contrat.

Attributs de l'aperçu, à renommer ou reprendre : `data-go` (la sortie),
`data-copy` (la commande). Les classes nouvelles sont préfixées `f-` :
`f-att`, `f-ko`, `f-warn`, `f-src`, `f-compte`, `f-pied`, `f-cmd` — aucune ne
recouvre la maquette.

---

## 8. Ce qui reste à trancher

- **Comment sait-on que c'est le premier lancement ?** (voir §7.4)
- **Faut-il pouvoir revenir sur cet écran ?** Il est le seul récapitulatif de
  l'installation ; une entrée dans Réglages › Avancé le rendrait utile deux
  fois. Je ne le propose pas d'office : ça ferait un deuxième endroit qui dit
  ce que le point d'état du kebab dit déjà.
