# Passe de design — Discuter

Décidé avec kuchu le 2026-08-08, dans Claude Cowork, sur la base de
`apercu-discuter-v2.html`. Ce document est la passe de main **design → code** :
il dit ce qui est validé, ce que le code doit faire, et ce qui casse si on
l'applique sans y penser.

> L'aperçu s'ouvre en double-clic. Il n'a aucun backend, il charge le vrai
> `ulysse.css` et le vrai `ulysse-icons.js`. `apercu-discuter.html` (v1) est
> conservé : il montre l'état d'avant, utile pour comparer.

---

## 1. Ce qui est validé

**Discuter n'est plus un écran, mais deux visages du même écran.**

**CHAT** est le visage nu. À l'ouverture, on ne voit que :

- le mot **Ulysse**, au-dessus du champ, centré ;
- le champ, avec `+`, micro, envoi ;
- l'interrupteur **Chat | Cowork**, sous le champ, **Chat activé** ;
- le kebab `⋯` en haut à droite, et le point d'état à sa gauche.

Rien d'autre. Le titre « Discuter » lui-même s'efface : le mot-marque le dit
déjà, et l'écrire deux fois n'apprend rien.

Au premier message, **le mot se fond et le composeur descend** à sa place
définitive, en bas. Le fil apparaît au-dessus.

**COWORK** est le même écran, plus ce que les outils exigent : les appels
d'outil dans le fil, les bulles de rôle sous le champ, l'Établi à droite.

> **La règle tenue :** passer de Chat à Cowork **ne déplace rien**. Le champ,
> l'interrupteur et le fil ne bougent pas d'un pixel — des choses s'ajoutent
> autour. Une bascule qui réorganise l'écran oblige à réapprendre l'écran ;
> une bascule qui ajoute ne coûte rien.

**Les six cadres sont repliés derrière une gélule grise.** Choisir un cadre
est un geste avancé : on le fait rarement, et jamais avant d'avoir écrit sa
première phrase. Sous le champ il ne reste qu'une gélule — « Cadre » tant
qu'on n'en a pas choisi, puis le nom de celui qu'on a pris.

Elle reste **grise dans les deux états**. Elle ne passe pas au bleu quand un
cadre est actif : ce serait donner à un réglage la couleur que le produit
réserve à ce qui est *sélectionné dans le contenu*. Un point bleu à gauche du
nom suffit à dire qu'on n'écrit plus à nu.

> **Aucun cadre n'est pré-choisi.** Décidé le 2026-08-08. Afficher
> « Orchestrateur » d'entrée aurait été plus accueillant, mais `activeRole`
> vaut `null` et `roleOpts()` ne préfixe alors rien : l'interface aurait
> annoncé un cadre qui n'agit pas. Elle dit donc « Cadre », et aucune encoche
> n'est cochée. Recliquer le cadre actif le retire — écrire sans cadre est un
> état qui existe, et c'est celui de départ.

Le repli présente les six avec les **encoches de la maquette** (`.opt` et
`.tick`, le langage de ses questions à choix — on ne dessine pas une deuxième
façon de choisir dans le même produit). Il s'ouvre au-dessus du champ, donc
au-dessus de la conversation : tout ce qu'il prend en hauteur, il le prend à
ce qu'on est en train de lire. D'où six lignes de 32 px, sans sous-titre, sans
phrase d'introduction en tête, et une ombre légère au lieu de l'ombre portée
des menus — il se pose sur la conversation, il ne s'en détache pas.


**L'état du réseau (Agent / Hermès / Gateway) descend dans le kebab.** Une
première version gardait un point vert dans la barre de titre. Un point est
plus petit qu'une pastille, mais c'est toujours un objet de plus à l'écran,
qui n'appartient à rien : il ne commande pas, il ne titre pas, il veille. Il
va donc avec les autres réglages du fil — là où l'on va déjà quand on se
demande ce qui se passe. Replié quand tout va bien, déplié d'office sinon.

Ce que l'écran perd en veilleuse, il le regagne le jour où ça tombe : **quand
une brique ne répond plus, le kebab lui-même se marque en rouge**. Un seul
signal, et il ne se déclenche que quand il a quelque chose à dire.

**L'Établi se range** par sa croix — il glisse, il ne disparaît pas — et il
laisse **une languette contre le bord droit**, avec le nombre de fichiers
rangés. Un volet qu'on ferme et qui ne laisse rien derrière lui est un volet
qu'on ne rouvrira pas : on ne cherche pas dans un menu ce dont on ignore
l'existence. Il se rouvre par la languette ou par le kebab. À l'accueil il
reste fermé : un volet vide à côté d'un écran nu se remarque plus que tout le
reste.

**Le mode sans mémoire** redevient visible : la teinte du fond, la ligne en
tête de fil, et **l'icône seule** dans la barre de titre — sans les mots « Sans
mémoire », qui répétaient en toutes lettres ce que la fenêtre entière est déjà
en train de dire. L'icône est posée en `--text` quand tout le reste de la barre
est en `--muted` : c'est ce contraste qui la rend visible, pas sa taille.

---

## 2. Ce que le code doit faire

### 2.1 Poser quatre classes d'état

| Classe | Sur | Quand |
|---|---|---|
| `accueil` | `#pDiscuter` | tant qu'aucun message n'a été envoyé dans le fil |
| `cowork` | `#pDiscuter` | quand `mode === "cowork"` |
| `incog` | `#pDiscuter` | quand `incognito` est vrai — **déjà prévue par `ulysse.css`, jamais posée** |
| `atelier` | `#work` | quand l'Établi est ouvert — **elle existe, elle n'était jamais retirée** |
| `hs` | `#pDiscuter` | quand une brique ne répond plus (c'est elle qui marque le kebab) |

`incog` et `atelier` ne sont pas des ajouts : ce sont des câblages manquants.
Tant que `incog` n'est pas posée, `#privchip` est rempli à chaque `paintHint()`
et reste invisible (`.privchip{display:none}` sans `#pDiscuter.incog`).

### 2.1 bis — Deux éléments qui DÉMÉNAGENT, et le piège qui va avec

`#band` vit désormais dans `#morePop`, et `#roles` dans le repli de la bulle
« Cadre ». Ils ne sont ni recréés ni renommés : **on déplace l'élément**.

Attention : `#morePop` est reconstruit en `innerHTML` à chaque ouverture du
kebab. Écrire `#band` en dur dedans le ferait détruire au premier clic. La
séquence est donc : **sortir `#band`, réécrire le menu, réinstaller `#band`**.
L'aperçu le fait avec un conteneur `.p-stock` invisible — le piège s'est
déclenché en test, il est réel.

Même prudence pour `#roles` si le repli du cadre est jamais reconstruit.

### 2.2 Deux corrections de fond

**`#composerHint` ne doit plus porter `.glegend` seule.** `.glegend` est la
légende du schéma du Plan : `position:absolute; left:16px; right:120px;
bottom:12px`. Dans la sous-barre du composeur, elle se détache du flux et vient
se poser **par-dessus** l'interrupteur. Correctif dans l'aperçu (geste final du
bloc CSS) : la remettre en `position:static`.

**Chat devient le mode par défaut.** `ulysse-app.js` initialise aujourd'hui
`let mode = "cowork"`. Il faut `"pur"`. Les libellés de l'interrupteur passent
à **Chat | Cowork** dans cet ordre — `data-mode="pur"` et `data-mode="cowork"`
sont inchangés, seuls les textes et l'ordre bougent.

### 2.3 Supprimer l'écran d'entrée `#lvl1`

L'accueil de Discuter **est** l'écran d'entrée : même mot-marque, même champ
centré, même interrupteur. Les garder tous les deux, c'est montrer deux fois la
même chose à la suite, avec un basculement entre les deux.

L'application s'ouvre donc directement sur `#pDiscuter.accueil`.

**Ce qui doit être repris de `#lvl1` avant de le retirer :**

- `premierEnvoi()` ouvre la session et fait entrer dans l'app. La logique
  d'ouverture de session reste — c'est le premier envoi de `#composer` qui la
  déclenche désormais.
- Le **compteur d'attente** (`#wait0`, `compteur()`, le filet de 25 s) n'a plus
  d'écran où vivre. Il se rejoue avec `.wait.inline` **dans le fil**, à
  l'endroit où la réponse va apparaître — c'est ce que montre l'aperçu, scène
  « Tour en cours ».
- Le filet de 25 s doit être conservé : personne ne doit rester bloqué devant
  un compteur qui n'aboutit pas.
- `#jointes0` et `#modenote0` disparaissent avec l'écran ; `#jointes1` et
  `#modenote1` faisaient déjà le même travail.

---

## 3. Ce que ça casse — et qu'il faut mettre à jour DANS LE MÊME MOUVEMENT

### `CONTRAT-INTERFACE.md`

§2.1 « Les deux scènes » : `lvl1` disparaît, il ne reste que `app`. Toute la
ligne « L'écran d'entrée » (`mark`, `form1`, `q`, `plus0`, `mic0`, `snd0`,
`wait0`, `wait0txt`, `jointes0`, `modenote0`) sort du contrat — **10 `id` en
moins**, le contrat passe de 83 à 73.

§2.3 : ajouter `accueil` et `cowork` à la liste des classes lues par le
JavaScript.

### `test_page.js`

Cinq vérifications portent sur `#lvl1` et doivent être **réécrites, pas
supprimées** — ce qu'elles prouvaient reste vrai, sur un autre écran :

| Ligne | Ce qu'elle vérifie | Ce qu'elle doit vérifier |
|---|---|---|
| 153 | `#lvl1` porte `.on` au démarrage | `#pDiscuter` porte `.accueil` au démarrage |
| 155-159 | `#mark` dit « Ulysse » et porte le dégradé | le mot-marque de l'accueil, même vérification |
| 161-162 | `#form1` existe, `#q` est vide | `#composer` existe, `#reply` est vide |
| 270-271 | on envoie depuis `#q` / `#form1` | on envoie depuis `#reply` / `#composer` |
| 283-285 | `#lvl1` perd `.on`, `#mark` passe en `opacity:0` | `#pDiscuter` perd `.accueil` |

**Si le test tombe en rouge sur autre chose que ces cinq lignes, ce n'est pas
le test qui a tort.** Un `id` du contrat a disparu, et le contrat dit lequel.

### `REPRISE.md`

Le tableau des fichiers et la ligne « la balle » sont à remettre à jour une
fois la passe appliquée.

---

## 4. Ce qui n'est PAS décidé

- **Le sort des rôles en Chat.** La gélule n'apparaît qu'en Cowork —
  il n'y a pas d'agent à cadrer quand le modèle ne fait que répondre. À
  confirmer.
- **Le seuil de la marque rouge.** Le kebab se marque dès qu'une brique ne
  répond plus. Reste à décider si le Gateway arrêté suffit, ou si seul Hermès
  injoignable mérite le signal.
- **Les neuf autres panneaux.** Cette passe ne couvre que Discuter. Le
  traitement de l'accueil et du point d'état n'a pas été transposé ailleurs.
- **Le premier lancement (`#first`)** appartient toujours à l'installateur.
