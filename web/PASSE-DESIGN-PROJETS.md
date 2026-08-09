# Passe de design — les projets

> **Réécrite le 2026-08-09 (v2), après les cinq vérifications du code contre
> le vrai Hermès.** Trois faits ont changé le dessin, et l'un contredisait une
> prémisse de ma v1. La v1 est résumée en §7, pour qu'on sache ce qui a été
> abandonné et pourquoi.

Aperçu : `apercu-projets.html` (autonome, cinq cas).

---

## 0. Les trois faits qui commandent

Constatés contre Hermès en marche, pas supposés.

| | |
|---|---|
| ✅ **`projects.create` existe** | et toute la famille : `list`, `get`, `update`, `archive`, `delete`, `add_folder`, `set_primary`… |
| ⚠ **`create` n'écrit rien sur le disque** | il insère une ligne et enregistre des chemins. **On ne crée pas un dossier : on en désigne un** |
| ⛔ **Le cloisonnement de la mémoire n'existe pas** | `<hermes_home>/memories/MEMORY.md` et `USER.md` : deux fichiers, globaux, sans dimension projet |
| ⚠ **Rien n'expire** | `archive` pose un drapeau, `restore` le retire. Aucune tâche ne purge |
| ⚠ **`projects.tree` rend trois espèces** | et `projects.list` en rend **zéro** aujourd'hui |

---

## 1. Trois espèces cohabitent dans la même liste

C'est le vrai sujet de design, et il vient d'un fait : `projects.tree` mélange

| Espèce | Ce qu'elle a | Ce qu'on peut lui faire |
|---|---|---|
| **Le vrai projet** | nom, couleur, icône, id | renommer, colorer, archiver |
| **Le dossier déduit** (`isAuto`) | rien — **son id EST son chemin** | l'ouvrir, en faire un projet |
| **« Home »** (`isNoProject`) | rien, et ce n'est pas un lieu | rien |

**Trois apparences, donc, et pas une étiquette sur trois cartes identiques.**

- Le **vrai projet** garde la carte pleine, sa pastille colorée, ses trois
  actions.
- Le **dossier déduit** a une carte au contour, une pastille grise et vide, un
  nom en romain. Sa seule action propre : **« En faire un projet »**. On ne lui
  propose ni « renommer » ni « archiver » — ce serait afficher une commande qui
  n'agit pas, et il faudrait cliquer pour comprendre pourquoi.
- **« Home » n'est pas une carte.** C'est le *reste* : une ligne en pied de
  liste, *« 39 conversations n'appartiennent à aucun dossier »*. Lui donner
  l'apparence d'un projet en ferait un projet qu'on ne peut ni régler ni
  supprimer.

Et deux sections, parce que la différence se lit avant les actions :
**« Vos projets »** puis **« Dossiers où vous avez travaillé »**.

> **L'état réel de kuchu est le cas à dessiner en premier** : zéro projet, trois
> dossiers déduits. La section « Vos projets » est donc vide, et elle dit
> comment se remplir — *« un projet se fabrique à partir d'un dossier où vous
> avez déjà travaillé — ci-dessous »*.

---

## 2. `.warnbox` ne doit pas être affichée — mais se taire ne suffit pas

Elle disait : *« ce qu'un projet apprend n'en sort jamais tout seul »*.
**C'est faux.** Le code l'a vérifié : une seule mémoire, globale.

C'est le piège `soul.md`, deuxième prise. Et ma v1 le nommait elle-même :
*« une phrase qui promet un cloisonnement inexistant porte sur ce qui sort d'un
projet »*. Elle avait raison sur le risque, et elle allait quand même l'écrire.

**Mais l'omettre ne suffit pas.** Quelqu'un qui voit des projets séparés
*suppose* que ce qu'il y dit y reste. Le silence laisserait croire exactement
ce que la phrase disait.

On garde donc `.warnbox` — le composant — et on y met **l'inverse**, une fois,
en tête de liste :

> Un projet range **un dossier et ses conversations**. En revanche, **ce
> qu'Ulysse retient est commun à tous** : la mémoire est un seul fichier, elle
> ne se cloisonne pas par projet.

Et la feuille de création le répète là où ça compte, en troisième ligne de
« ce que ça change » : *« La mémoire, elle, reste commune. »*

---

## 3. « Ranger en projet », pas « Créer un projet »

`create` n'écrit rien sur le disque. « Créer un projet » laissait croire qu'on
fabrique un dossier ; on **désigne** un dossier qui existe déjà.

Tout le vocabulaire suit : le bouton de la barre dit **« Ranger un dossier en
projet »**, la feuille aussi, et son premier champ n'est plus le nom mais **le
dossier** — parce que c'est lui qui existe d'abord.

Le nom vient ensuite, prérempli avec celui du dossier. La couleur en dernier.

> Ma v1 ordonnait nom → dossier → couleur, et disait « il sera créé s'il
> n'existe pas encore ». Les deux étaient faux pour la même raison : je croyais
> qu'on partait de rien.

---

## 4. Archiver, pas mettre à la corbeille

`archive` pose un drapeau ; `restore` le retire. **Rien n'expire.**

« Trente jours » aurait été une promesse qu'Hermès ne tient pas — et
« corbeille » suggère une échéance même sans la nommer. Le mot juste est
**archiver** : on ne jette pas, on range.

Ce qui se dit, et l'ordre compte :

1. Il sort de la liste — et revient quand vous voulez, **sans limite de temps**.
2. **Votre dossier n'est pas touché.**
3. Les conversations restent dans Travaux.

> C'est plus rassurant que trente jours, et c'est vrai. Les deux à la fois,
> pour une fois.

---

## 5. Ce qui reste à trancher, et qui n'est pas du design

- **`repos` et `previewSessions`** sont pleins et ignorés. `previewSessions`
  (3 sessions par projet) donnerait une carte plus vivante — mais ça demande
  une passe à soi, pas un ajout en passant.
- **`projects.for_cwd`** existe : Discuter pourrait savoir dans quel projet il
  se trouve. C'est peut-être plus utile que tout le reste de cette passe.

---

## 6. Contrat d'interface

`pProjets` et `projets` inchangés. `trashBtn` et `newProj` viennent de la
maquette et entrent au contrat — `trashBtn` porte désormais « Archivés ».

**Classes nouvelles**, préfixées `j-` : `j-ic`, `j-vide`, `j-auto`, `j-rien`,
`j-home`, `j-champ`, `j-in`, `j-chemin`, `j-etat`, `j-cols`, `j-col`,
`j-trois`, `j-acts`.

**Réemployées de la maquette, jamais servies** : `.warnbox` (avec un autre
texte), `.trashbtn`, `.trashnote`, `.pcard.gone`, `.dangerlink`.

Vérifié en jsdom sur les cinq cas, sans erreur — **aucun bouton mort**, et
aucune action de projet proposée sur un dossier déduit.

---

## 7. Ce que la v1 disait, et qui est abandonné

Pour mémoire, et pour qu'on ne le réintroduise pas :

| v1 | Pourquoi c'est tombé |
|---|---|
| « `projects.tree` montre de vrais projets » | il rend surtout des dossiers déduits, et `list` en rend zéro |
| « Créer un projet » | `create` n'écrit rien : on désigne, on ne crée pas |
| « Il sera créé s'il n'existe pas » | idem |
| `.warnbox` affichée telle quelle | la mémoire n'est pas cloisonnée |
| « corbeille, trente jours » | rien n'expire |

Cinq points sur six venaient de la même erreur : **j'ai supposé ce que l'API
faisait au lieu de le demander.** C'est la troisième fois dans ce projet, et
les trois fois le code l'a rattrapé en allant lire.

---

## 8. Les dossiers imbriqués (ajouté le 2026-08-09, v3)

Trouvé par kuchu à l'écran : ranger `Desktop` a fait **disparaître**
`Projet Ulysse` et `freeB` de la liste. `project_for_path` fait un
plus-long-préfixe (`projects_db.py:736`) — ils étaient dedans.

Rien n'est perdu, et Hermès sait défaire : un projet posé plus bas reprend la
main, et les sessions se répartissent seules. **Mais l'écran ne savait pas le
faire** : une fois le parent rangé, le sous-dossier n'est plus dans « Dossiers
où vous avez travaillé », donc plus de bouton.

Deux questions, et elles se répondent l'une l'autre.

### 8.1 Prévenir, oui — mais en donnant l'issue

Un troisième état du champ « quel dossier », à côté de *vide* et *occupé* :

> **Ce dossier en contient deux que vous avez déjà utilisés** — *Projet Ulysse*
> et *freeB*. Ils rejoindront ce projet, et sortiront de la liste. **Vous
> pourrez les en ressortir depuis sa carte**, quand vous voudrez.

Ce n'est pas un danger : rien n'est perdu. C'est une **conséquence**, et elle
doit être connue *avant*, sinon on croit avoir perdu quelque chose.

**Un avertissement sans issue est une inquiétude.** La dernière phrase n'est
donc pas un adoucissement : c'est ce qui rend l'avertissement utile — et elle
n'est vraie que grâce au §8.2.

### 8.2 On range un sous-dossier là où on le cherche : dans son parent

La carte d'un vrai projet gagne une ligne repliable au pied :

> ▸ Contient **2 dossiers** où vous avez travaillé

Dépliée, chacun avec son chemin, son compte de sessions, et **« En faire un
projet »**. Plus une phrase : *« un dossier rangé à son tour reprend ses
conversations. Rien n'est perdu dans l'opération. »*

Elle n'existe que s'il y a quelque chose dedans, et elle est repliée par
défaut : on ne l'ouvre que si on la cherche.

> ⚠ **SUPPOSÉ** : que `repos` de `projects.tree` donne cette liste, ou qu'on
> puisse la calculer depuis les `cwd` des sessions du projet. Si ni l'un ni
> l'autre, **cette section n'est pas affichable** — et alors la promesse du
> §8.1 tombe avec elle. Les deux tiennent ensemble.

### 8.3 Ce que ça ouvre, et que je ne dessine pas

Si un projet peut en contenir d'autres, la liste devient un **arbre** —
`projects.tree` porte d'ailleurs ce mot dans son nom. Je n'y vais pas : deux
niveaux se lisent, trois se replient, et personne n'a encore trois niveaux.

**À rouvrir le jour où quelqu'un en aura**, pas avant.
