# Passe de design — Plan

> ⚠ **`apercu-plan.html` est DÉPASSÉ sur un point** (relevé du 2026-08-08,
> 2ᵉ passe). Le repliage qu'il simulait en réécrivant l'attribut `d` après
> coup est maintenant **réel dans `ulysse-view.js`**, avec le retour chariot,
> et il ne replie que si la rangée unique ne tient pas. Sa copie figée du
> moteur porte l'ancien `layout()` : ne pas s'y fier pour le rangement.
>
> Ce qu'il montre et qui **reste à faire** : la carte du schéma qui prend sa
> couleur (§1 quater), le kebab d'étape et ses actions (§1 ter), l'échelle et
> le bouton « ranger » (§1 bis).

Basé sur `apercu-plan.html`, qui charge le **vrai moteur de schéma**
(`Graph`, dans `ulysse-view.js`) : ce qu'on voit sortir du SVG est exactement
ce que le produit dessine. Trois jeux de données — vide, 4 étapes, 12 étapes.

---

## 1. Le défaut principal : le schéma est un ruban

Il ne se voit qu'avec de vraies données, et c'est pour ça qu'il a survécu à la
maquette.

`layout()` range les étapes **par couches** : la profondeur d'une étape est la
plus longue chaîne qui y mène. C'était juste pour la maquette, dont le plan
**branche** — six étapes dont deux en parallèle.

Or les étapes réelles ne branchent jamais. `drawPlan()` les relie en chaîne :

```js
const edges = steps.slice(1).map((s) => [s.n - 1, s.n]);   // une suite
```

Une chaîne rangée par couches donne **une couche par étape**, donc une seule
ligne. Mesuré dans l'aperçu, sur le vrai moteur :

| Étapes | viewBox actuel | viewBox en serpentin |
|---|---|---|
| 4 | `926 × 144` | `926 × 144` |
| **12** | **`2766 × 144`** | **`926 × 382`** |

À douze outils appelés — un tour de travail ordinaire — le schéma fait
**2766 px de large pour 144 de haut**, dans un cadre presque carré. Le
navigateur le réduit à la largeur disponible : les cartes deviennent illisibles
et il faut zoomer et tirer pour lire ce qui aurait dû tenir d'un coup d'œil.

### Le correctif

Ce n'est pas du CSS, c'est le rangement. Replier la chaîne en rangées : on
remplit une ligne, on revient à gauche, on continue. Le schéma remplit son
cadre au lieu de le traverser.

**Toutes les rangées se lisent de gauche à droite.** Un serpentin — une rangée
sur deux à l'envers — économiserait le trait de retour, mais il ferait payer
cette économie à chaque lecture : une ligne sur deux à contresens, et il faut
vérifier le sens avant de lire. Un texte ne fait pas ça.

C'est donc au **trait** d'être lisible. Quand l'étape suivante est à gauche de
la précédente, le coude du moteur revient en arrière *à la hauteur de la carte
de départ* : il traverse toute la rangée par-derrière et on ne sait plus d'où
il part. Il est remplacé par un **retour chariot** — sortir à droite, longer la
marge, redescendre dans le couloir entre les deux rangées, revenir à gauche,
entrer par la gauche de la suivante. Un geste que personne n'a besoin
d'apprendre.

`coudeAxe()` devra connaître ce cas ; l'aperçu réécrit l'attribut `d` après
coup, ce qui montre l'effet sans être l'implémentation.

### Combien par rangée ? La forme du volet répond

Pas un nombre fixe : on essaie toutes les largeurs et on garde celle dont le
schéma **ressemble le plus au cadre qui l'accueille** (écart logarithmique, pour
que « deux fois trop large » pèse autant que « deux fois trop haut »). Mesuré :

| Volet | Rangement choisi |
|---|---|
| 1100 × 520 | 4 par rangée |
| 520 × 900 | 2 par rangée |
| 1900 × 300 | 7 par rangée |

Le calcul se refait au changement de vue (Schéma / Les deux / Détail) et au
redimensionnement — `init()` écoute déjà `resize`, l'accroche existe.

Dans `ulysse-view.js`, `layout()` doit détecter le cas « chaîne pure » (aucun
nœud n'a plus d'un prédécesseur ni plus d'un successeur) et replier ; sinon,
garder le rangement par couches, qui reste juste pour un vrai graphe.

### Les nœuds sont libres

On prend une carte, on la pose ailleurs. C'est ce qui sépare un schéma qu'on
regarde d'une carte dont on se sert : quand douze étapes se ressemblent, on
écarte celle qu'on surveille, on rapproche celles qu'on compare, et on garde sa
disposition le temps de comprendre.

Ce qui rend la chose supportable, c'est de pouvoir tout défaire d'un geste —
d'où le bouton **ranger** (et la touche `A`), qui prend ici tout son sens. Il
s'allume dès que la caméra ou une carte a bougé : on ne cherche pas « comment
revenir », on le voit.

Le moteur écoute déjà `mousedown` sur le SVG pour la caméra. Le déplacement de
nœud doit donc s'installer **en phase capture**, avant lui, et arrêter la
propagation quand le geste part d'une carte — sinon on déplace la vue en
croyant déplacer la carte. Même seuil de 4 px que le moteur, sans quoi tout
clic décalerait d'un pixel et on ne pourrait plus désigner une carte.

> **À décider :** les positions manuelles survivent-elles à l'arrivée d'une
> nouvelle étape ? `setData()` rappelle `layout()` et anime vers lui, ce qui
> écraserait le rangement à la main. Il faudrait un drapeau « rangé par
> l'utilisateur » qui ne bouge plus que les nœuds nouveaux.

---

## 1 bis. Le volet devient une carte

Conséquence directe du ruban : `svg.graph{width:100%;height:auto}` et
l'`aspect-ratio` posé en style inline par le moteur font que **le SVG se
dimensionne par son contenu**. Sur un contenu très large, il déborde son volet
et se fait couper des deux côtés — on voit une étape et demie sur douze, sans
rien pour dire qu'il y en a d'autres.

Le volet devient donc un **cadre**, et le schéma une carte dedans :

```css
#pPlan svg.graph{width:100%!important;height:100%!important;
  max-height:none!important;aspect-ratio:auto!important}
#pPlan .canvas-body{overflow:hidden}
```

`preserveAspectRatio` (« xMidYMid meet », le défaut) fait tenir le contenu, et
plus rien ne dépasse jamais.

**Le zoom et le déplacement existaient déjà** — `init()` gère la molette autour
du pointeur, le tirer avec seuil de 4 px, le double-clic pour recentrer. Ils
n'étaient simplement pas *trouvables*. Ce qui les rend trouvables :

- un fond pointillé qui dit « ceci est un canevas » ;
- le curseur `grab` / `grabbing`, déjà dans `ulysse.css` (l. 543) ;
- une **échelle** en bas à droite : `−  100 %  +`, où cliquer le pourcentage
  recentre. `#recentrer` s'y range — trois commandes de la même famille au même
  endroit valent mieux qu'un bouton isolé qui apparaît et disparaît.

> Le moteur ne prévient de rien quand la caméra bouge. L'aperçu relit
> `state.CAM.k` après `wheel` et `mouseup`. Côté produit, il vaudrait mieux
> ajouter un `onCam` à `Graph` plutôt que de sonder.

---

## 1 quater. Les nœuds prennent leur couleur

La maquette met la couleur de famille dans le liseré, dans le mot
« LECTURE » et dans le lien — mais la carte reste blanche
(`.node .b{fill:var(--bg)}`), et les terminées ne reçoivent qu'un voile à 8 %
(`.tint`). Sur une suite d'outils qui lisent tous des fichiers, le schéma
paraît monochrome : **la couleur est là, elle ne porte pas.**

On remplit la carte de sa propre couleur, à faible densité — la règle
d'origine du jeu d'icônes appliquée à la carte entière :

> « Un glyphe plein n'est jamais un aplat : c'est sa propre couleur à 18 %. »

| État | Remplissage |
|---|---|
| terminée | couleur de famille à **12 %** |
| en cours | couleur de famille à **19 %** |

Le voile `.tint` disparaît : il s'ajoutait au remplissage et rendait le
*terminé* plus dense que ce qui *travaille* — l'inverse de ce qu'on veut. Le
liseré passe de 1,7 à 1,3 px (2 px pour l'étape en cours) : la couleur est
dans la carte, il n'a plus à la porter seul.

**Ce n'est pas faisable en CSS.** La couleur de famille arrive en attribut
`stroke`, et aucune règle ne sait la lire. C'est `draw()`, dans
`ulysse-view.js`, qui doit poser le `fill` — l'aperçu la relit après coup, ce
qui suffit à montrer l'effet mais n'est pas l'implémentation.

---

## 1 ter. Chaque étape du Détail retrouve son kebab

Ce n'est **pas une invention** : `.dots` et `.sactions` sont dans `ulysse.css`
depuis la maquette (l. 660-690), avec ce commentaire :

> « Le kebab reste visible. Il l'était au survol seulement, et c'est la
> troisième fois que Raf ne le trouve pas. Une commande qu'il faut découvrir
> pour s'en servir n'est pas discrète, elle est cachée. »

Le produit n'a repris ni l'un ni l'autre : les étapes n'ont aujourd'hui aucune
action. On les remet, avec la même règle — kebab **visible**, en gris, pas au
survol. Les actions s'ouvrent **sous** l'étape (`.exp-acts`) plutôt que dans un
menu flottant : elles appartiennent à la ligne, elles ne survolent pas la liste.

Le **double-clic** sur une étape ouvre sa fiche — le même geste que le `⋯` du
nœud dans le schéma, pour que les deux volets se répondent.

Cinq actions proposées, à valider :

| Action | Ce qu'elle fait |
|---|---|
| Tout savoir | ouvre `#sNode`, la fiche existante |
| Ouvrir le fichier | pose le fichier de l'étape dans l'Établi |
| Copier le détail | la commande et son résultat |
| Rejouer cet outil | relance avec les mêmes arguments |
| **Me demander avant « X »** | le seul *réglage durable* — porte l'accent, pas le contour gris |

> La dernière est la seule qui change quelque chose au-delà de l'étape. Elle
> suppose une liste d'outils sous accord, côté Hermès. **À vérifier avant de
> l'implémenter** — si le backend ne sait pas la tenir, il ne faut pas
> l'afficher.

Le kebab porte `data-act`, les actions `data-a`. Ce sont des attributs
**nouveaux**, à ajouter au contrat §2.2 s'ils sont retenus.

---

## 2. Les deux bandeaux de volet disparaissent

La maquette n'avait **aucun** `.volet-head` dans le Plan. Le produit en a
ajouté deux — « Ce que fait l'agent » et « Le détail » — juste sous un segment
qui dit déjà « Schéma · Les deux · Détail ».

Deux titres de 46 px pour renommer ce que le bouton au-dessus vient de nommer :
**92 px** perdus sur le seul écran du produit qui a vraiment besoin de place.

---

## 3. L'état vide arrête de faire peur

Aujourd'hui : « Rien encore », puis un encadré en pointillés qui parle de
`display.tool_progress` et du RPC `config.set`.

La réserve est **juste** — sans ce réglage, rien n'apparaîtra jamais, et il
fallait le dire. Mais elle s'adresse à quelqu'un qui débogue, pas à quelqu'un
qui attend. Elle passe en seconde ligne : une phrase, et le détail technique
derrière un lien. Ce qui reste au premier plan, c'est ce qui va se passer.

---

## 4. Le flux brut annonce son compte

« Voir le flux brut » ouvre un journal de 38 vh sans qu'on sache combien de
lignes arrivent. On lui ajoute son nombre — c'est ce qui distingue un miroir
d'un résumé.

---

## 5. Une question de mot : « Plan » ne dit pas la vérité

Le panneau s'appelle **Plan**, et le commentaire de `ulysse-app.js` explique
lui-même pourquoi ce n'en est pas un :

> « Hermès n'en produit pas : il n'annonce pas ce qu'il va faire, il le fait,
> et émet `tool.start` / `tool.complete` à mesure. »

Un plan promet un avenir. Cet écran montre un passé et un présent. La maquette
avait le mot juste, et le produit l'a déjà écrit — dans le bandeau de volet
qu'on propose justement de supprimer : **« Ce que fait l'agent »**.

L'aperçu le monte dans le titre. Le libellé du menu (`railItems`) suivrait.
C'est du texte, donc libre au contrat — mais c'est le changement qui a le plus
de portée de toute la passe, et il n'est pas à moi de le trancher.

---

## 6. Ce qui n'a PAS été touché, et pourquoi

- **`.validate` / « Valider et lancer »**, `#dirty`, `.drybar`, « Ce plan ne me
  convient pas » : la maquette proposait d'approuver un plan avant exécution.
  Il n'y a rien à approuver — quand l'étape s'affiche, elle est déjà faite.
  Les reprendre serait fabriquer un pouvoir qui n'existe pas.
- **Le moteur de schéma** : coude à trois segments, point qui parcourt le lien
  actif, halo animé, caméra tirer/molette. Tout est bon, et l'aperçu le prouve
  en s'en servant tel quel.
- **`.glegend` dans `#paneG`** : ici sa `position:absolute` est légitime, c'est
  son usage d'origine. (Le défaut trouvé dans Discuter venait de son emploi
  dans la sous-barre du composeur.)

---

## 7. Contrat d'interface

Vérifié en jsdom sur les trois jeux de données et les deux versions :
`pPlan` `studio` `stseg` `vCanvas` `vReader` `svg` `recentrer` `paneG` `steps`
`toutbtn` `voirJrn` `planMeta` `planStop` `sNode` `ficheBody` — tous présents,
`data-v` (3) et `data-t` intacts.

**Deux pièges trouvés en écrivant l'aperçu**, qui valent pour toute page du
produit :

1. `ulysse-view.js` déclare `esc()`, `NW`, `NH`, `RX` et `NEUTRE` au niveau
   global. Redéclarer l'un d'eux dans un autre `<script>` classique lève une
   `SyntaxError` qui tue la page entière, sans message visible pour
   l'utilisateur. C'est arrivé deux fois en écrivant cet aperçu — d'abord avec
   `esc`, puis avec `NW`. Tout nouveau global doit porter un préfixe.
2. Un `<link>` ou un `<script src>` **relatif** ne se résout pas dans un
   visualiseur intégré : la page arrive nue, sans style et sans moteur, et
   sans rien dire non plus — juste un `ReferenceError` dans une console que
   personne n'ouvre. Les trois aperçus recopient donc `ulysse.css`,
   `ulysse-icons.js` et `ulysse-view.js` en dur. Ce sont des **copies figées
   au 2026-08-08** : si `ulysse.css` change, les aperçus ne suivent pas.
