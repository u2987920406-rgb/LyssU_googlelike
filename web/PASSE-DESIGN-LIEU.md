# Passe de design — où Discuter travaille

`projects.for_cwd` existe et n'est employé nulle part. Vous écriviez que
c'était *« peut-être plus utile que tout le reste »* de la passe des projets.
Le relevé le confirme, et pour une raison plus nette que prévu.

Aperçu : `apercu-lieu.html` (autonome, cinq cas × actuel/proposé).

---

## 0. Ce qui est constaté, et ce qui est supposé

*(Nouvelle habitude, prise après la v1 des projets : marquer la différence.)*

**Constaté**, dans le produit :

- la barre de titre de Discuter **ne dit rien** du dossier de travail ;
- `CFG.SESSION_CWD` est posé par « Travailler ici », suivi d'un `snack` de six
  secondes, et **plus rien après** ;
- `conv.info.cwd` existe et n'est lu qu'à un seul endroit — l'objet d'une
  notification d'accord (`ulysse-app.js:3398`).

**Supposé**, et à vérifier avant d'appliquer :

- que `projects.for_cwd` rende le projet **ou rien**, sans erreur, pour un
  `cwd` quelconque ;
- qu'il distingue un **vrai projet** d'un **dossier déduit**, comme le fait
  `projects.tree` avec `isAuto`.

Si la seconde est fausse, la gélule ne peut pas porter les trois espèces — et
c'est tout le §2 qui tombe.

---

## 1. Le défaut

On choisit « Travailler ici » dans Projets. Un snack le dit six secondes. On va
dans Discuter — **et plus rien**.

Le fil annonce ensuite *« j'ai écrit dans ulysse.html »*. **Où ça ?**

C'est le même défaut que la demande d'accord invisible, et il est plus grave :
là, l'agent **écrit**. Un produit qui demande la permission avant d'écrire mais
ne dit pas *où* n'a pas fini son travail.

---

## 2. La gélule reprend les trois espèces, sans les réinventer

Elle se pose à côté du titre, là où `#privchip` se pose déjà — la barre de
titre décrit l'écran, et **où l'on travaille fait partie de ce qu'il est**.

| Espèce | Signe | Cohérent avec |
|---|---|---|
| **Vrai projet** | pastille de **sa couleur**, son icône | `PASSE-DESIGN-PROJETS.md` §1 |
| **Dossier déduit** | pastille **grise et vide** | idem |
| **Aucun** | « dossier d'Hermès » | idem |

On ne réapprend pas un vocabulaire d'un écran à l'autre. Ce qui distingue un
projet d'un dossier dans la liste doit le distinguer partout.

**Le chemin complet n'est pas dans la barre** : il est dans un repli, avec une
phrase qui dit ce que l'espèce implique, et — pour un dossier déduit — le geste
« En faire un projet ». Cent caractères de chemin ne tiennent pas dans une
barre de titre.

---

## 3. Un quatrième état que personne n'avait vu

`CFG.SESSION_CWD` est le dossier de la **prochaine** session.
`conv.info.cwd` est celui de la session **en cours**.

Cliquer « Travailler ici » pendant qu'un fil est ouvert change le premier,
**pas le second**. Aujourd'hui, rien ne le dit : on croit avoir déménagé, et on
écrit encore à l'ancienne adresse.

La gélule se **dédouble** alors — *« Projet Ulysse → Migration des factures »*,
en ambre. C'est le seul moment où elle prend de la place, et c'est le seul où
il le faut.

Le repli montre les deux chemins et dit pourquoi : *« un fil ne change pas de
dossier en cours de route — l'agent y a déjà lu et écrit. »* Puis deux gestes :
ouvrir un fil là-bas, ou rester ici.

> **C'est le vrai gain de cette passe.** Le reste rend visible une information
> qui existait ; celui-ci rend visible une **incohérence** qui était muette.

---

## 4. Tant qu'on ne sait pas, on ne dit pas

Avant l'ouverture de la session, on ignore où elle ira. La gélule est alors
grise et respire, et dit *« dossier en attente »*.

Même règle que les pastilles de `#first`, et que votre correction du Terminal :
**« je ne sais pas » n'est pas « nulle part ».**

---

## 5. Ce que le code doit faire

1. Appeler `projects.for_cwd` avec `conv.info.cwd` à l'ouverture de session, et
   à chaque `session.info`.
2. Poser la gélule dans la barre de titre de Discuter, à côté de `#privchip`.
3. **Comparer `CFG.SESSION_CWD` et `conv.info.cwd`** — c'est ce qui déclenche
   le quatrième état, et ça ne demande aucun appel.
4. Ne rien afficher d'affirmatif tant que `session.info` n'est pas revenu.

> **Le point 3 ne dépend d'aucune vérification.** Même si `projects.for_cwd`
> ne rendait pas ce qu'on suppose, l'écart entre les deux dossiers reste vrai
> et reste invisible. Il peut être branché seul.

---

## 6. Contrat d'interface

Rien du contrat n'est touché : la gélule s'ajoute dans la barre de titre, à
côté d'éléments existants.

**Classes nouvelles**, préfixées `l-` : `l-lieu` (avec `projet` / `dossier` /
`aucun` / `attente` / `change` en classe jointe), `l-pop`.

`#privchip` et `#moreBtn` restent à leur place. La gélule se glisse entre les
deux, avant le `.sep`.

Vérifié en jsdom sur les cinq cas × deux versions, sans erreur, aucun bouton
mort.
