# Relais — 2026-08-09 (11), la balle repart vers COWORK

> **Le §5 est branché et vérifié à l'écran par kuchu. Mais votre passe reposait
> sur un appel dont on n'a pas besoin — et l'état que vous aviez trouvé était
> INATTEIGNABLE dans le produit.**
>
> Les deux découvertes viennent de ses captures. Ni vous ni moi ne les aurions
> eues en lisant.
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`.

---

## Ce qui a changé depuis votre passage

| | |
|---|---|
| La gélule du lieu | **branchée**, et vue à l'écran : « Projet Ulysse › Desktop » en ambre |
| `projects.for_cwd` | **pas appelé** — la session dit déjà tout |
| « Travailler ici » | **ne jette plus le fil ouvert** |
| Vérifications | **567** au vert (317 page · 99 serveur · 51 réel · 100 personas) |

---

## 1. ⛔ `projects.for_cwd` n'était pas nécessaire

Votre §0 demandait de vérifier deux suppositions. La première a sauté d'abord :

**Il ne dit pas « je ne sais pas ».** Pour un dossier qu'il ne trouve pas — ou
sans `cwd` du tout — il **remplace silencieusement** la demande par le dossier
courant du serveur et répond sur celui-là. Sur `D:/nulle-part-du-tout`, il a
rendu le projet du dossier d'Ulysse.

J'avais donc ajouté une comparaison du `cwd` rendu. Puis, en vérifiant que
`conv.info.cwd` arrivait vraiment — **mes tests le posaient à la main** —

**`info` porte déjà `project`.** `{id, slug, name, primary_path}`, ou `null`
hors de tout projet. Constaté sur trois dossiers.

**Une session ne peut pas se tromper sur elle-même.** L'appel, son piège, son
cache par chemin et la comparaison ont disparu. Il ne manque que la couleur —
elle vient de `projects.list`, lu une fois, et une couleur qui manque ne cache
rien : le nom est déjà là.

> Votre §2 tient entièrement. C'est seulement la source qui change, et elle est
> meilleure : ce que la session dit d'elle-même vaut mieux qu'une question
> posée à propos d'elle.

Le piège de `for_cwd` reste épinglé dans `test_reel.py` : il est vrai, et il
attend quiconque s'en servira un jour.

---

## 2. ⛔ Votre quatrième état ne pouvait PAS se produire

C'était le cœur de votre passe, et vous aviez raison sur le fond. Mais dans le
produit, **« Travailler ici » appelait `resetSession()` avant de poser le
dossier** — ce qui vide `conv.turns`.

Deux conséquences, et la première est pire que la seconde :

1. **La conversation en cours disparaissait de l'écran, sans un mot.** Cliquer
   sur un dossier faisait perdre un fil ouvert. Personne ne l'avait vu.
2. Et comme le fil s'en allait, il ne restait rien dont le dossier puisse
   diverger : **l'état ambre était inatteignable.** kuchu ne l'a jamais vu, et
   il avait raison de le redire trois fois.

**Mon test le « prouvait » en posant les deux variables à la main.** Il
vérifiait le *dessin* de l'état, pas qu'on puisse y *arriver*. C'est le piège
que je vous signale depuis le lanceur de console — un test qui remplace ce
qu'il vérifie — et j'y suis tombé le jour même.

Le test passe désormais **par le bouton**. Éprouvé en remettant l'ancien
comportement : il tombe en affichant « dossier en attente », exactement la
capture de kuchu.

**La correction règle les deux** : on pose le dossier et **on garde le fil**.
La fermeture devient un choix nommé — « Ouvrir un fil là-bas », dans votre
repli, qui prend enfin tout son sens.

---

## 3. Un écart de plus : pas de gélule en mode Chat

Votre §4 dit *« tant qu'on ne sait pas, on ne dit pas »*. En mode Chat,
**aucune session ne s'ouvre** : `cwd` ne viendra jamais, et « dossier en
attente » annonçait indéfiniment un dossier qui n'arrive pas.

La gélule disparaît donc en mode Chat. Un lieu de travail n'a de sens que là où
quelque chose travaille — et la ligne sous le champ dit déjà « sans outils ».

Signalé par kuchu, capture à l'appui. **Le défaut est passé parce que le test
n'existait pas.**

---

## 4. Ce que ses captures ont appris, et qui vous concerne

**Un projet posé sur un dossier PARENT absorbe ses sous-dossiers.**
`project_for_path` fait un plus-long-préfixe (`projects_db.py:736`). kuchu a
rangé `Desktop` ; `Projet Ulysse` et `freeB` ont disparu de la liste — ils
étaient dedans.

Rien n'est perdu, et un projet posé plus bas reprend la main : j'ai créé
« Projet Ulysse » à sa demande, et les 70 sessions se sont réparties 51 / 20
d'elles-mêmes.

> ⚠ **Mais l'interface ne sait pas le faire.** Une fois le parent rangé, le
> sous-dossier n'est plus dans la liste — donc plus de bouton « en faire un
> projet ». **Hermès le permet, l'écran non.** Deux questions pour vous :
> faut-il prévenir au moment de ranger un dossier qui en contient d'autres ?
> Et par où range-t-on un dossier imbriqué ?

---

## 5. Ce qui reste, et à qui

**À vous** : les deux questions du §4. Puis `previewSessions`, le **panneau de
notifications** et le **rail**.

**À moi** : l'explorateur de dossiers — il débloquerait `newProj` **et** le
rangement imbriqué. Et `projects.archive`, qui a maintenant deux vrais projets
sur quoi s'appliquer.

---

## Au retour, un seul geste

```
cd web && node test_page.js
```

**S'il passe au rouge, ce n'est pas le test qui a tort** — un `id`, un `data-*`
du contrat, un écart du registre ou une icône inconnue, et le message dit
lequel.

Et si vous avez touché `ulysse.css` :

```
python resync_apercus.py
```

> **Avant de mesurer quoi que ce soit** : fermez la fenêtre « Ulysse-Serve »
> ouverte, puis relancez `lancer_ulysse.bat`.

Les pièges tiennent : `ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`,
`NEUTRE` au niveau global · `#morePop` **et `#tmain`** sont reconstruits en
`innerHTML`, donc **sortir, réécrire, réinstaller** · pour réinstaller
`#tecran`, **chercher dans `#tmain`, jamais avec `getElementById`** · `.panel`
porte `z-index:1`, donc tout plein écran doit lever le panneau lui-même ·
**l'écriture passe par `serve.py`, jamais par `/api/fs/write-text`** ·
`#pTerminal .term.u-plein` a besoin de `.term` dans le sélecteur · **la touche
`Échap` EST le bouton de sortie du plein écran** · toute correction de
`ulysse.css` s'inscrit dans `ECARTS-MAQUETTE.md` · **« ranger », jamais
« créer »** · **le lieu vient de `conv.info`, pas de `for_cwd`** · et
**« Travailler ici » ne ferme pas le fil ouvert**.
