# Passe de design — où Discuter travaille

`projects.for_cwd` existe et n'est employé nulle part. Vous écriviez que
c'était *« peut-être plus utile que tout le reste »* de la passe des projets.
Le relevé le confirme, et pour une raison plus nette que prévu.

Aperçu : `apercu-lieu.html` (autonome, cinq cas × actuel/proposé).

---

> ⚠ **CORRIGÉ le 2026-08-09 (v2).** `projects.for_cwd` **ne doit pas être
> appelé** : `conv.info` porte déjà `project` — `{id, slug, name,
> primary_path}`, ou `null` hors de tout projet. Le §0 et le §5 sont réécrits
> en conséquence.
>
> La raison, du code : *« une session ne peut pas se tromper sur elle-même »*.
> Ce qu'une source dit d'elle-même vaut mieux qu'une question posée à son
> sujet. Le §2 tient entièrement — seule sa source change, et elle est
> meilleure.

## 0. Ce qui est constaté, et ce qui est supposé

*(Nouvelle habitude, prise après la v1 des projets : marquer la différence.)*

**Constaté**, dans le produit :

- la barre de titre de Discuter **ne dit rien** du dossier de travail ;
- `CFG.SESSION_CWD` est posé par « Travailler ici », suivi d'un `snack` de six
  secondes, et **plus rien après** ;
- `conv.info.cwd` existe et n'est lu qu'à un seul endroit — l'objet d'une
  notification d'accord (`ulysse-app.js:3398`).

~~**Supposé**~~ — **tranché le 2026-08-09**, et les deux suppositions étaient
mauvaises pour la même raison : je cherchais l'information au mauvais endroit.

- `projects.for_cwd` **ne dit pas « je ne sais pas »** : pour un dossier qu'il
  ne trouve pas, il *remplace silencieusement* la demande par le dossier
  courant du serveur et répond sur celui-là. Le piège reste épinglé dans
  `test_reel.py`, pour le prochain qui s'en servira.
- **`conv.info` porte déjà `project`** : `{id, slug, name, primary_path}`, ou
  `null`. C'est la bonne source, et il n'y a aucun appel à faire.

Il ne manque que la **couleur** — elle vient de `projects.list`, lu une fois.
Et une couleur qui manque ne cache rien : le nom est déjà là.

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

1. ~~Appeler `projects.for_cwd`~~ — **non.** Lire `conv.info.project`, qui
   arrive avec la session. Aucun appel, aucun cache, aucune comparaison de
   `cwd`.
2. Poser la gélule dans la barre de titre de Discuter, à côté de `#privchip`.
3. **Comparer `CFG.SESSION_CWD` et `conv.info.cwd`** — c'est ce qui déclenche
   le quatrième état, et ça ne demande aucun appel.
4. Ne rien afficher d'affirmatif tant que `session.info` n'est pas revenu.

> **Le point 3 ne dépend d'aucune vérification** — et c'est heureux, parce que
> le reste, si.

### ⚠ Et le quatrième état n'était pas atteignable

Constaté à l'écran le 2026-08-09 : **« Travailler ici » appelait
`resetSession()` avant de poser le dossier**, ce qui vidait `conv.turns`. La
conversation en cours disparaissait **sans un mot** — et comme le fil s'en
allait, il ne restait rien dont le dossier puisse diverger.

L'état ambre du §3 était donc **inatteignable**, et mon aperçu le montrait
quand même : je le posais dans un tableau de scénarios sans vérifier qu'on
pouvait y arriver.

**Un aperçu qui montre un état inatteignable est un aperçu qui ment**,
exactement comme un bouton qui ne fait rien. D'où la règle que j'applique
depuis : **écrire, pour chaque état, par quel geste on y arrive.** Si le geste
n'existe pas, ça se voit en l'écrivant.

Corrigé côté code : « Travailler ici » garde le fil, et la fermeture devient un
choix nommé — « Ouvrir un fil là-bas ».

---

## 6. Contrat d'interface

Rien du contrat n'est touché : la gélule s'ajoute dans la barre de titre, à
côté d'éléments existants.

**Classes nouvelles**, préfixées `l-` : `l-lieu` (avec `projet` / `dossier` /
`aucun` / `attente` / `change` en classe jointe), `l-pop`.

**Et la gélule disparaît en mode Chat.** Aucune session ne s'y ouvre : `cwd` ne
viendra jamais, et « dossier en attente » annoncerait indéfiniment un dossier
qui n'arrive pas. Un lieu de travail n'a de sens que là où quelque chose
travaille.

`#privchip` et `#moreBtn` restent à leur place. La gélule se glisse entre les
deux, avant le `.sep`.

Vérifié en jsdom sur les cinq cas × deux versions, sans erreur, aucun bouton
mort.
