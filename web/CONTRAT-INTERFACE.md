# Contrat d'interface — ce que le design peut changer, et ce qui casse

Ce fichier existe pour une raison précise : le design se fait ailleurs (Claude
Cowork), le câblage ici. Sans liste de ce qui porte la logique, une passe de
design casse le produit sans que rien ne le signale — les pages restent belles
et ne font plus rien.

**Règle en une phrase :** changez tout ce qui est visuel, ne renommez ni ne
supprimez les `id` et les `data-*` listés plus bas.

---

## 1. Ce qui est LIBRE (aucune logique ne s'y accroche)

- **`ulysse.css`** — entièrement. C'est aujourd'hui le `<style>` de la maquette,
  copié au caractère près. Rien dans le JavaScript ne lit ce fichier.

  > Une réserve depuis le 2026-08-08 : `test_page.js` **charge** désormais la
  > feuille et interroge `getComputedStyle`. Sans elle, une vérification
  > d'apparence passe aussi bien avec le défaut qu'avec sa correction. Les
  > valeurs peuvent changer librement ; ce sont les **noms** de quelques
  > classes de la maquette qui portent maintenant du sens — voir §2.4.

  > **Depuis le 2026-08-09, la feuille n'est plus purement verbatim** — et
  > c'est écrit : `web/ECARTS-MAQUETTE.md` tient le registre des écarts
  > voulus, avec un commentaire `── ÉCART VOULU no N ──` à chaque endroit du
  > CSS. Quatre à ce jour, tous la même coquille : un espacement vertical posé
  > sur un `span`. **La maquette est la source pour les décisions, pas pour les
  > coquilles.** Neuf vérifications les tiennent, sinon la prochaine extraction
  > verbatim les restaurerait en silence.

  > ⚠ **Les `apercu-*.html` RECOPIENT la feuille** — ils s'ouvrent seuls,
  > sans serveur. Autant de copies que de fichiers, autant d'occasions de
  > diverger sans bruit. (Ni le test ni le script ne comptent jusqu'à un
  > nombre écrit : ils lisent le dossier.) Le test le
  > voit, et `python resync_apercus.py` répare. **Après toute retouche de
  > `ulysse.css`, lancez-le.** Il recopie la feuille et rien d'autre : le
  > gabarit et les notes d'un aperçu restent à vous.
- **Le bloc `<style>` de `ulysse.html`** — entièrement. Toutes ses règles sont
  préfixées `u-` pour ne jamais recouvrir la maquette ; gardez cette habitude,
  ou dites-le si vous la changez.

  > **Une exception, assumée : le préfixe `j-`.** Les classes des projets
  > (`j-ic` `j-vide` `j-auto` `j-rien` `j-home` `j-champ` `j-in` `j-chemin`
  > `j-etat` `j-cols` `j-col` `j-trois` `j-acts`) portent le nom donné par
  > `PASSE-DESIGN-PROJETS.md` §6, et `apercu-projets.html` les emploie.
  > Même chose pour `l-lieu` / `l-pop` (`PASSE-DESIGN-LIEU.md` §6,
  > `apercu-lieu.html`), avec `projet` `dossier` `attente` `change` en
  > classe jointe.
  > Renommer en `u-` casserait la correspondance entre l'aperçu et le produit.
  > Elles vivent dans `ulysse.html`, **pas** dans `ulysse.css` : ce sont des
  > classes neuves, pas des corrections de la maquette.
- **Tous les textes visibles** — libellés, titres, phrases d'aide, messages.
- **La structure autour** — ajouter des conteneurs, des wrappers, des sections.
  Ce qui compte, c'est que les éléments listés en §2 existent toujours et
  restent atteignables.
- **Les icônes** — `ulysse-icons.js` est la table de la maquette. En ajouter
  est sans risque ; en retirer casse les appels `svg("nom")`.

---

## 2. Ce qui PORTE LA LOGIQUE

### 2.1 Les `id` — 88, tous lus par le JavaScript

Renommer ou supprimer l'un d'eux coupe la fonction correspondante, en silence.

**Le premier lancement** — `first` `firstcard`. Ils étaient dans la maquette
et jamais dans le produit, donc jamais listés. `#first` n'apparaît qu'au
premier lancement, et le marqueur qui le dit vit **côté `serve.py`**, hors du
dossier servi : `localStorage` ne survivrait ni à un autre navigateur ni à une
fenêtre privée, et l'absence des fichiers de mémoire dit autre chose.

**La scène** — `app`. Depuis le 2026-08-08,
**`#lvl1` n'existe plus**. L'accueil de Discuter *est* l'écran d'entrée — même
mot-marque, même champ centré, même interrupteur. Neuf `id` sont sortis avec
lui (`lvl1` `mark` `form1` `q` `plus0` `mic0` `snd0` `jointes0` `modenote0`) ;
`#composer`, `#reply`, `#plus1`, `#mic1`, `#snd1`, `#jointes1` et `#modenote1`
faisaient déjà le même travail. **`wait0` et `wait0txt` restent** : le compteur
n'avait pas de doublure, et il se rejoue en `.wait.inline` dans le fil.

Le mot-marque n'a plus d'`id` : il porte `.u-marque` et rien ne le lit.

**Les panneaux** — `pDiscuter` `pPlan` `pTravaux` `pLivrables` `pProjets`
`pAutomatisations` `pVestiaire` `pReglages` `pTerminal` `pReperes`.
`nav()` les compose (`"p" + destination`) : le nom du panneau et l'entrée du
menu ne peuvent pas diverger. **`#pDiscuter` porte les cinq classes d'état.**

**Le menu** — `railwrap` `railhot` `rail` `railItems` `burger` `bell` `bellIc`
`dettewrap`

**Discuter** — `work` `thread` `band` `roles` `privchip` `files` `ctlEtabli`
`wait0` `wait0txt` `languette` `uStock`
`lieuSlot`
`composer` `reply` `plus1` `mic1` `snd1` `stopBtn` `composerHint`
`moreBtn` `morePop` `pop` `fileInput` `jointes1` `modenote1`
`cadreBtn` `cadrePop`

> **`#band` et `#roles` sont DÉPLACÉS, pas recréés.** `#band` vit dans le
> kebab, `#roles` dans le repli de la gélule « Cadre ». `#uStock` est leur
> point de départ et leur refuge.
>
> ⚠ **`#morePop` est reconstruit en `innerHTML` à chaque ouverture.** Écrire
> `#band` en dur dedans le détruirait au premier clic. La séquence est :
> **sortir, réécrire, réinstaller**. Le piège s'est déclenché en test ; une
> vérification le garde.

**Les filtres** — `travQ` `livQ` `repQ` (et `vq`, déjà là). Quatre panneaux
sur dix filtrent ; `.search` n'était utilisée que par le Vestiaire, celui qui
en avait le moins besoin.

**Plan** — `studio` `stseg` `vCanvas` `vReader` `svg` `recentrer` `paneG`
`steps` `toutbtn` `voirJrn` `planMeta` `planStop`

**Les autres panneaux** — `works` `livrables` `projets` `autos`
`vgrid` `vdet` `vmeta` `vseg` `vq` `icSearch` `setnav` `setbody`
`tside` `tmain` `glossary`
et leurs boutons : `travRefresh` `livRefresh` `projRefresh` `autoRefresh`

**Le flottant** — `npanel` `toasts` `snack` `sNode` `ficheBody` `sFile`
`fileBody` `sEcrire` `ecrireBody` `sProjet` `projetBody`

**Créés à l'exécution** (ne pas les mettre dans le HTML, mais ne pas non plus
créer d'`id` qui leur ressemble) : `gzoom` `doorBtn` `densSeg` `livCrumbs`
`livHome` `livList` `mIncog` `mNew` `mEtabli` `nClose` `fClose` `vAct`
`etabliClose` `tGo` `tSize` `tCout` `tecran` `tstate` `tApp` `tMem` `tFull`
`tPopApp` `tPopMem` `tSortie` `tOutils2` `tRepli` `detteGo` `detteAct` `detteRed`
`uMemFiles` `uMemTexte` `uMemDiff` `uMemVers` `uMemGo` `tConsole` `jNom`
`lieuBtn` `lieuPop`

> **`#sEcrire` / `#ecrireBody` sont dans le HTML** — la feuille où l'on écrit
> dans la mémoire. Elle est à part de `#sFile` : ce qu'on y montre — la
> différence, ce qui se perd, ce qu'on pourra défaire — n'a rien à voir avec
> l'aperçu d'un fichier.
>
> ⚠ **L'écriture passe par `serve.py`, jamais par `/api/fs/write-text`.**
> Trois routes locales : `POST /ulysse/ecrire` · `GET /ulysse/versions` ·
> `POST /ulysse/restaurer`. Appeler l'API d'Hermès en direct contournerait la
> copie datée — et l'écran promettrait alors un retour en arrière qui n'existe
> pas. Un test l'exige.

> **`#sProjet` / `#projetBody` sont dans le HTML** — la feuille où l'on range
> un dossier en projet. À part de `#sFile` et `#sEcrire` : ce qu'on y montre —
> ce qui se fabrique, ce qui **ne** se fabrique pas, et ce qui reste commun —
> n'a rien à voir avec un aperçu ni avec une écriture.
>
> ⚠ **La liste des projets vient de `projects.tree`, un RPC sur la
> WebSocket**, et elle mêle **trois espèces**. Deux n'ont ni nom propre, ni
> couleur, ni identifiant à soi : le dossier déduit (`isAuto`, dont l'id est
> le chemin) et `__no_project__` (`isNoProject`). Leur proposer « renommer »
> ou « archiver » afficherait une commande qui n'agit pas.
> **Trois apparences, pas une étiquette sur trois cartes identiques.**
>
> ⚠ **« Ranger », jamais « Créer ».** `projects.create` n'écrit rien sur le
> disque (`hermes_cli/projects_db.py:322`) : il désigne un dossier existant.
> Et il n'y a **pas** de bouton « Choisir… » — la feuille ne s'ouvre que
> depuis un dossier déjà connu ; un sélecteur de dossier serait une passe à
> soi, et le bouton sans lui serait mort.

> **`#lieuSlot` est dans le HTML**, vide — la gélule « où ce fil travaille »,
> à côté de `#privchip`. `majLieu()` y écrit `#lieuBtn` et `#lieuPop`.
>
> ⚠ **`projects.for_cwd` NE DIT PAS « je ne sais pas ».** Mesuré sur Hermès en
> marche le 2026-08-09 : pour un dossier inexistant — ou sans `cwd` du tout —
> il **remplace silencieusement** la demande par le dossier courant du serveur
> et répond sur celui-là. Il rend heureusement le `cwd` sur lequel il a
> répondu : **on le compare, et on jette la réponse si elle porte sur autre
> chose.** Sans cette comparaison, la gélule dirait « vous êtes dans tel
> projet » d'un fil qui travaille ailleurs.
>
> ⚠ **`CFG.SESSION_CWD` n'est PAS `conv.info.cwd`.** Le premier est le dossier
> de la **prochaine** session, le second celui de la session **en cours**. Leur
> écart est un état à part entière — la gélule se dédouble en ambre. Ne le
> ramenez pas à un seul chemin : c'est l'incohérence qu'il rend visible.

> **`#tConsole` — « Ouvrir une console Hermès » — ouvre pour de vrai.**
> `POST /ulysse/console`, quatrième route locale. C'est **le seul endroit où
> Ulysse lance un processus sur la machine**. La commande est écrite en dur
> dans `serve.py` : la route ne lit aucun paramètre, et un corps envoyé quand
> même est vidé puis jeté sans être regardé. Le bouton voisin, lui, se
> contente de copier la commande (`data-cmd`) — pour qui préfère la coller
> ailleurs.
>
> ⚠ **Une maquette ne doit pas rebaptiser ce bouton en « Copier ».** Il l'a
> été, et kuchu a demandé qu'il fasse ce qu'il annonce. Un libellé qui promet
> moins que ce qui se passe est aussi faux qu'un libellé qui promet plus.

> **`#tSortie` est la touche `Échap` elle-même** — un `<button class="u-echap">`
> qui contient `<kbd>Échap</kbd>` et un `<span class="u-dit">` lu **au survol
> seulement**. Il y avait avant un bouton large « Quitter le plein écran »
> **et**, à côté, la mention `Échap` : deux commandes pour un seul geste, et la
> large prenait la place qu'on vient justement chercher en plein écran.
> Demandé par kuchu le 2026-08-09.
>
> ⚠ **Ne pas le rendre à nouveau large**, et **ne pas remplacer le survol par
> `display:none`** : le nom doit rester dans le DOM et dans `aria-label`.
> Caché à l'œil, jamais au lecteur d'écran — personne ne survole au clavier.

> **`#tOutils` est dans le HTML**, vide — c'est le seul `id` ajouté au gabarit
> par la passe 2. `drawTerm()` y écrit les trois boutons, puis **déplace** les
> `.tgrp` de `#tside` dans les deux replis. `#tside` reste écrit exactement
> comme avant : le code qui le remplit n'a rien à savoir de ce déménagement.
> Une passe qui ajoute un groupe à la colonne n'a donc rien à faire — ils sont
> tous repris, quel qu'en soit le nombre.

> ⚠ **`#tecran` porte un terminal VIVANT.** C'est le seul nœud de la page
> dont le contenu n'appartient pas à la maquette : xterm.js y peint la sortie
> d'un `hermes --tui` réel, et une session PTY y est ouverte. Or `#tmain` est
> reconstruit en `innerHTML` à chaque changement de thème ou de taille. Le
> laisser dans le gabarit **couperait le PTY sous les doigts** de quelqu'un
> en train de taper. `drawTerm()` fait donc la même séquence que pour `#band` :
> **sortir** l'écran vers `#uStock`, réécrire `#tmain`, **réinstaller**
> l'écran à la place du nœud neuf. Une passe de design peut réécrire tout le
> reste de `#tmain` — mais doit laisser `<div id="tecran">` vide dans le
> gabarit, et ne jamais y mettre de contenu à elle.
>
> ⚠⚠ **Et pour réinstaller, ne pas utiliser `getElementById`.** Le temps de la
> réécriture, **deux** nœuds portent l'`id` `tecran` : le vivant, rangé dans
> `#uStock`, et le neuf, vide, dans `#tmain`. `getElementById` rend le premier
> dans l'ordre du document — et `#uStock` est déclaré **avant** le panneau. On
> récupérait donc le vivant, `replaceChild(ecran, ecran)` ne faisait rien, et
> le terminal restait **caché dans le stock** pendant que le panneau affichait
> un div vide. La recherche doit être limitée au sous-arbre qu'on vient
> d'écrire : `$("tmain").querySelector("#tecran")`.
>
> Le défaut a vécu un jour sans être vu, parce que le test comparait
> l'**identité** du nœud — vraie même orphelin. Il vérifie désormais que
> l'écran est **revenu dans le panneau**.

### 2.2 Les attributs `data-*` — c'est par eux que les clics arrivent

| Attribut | Porté par | Ce qu'il déclenche |
|---|---|---|
| `data-nav` | boutons du menu | aller à une destination |
| `data-mode` | boutons `.u-modeseg` | Chat (`pur`) ⇄ Cowork |
| `data-v` | `#stseg`, `#vseg` | volets du Plan, vues du Vestiaire |
| `data-dir` / `data-file` | lignes de fichiers | ouvrir un dossier / un fichier |
| `data-resume` | lignes de Travaux | reprendre une conversation |
| `data-cwd` | cartes de Projets | choisir le dossier de travail |
| `data-tog` / `data-fire` | Automatisations | pause/reprise, déclenchement |
| `data-wh` | webhooks | déclencher une route |
| `data-open` | `.acard` | déplier une carte |
| `data-yes` / `data-no` | notifications | répondre depuis la bulle (`once` / `deny`) |
| `data-ch` | le bloc `.ask` du fil | répondre avec sa **portée** : `once` · `session` · `always` · `deny` |
| `data-i` | tuiles du Vestiaire | sélectionner |
| `data-g` | en-têtes de provenance | replier un groupe de compétences |
| `data-t` | étapes du Plan | déplier une étape |
| `data-act` | le kebab d'une étape | ouvrir ses actions, sous la ligne |
| `data-a` | `.acts` d'une ligne, `.sactions` d'une étape | l'action elle-même |
| `data-cle` | lignes et cartes | l'identité de la ligne, lue par ses actions |
| `data-cr` | segments du fil d'Ariane | remonter d'un cran |
| `data-cmd` | aide-mémoire du Terminal, adresses de webhook | copier |
| `data-poser` | aide-mémoire du Terminal, famille « Dans cette session » | **poser** la commande dans la ligne de la TUI, **sans la lancer** — voir l'encadré ci-dessous |

> **L'aide-mémoire tient deux familles, et une ligne ne porte JAMAIS les deux
> attributs.** Ce qui les distingue n'est pas le geste, c'est où elles
> s'exécutent : « Dans votre console » se copie (`data-cmd`), « Dans cette
> session » se pose (`data-poser`). Le mauvais geste n'existe pas là où il
> serait faux.
>
> La ligne du terminal **n'est pas un shell** : c'est l'invite de
> `hermes --tui`. Y poser une commande shell puis valider ne l'exécuterait
> pas — ça l'enverrait à l'agent comme un message. `data-poser` ne doit donc
> porter que des commandes de la TUI, celles qui commencent par `/`.
>
> **Et seulement celles que la complétion expose vraiment.** La liste se
> demande à Hermès (`complete.slash` sur le gateway), elle ne se devine pas :
> `/theme` existe dans le registre de la TUI et n'est **pas** exposé. Un
> test vérifie que toute ligne posable commence par `/`.
| `data-z` | `.u-echelle` | zoomer d'un pas |
| `data-jx` | pastilles de pièce jointe | retirer la pièce |
| `data-role` | pastilles de rôle | activer un cadre |
| `data-th` / `data-sz` | Terminal | thème, taille |

### 2.3 Les classes lues par le JavaScript

`on` (l'état actif, partout : scènes, panneaux, segments, pastilles) ·
`panel` · `rail-btn` · `lbl` · `raildot` · `mini` / `open` (le menu) ·
`atelier` (l'Établi ouvert, sur `#work`) ·
`pop` · `sheet` · `sheet-bg` ·
`u-modeseg` · `u-jointe` · `nrow` · `dette` · `sec` · `wait-fill` · `nm`

**Les cinq classes d'état de Discuter**, posées d'un seul endroit —
`majEtats()`. Les poser chacune de son côté, c'est les voir se contredire.

| Classe | Sur | Quand |
|---|---|---|
| `accueil` | `#pDiscuter` | aucun message n'a encore été envoyé |
| `cowork` | `#pDiscuter` | l'agent complet (Chat n'en porte pas) |
| `incog` | `#pDiscuter` | le fil sans mémoire |
| `hs` | `#pDiscuter` | une brique ne répond plus — c'est elle qui marque le kebab |
| `atelier` | `#work` | l'Établi est ouvert |

Les classes de la maquette employées pour l'apparence (`.row`, `.pcard`,
`.acard`, `.tile`, `.exp`, `.srow2`…) peuvent être restylées librement.

### 2.4 Les classes de la maquette que le JavaScript ÉCRIT

Elles ne sont pas lues par le code, mais c'est lui qui les pose dans le HTML
qu'il fabrique — les renommer dans `ulysse.css` les laisserait sans style,
sans que rien ne le signale.

| Classe | Écrite par | Ce qu'elle porte |
|---|---|---|
| `privnote` | `paintThread()` | la ligne en tête du fil sans mémoire |
| `privchip` | `paintHint()` | la pastille près du titre |
| `vdet-head` / `vdet-body` | `drawVDetail()` | la tête figée et le corps qui défile |
| `vhero` | `drawVDetail()` | l'avatar 52 px et le nom |
| `ctl` | l'en-tête de l'Établi | la croix qui le referme |
| `ask` / `opt` / `tick` / `dangerlink` | `accordHTML()` | la demande d'accord dans le fil, et `ask.done` après |
| `acts` | les quatre listes | les actions d'une ligne, au survol |
| `dots` / `sactions` / `exp-acts` | `drawPlan()` | le kebab d'une étape et ses actions |
| `tile` / `sel` | `grilleV()` | une compétence, et celle qui est choisie |
| `wait` / `inline` | l'accueil | le compteur, rejoué dans le fil |
| `avert` / `cout` / `tmemo` | Terminal | l'avertissement, le coût, l'aide-mémoire |
| `u-tscreen` / `u-tecran` / `u-tstate` | Terminal | **à nous** : le cadre de l'écran, l'écran lui-même, et l'état de la session (`repos` / `ouverture` / `ouvert` / `coupe` en classe jointe) |
| `u-quoi` / `u-long` / `u-repli` / `u-poser` | Terminal | **à nous**, passe du 2026-08-09 : ce qui tourne dans la barre · la partie longue de l'avertissement, repliée en session · la ligne qui dit ce qui est replié · la pastille du geste « poser » |
| `u-tui` / `u-note` | Terminal | **à nous** : le bloc de l'aide-mémoire réservé aux commandes de la TUI — caché tant qu'aucune session n'est ouverte — et la note qui dit ce que l'invite attend |
| `u-outils` / `u-pop` | Terminal | **à nous**, passe 2 : les trois boutons de la barre de titre, et les deux replis où la colonne a emménagé |
| `u-plein` / `u-plein-actif` / `u-sortie` | Terminal | **à nous** : le plein écran **applicatif** posé sur `.term`, la levée du panneau qui le fait passer devant le rail, et la ligne qui porte le chemin de sortie |
| `u-sep` | Terminal | **à nous** : le filet qui sépare `/clear` de ses voisines |
| `u-mfile` / `u-verrou` / `u-cadenas` | Réglages › Ce qu'Ulysse sait | **à nous** : une ligne de fichier de mémoire, celle qui ne s'écrit pas, et son signe |
| `u-diff` / `u-bilan` / `u-garde` / `u-vers` | l'écriture | **à nous** : la différence, ses deux nombres, la garantie de retour, les versions gardées |
| `u-niv` / `u-niv-l` (`ok` / `warn`) | l'écriture | **à nous** : les trois niveaux de garantie de `SOUL.md`, et leurs **trois** couleurs |
| `u-memtexte` / `u-macts` | l'écriture | **à nous** : le champ, et la rangée d'actions de la feuille |
| `u-term-<état>` | **`#pTerminal`** | **à nous** : l'état de session porté par le panneau, **une seule** classe parmi `u-term-repos` · `u-term-ouverture` · `u-term-ouvert` · `u-term-coupe`. Posée par `majTermEtat()`, et par rien d'autre. |
| `u-hint` | `#composerHint` | **à nous**, pas à la maquette : voir plus bas |

> `#composerHint` portait `.glegend`, qui est la légende du **schéma du Plan**
> et vaut `position:absolute`. Dans la sous-barre du composeur elle se
> détachait du flux et venait se poser par-dessus l'interrupteur. Elle porte
> désormais `u-hint`, définie dans le `<style>` de la page. `.glegend` reste
> intacte là où elle a un sens — dans `#paneG`.

---

## 3. Ce qu'il NE FAUT PAS toucher

- **`ulysse-core.js`** — la liaison à Hermès. Chaque appel y est vérifié contre
  le code source d'Hermès (voir `AUDIT-ENDPOINTS-REEL.md`). Une modification
  « pour que ça passe » casse le contrat avec le backend.
- **`serve.py`** — c'est lui qui détient les secrets et tient les frontières
  (écoute loopback, `Host` et `Origin` vérifiés, signature des webhooks).
- **Les fichiers de test** — ils sont la preuve que ça marche encore.

---

## 4. Comment vérifier qu'une passe de design n'a rien cassé

```
cd web
node test_page.js        # 173 — la page dans un DOM réel : chaque panneau, chaque geste
python test_serve.py     # 52 — les frontières et le relais
python test_personas.py  # 100 — 10 personas x 2 scénarios
python test_reel.py      # 39 — contre le VRAI Hermès (demande la pile lancée)
```

Deux de ses sections **gardent des défauts déjà corrigés** — « la demande
d'accord » et « les six réparations ». Ils étaient tous invisibles côté réseau
**et** côté contrat : la page s'affichait, les identifiants étaient tous là.
Sans ces vérifications, une passe de design les réintroduit sans bruit.

`test_page.js` est celui qui attrape les dégâts d'une passe de design : il
monte la vraie page et vérifie que les dix panneaux s'affichent, que la
bascule répond, que la pièce jointe part, que la demande d'accord sonne.

S'il tombe en rouge après un changement de design, ce n'est pas le test qui a
tort — c'est qu'un `id` ou un `data-*` de la §2 a disparu.

---

## 5. Ce qu'il reste à faire, côté code (pour mémoire)

- ~~Terminal intégré~~ — **fait.** C'est une **WebSocket** `/api/pty`
  (`@app.websocket`, web_server.py:15736), pas un POST : elle lance
  `hermes --tui` derrière un pseudo-terminal. Le rendu est confié à
  `xterm.js`, **emprunté** à l'installation d'Hermès par `serve.py` (liste
  fermée `EMPRUNTS`, aucun segment ne vient du client) plutôt que recopié.
- ~~Dictée~~ — **fait**, `/api/audio/transcribe`
- Écriture des fichiers de profil — `/api/fs/write-text` existe, non branché
  tant que les garde-fous d'écriture ne sont pas décidés
- Création de projet / coffre — `projects.tree` existe
- ~~Écran de premier lancement (`#first`)~~ — **fait.** Le marqueur vit côté
  serveur (`serve.py`, hors du dossier servi), jamais dans la page ; il est
  posé par `POST /ulysse/premier-vu`, même origine exigée.
