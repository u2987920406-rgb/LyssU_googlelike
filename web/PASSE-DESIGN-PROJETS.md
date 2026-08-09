# Passe de design — créer un projet / coffre

Dessiné **avant** le branchement, comme les garde-fous d'écriture. C'est la
leçon qu'on a tirée à deux : ce genre de décision se prend avant qu'une ligne
de code n'existe.

Aperçu : `apercu-projets.html` (autonome, cinq cas).

---

## 0. Ce que le relevé a trouvé d'abord, et qui change l'ordre des choses

**Le produit n'appelle pas `projects.tree`.**

`drawProjets()` groupe les sessions par `cwd` — le commentaire du code le dit
lui-même : *« Hermès n'a pas de notion de projet Ulysse. »* C'était vrai quand
il a été écrit. Ça ne l'est plus : `projects.tree` renvoie `id, label, path,
color, icon, sessionCount, lastActive, repos, previewSessions`.

Il y a donc **deux notions incompatibles** dans le produit :

| | |
|---|---|
| Ce qu'on **affiche** | un regroupement déduit d'un `cwd`, sans existence propre |
| Ce qu'Hermès **a** | un objet nommé, coloré, avec un identifiant |

**On ne peut pas créer un objet dans une liste qui ne le montre pas.** Le
premier point de cette passe n'est donc pas un écran : c'est
**brancher `projects.tree`**. La création vient après, et elle est simple.

> Tant que la liste est déduite, « créer un projet » ne peut vouloir dire que
> « créer un dossier » — et ce n'est pas la même chose. Un dossier n'a ni nom
> propre, ni couleur, ni mémoire.

---

## 1. La phrase de la maquette, enfin affichée

`.warnbox` est dans `ulysse.css` depuis la maquette. **Elle n'a jamais servi.**
Elle porte pourtant la décision de conception la plus lourde du produit :

> « Chaque projet a **son propre coffre**, **son bac à sable** et **sa
> mémoire**. Qui vous êtes descend dans chacun ; ce qu'un projet apprend n'en
> sort jamais tout seul. »

C'est ce qui distingue un projet d'un dossier, et c'est ce qui justifie qu'on
puisse en créer.

> ⚠ **Ne l'afficher que si le cloisonnement est réel côté Hermès.** Une phrase
> qui promet un cloisonnement inexistant est le pire mensonge possible dans ce
> produit : elle porte sur ce qui **sort** d'un projet. C'est à vérifier avant
> de l'écrire à l'écran — comme la frontière `soul.md`, qui s'est révélée plus
> étroite que ma première formulation.

---

## 2. Un seul champ engage

| Champ | Engage ? |
|---|---|
| Le nom | non — il se change |
| La couleur | non — elle se change |
| **Le dossier** | **oui.** C'est là que l'agent écrira, et ce qui y est déjà y restera |

Le dossier est donc le seul montré **en entier**, en monospace, et le seul dont
on dit **ce qu'il contient déjà** :

- *dossier vide* → « Il sera créé s'il n'existe pas encore. » Rien de plus.
- *dossier occupé* → « Ce dossier contient déjà 340 fichiers. Ulysse pourra les
  lire, et écrire à côté. Rien n'est effacé — mais un dossier occupé est un
  dossier où une erreur se voit moins. »

**On ne devine pas, on regarde.** Le second cas n'est pas interdit : il est
dit. C'est la même règle que partout — distinguer sans empêcher.

> La couleur n'est pas décorative : c'est elle qu'on verra dans la liste, et
> c'est elle qui remplace la pastille tirée au rang (voir
> `PASSE-DESIGN-LISTES.md` §6). Six couleurs, celles des familles d'outils du
> Plan — le produit n'a pas besoin d'une septième palette.

---

## 3. On dit ce qu'on fabrique, avant de le fabriquer

Trois lignes, dans la feuille de création, avant le bouton :

| | |
|---|---|
| **Un bac à sable** | le dossier. L'agent y travaille, et n'en sort pas de lui-même |
| **Un coffre** | ce que le projet produit et garde. Il ne voit pas celui d'un autre |
| **Une mémoire** | ce qu'Ulysse retient de ce projet-ci |

On ne découvre pas un coffre après coup. Et ces trois lignes sont la version
détaillée de la `.warnbox` — même contenu, au moment où il devient concret.

---

## 4. Supprimer suit la doctrine, sans exception

> « Ce qui porte des données va à la corbeille, et y reste. »

Un projet porte des données. Il ne part donc **pas** sur place avec un
« Annuler » de six secondes : il va à la corbeille, **trente jours**.

La feuille de confirmation dit trois choses, et **l'ordre compte** :

1. Le projet va à la corbeille — trente jours, tout revient.
2. **Votre dossier n'est pas touché.** ← *c'est ce qui compte le plus, donc
   c'est dit tôt*
3. Les conversations restent dans Travaux — elles perdent leur rattachement,
   pas leur contenu.

La corbeille reprend `.trashbtn`, `.trashnote` et `.pcard.gone` de la
maquette — **aucun des trois n'avait servi**.

> **L'effacement définitif est le seul écran qui demande deux fois** (doctrine
> de la maquette). Il n'est pas dessiné ici : il n'a lieu que depuis la
> corbeille, et il mérite sa propre passe si vous le branchez.

---

## 5. Ce qu'il faut vérifier avant de coder

Dans cet ordre :

1. **`projects.tree` d'abord.** La liste doit montrer de vrais projets avant
   qu'on puisse en créer un.
2. **Y a-t-il un `projects.create` ?** Je ne l'ai pas vu passer dans les
   relais. S'il n'existe pas, la création n'est pas une question de design mais
   d'API — et l'écran attend.
3. **Le cloisonnement de la mémoire est-il réel ?** (voir §1) Sans lui, la
   `.warnbox` ne doit pas être affichée.
4. **Que devient un projet supprimé côté Hermès ?** La corbeille de trente
   jours suppose un état « supprimé » qui se garde. S'il n'existe pas, il faut
   le tenir côté `serve.py` — ou renoncer à la corbeille et demander deux fois
   d'emblée.
5. **`repos` et `previewSessions`** sont renvoyés par `projects.tree` et ne
   sont employés nulle part. À regarder : ils disent peut-être quelque chose
   qu'on affiche mal en le déduisant.

---

## 6. Contrat d'interface

`pProjets` et `projets` sont au contrat et inchangés. `trashBtn` et `newProj`
existent **dans la maquette** et jamais dans le produit : ils y entrent.

**Classes nouvelles**, préfixées `j-` : `j-ic`, `j-champ`, `j-in`, `j-chemin`,
`j-etat`, `j-cols`, `j-col`, `j-trois`, `j-acts`.

**Réemployées de la maquette, jamais servies jusqu'ici** : `.warnbox`,
`.trashbtn`, `.trashnote`, `.pcard.gone`, `.dangerlink`.

Vérifié en jsdom sur les cinq cas, sans erreur — et **aucun bouton mort** :
c'est la règle que j'applique depuis que vous en avez trouvé un qui avait
traversé deux de mes passes.
