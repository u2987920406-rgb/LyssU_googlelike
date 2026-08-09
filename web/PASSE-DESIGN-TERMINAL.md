# Passe de design — le Terminal

Aperçu : `apercu-terminal.html` (autonome, quatre états jouables).

> ⚠ **`#tecran` est rempli dans l'aperçu, pour montrer.** Dans le produit il
> doit rester **vide** dans le gabarit — `drawTerm()` y réinstalle le nœud
> vivant après avoir réécrit `#tmain`. Rien de ce qui suit ne touche à cette
> séquence : sortir → réécrire → réinstaller.

---

> **Passe 2, du 2026-08-09** — demandée par kuchu : *« tout ce qui est réglage
> doit passer dans des menus ; la fenêtre doit être grande, et pouvoir être
> pleine. »* Voir §0a et §0b. Les sept points d'origine sont inchangés.

---

## 0a. La colonne de 300 px part dans deux replis

`#tside` prend **300 px en permanence** pour deux choses qu'on consulte
rarement : quatre thèmes et une liste de commandes. Sur un portable de 1280,
c'est un quart de l'écran donné à ce qu'on regarde une fois par semaine — pris
à ce qu'on regarde tout le temps.

Elle ne disparaît pas, elle **emménage** dans deux replis de la barre de titre.
C'est le même déplacement que `#band` vers le kebab ou `#roles` vers la gélule :
`#tside` reste écrit exactement comme aujourd'hui — `H("tside", …)` ne change
pas — et ses deux `.tgrp` sont **déplacés ensuite**. Sortir/réinstaller, dans
l'autre sens.

### Deux boutons, pas deux « ⋯ »

Deux kebabs côte à côte sont indistinguables : il faudrait les ouvrir pour
savoir lequel est lequel. Chacun porte donc l'icône de ce qu'il contient —
`regler` pour l'apparence, `doc` pour l'aide-mémoire. Le troisième bouton est
le plein écran.

Les deux replis **s'excluent** : ouvrir l'un ferme l'autre.

---

## 0b. La fenêtre prend toute la place, puis tout l'écran

Deux tailles, une seule commande :

| | |
|---|---|
| **dans le panneau** | l'écran occupe tout ce que la colonne libère |
| **plein écran** | il recouvre le rail et la barre de titre |

**Le plein écran est applicatif, pas celui du navigateur.** Ulysse tourne déjà
dans une fenêtre : demander le plein écran du système ferait *sortir de
l'application* pour agrandir un de ses panneaux. Une classe sur `.term`,
`position:fixed`, et c'est réversible sans rien demander à personne.

### Ce qui ne disparaît jamais

**L'état de session, et le chemin pour sortir.** Une ligne en tête porte le
bouton de retour, la mention `Échap`, et le rappel de ce qu'on regarde.

> Un plein écran dont on ne sait pas sortir n'est pas un agrandissement, c'est
> un piège. Échap en sort, le bouton reste visible, et la même touche ferme
> d'abord un repli s'il y en a un d'ouvert — on ne perd jamais deux choses
> d'un coup.

### `#tecran` survit à tout

Vérifié en jsdom : après passage en plein écran, retour, changement de thème
depuis le repli et bascule d'état, `#tecran` est toujours présent et les huit
`id` du contrat aussi. Le plein écran ne touche pas à la séquence
sortir → réécrire → réinstaller : il pose une classe, il ne reconstruit rien.

---

## Le fond de l'affaire

**Un dessin de terminal et un terminal ne se dessinent pas pareil.**

Tant que l'écran était une image, chaque choix de la maquette était juste : les
trois pastilles disaient « ceci est un terminal », l'avertissement se lisait
avant de copier une commande pour aller ailleurs, et les trois pavés de texte
sous le cadre ne gênaient personne — il n'y avait rien à faire dans le cadre.

Depuis que `hermes --tui` tourne dedans, six de ces choix sont devenus faux.
Aucun n'était une erreur : ils décrivaient un autre objet.

---

## 1. La fenêtre enlève son déguisement

`.tbar` porte trois pastilles rouge / jaune / verte. Elles ne ferment rien, ne
réduisent rien, n'agrandissent rien — et elles sont posées sur **la seule
fenêtre de l'application qui mène en dehors d'elle**.

C'est exactement ce que le projet refuse partout ailleurs : la tuile Coffre a
sauté pour moins que ça.

La barre garde sa place et son rôle — dire de quoi il s'agit et où on en est.
Elle perd son costume, et dit ce qui tourne : **`hermes --tui`**, au lieu du
nom du thème (« hermes — nuit », qui nommait la couleur, pas le programme).

## 2. L'état de session cesse d'être la chose la plus discrète

`#tstate` : 11,5 px, opacité 0,55, dans un coin.

C'est pourtant la seule chose qu'on doit savoir **sans y penser** : est-ce que
ce que je tape part quelque part ? Il devient une pastille avec son point, aux
quatre couleurs de ses quatre états. Même élément, mêmes classes (`repos`,
`ouverture`, `ouvert`, `coupe`) — il change de poids, pas de nature.

## 3. Ouvrir et Fermer ne sont pas le même bouton

`#tGo` porte les deux, avec le même noir plein. Ouvrir est une invitation ;
fermer **arrête ce qui tourne**. Les habiller pareil oblige à lire le libellé
pour savoir si l'on va commencer ou couper.

Le bouton reste unique — c'est le contrat — mais change d'aspect avec l'état :
plein quand il ouvre, contour quand il ferme, et rouge au survol seulement à
ce moment-là.

## 4. La ligne d'état parle du gateway

`.dim` annonce « Hermès 2.4.1 · gateway en marche ». **Le gateway n'a rien à
voir avec un pseudo-terminal** : c'est un reste de l'écran-image, quand ce
cadre servait de tableau d'affichage.

Elle dit maintenant ce qui concerne cet écran : **Hermès · profil · rendu**.

> **Sans le dossier de travail**, que je demandais d'abord. Constaté par le
> code : `/api/status` donne `hermes_home`, pas le répertoire où tourne le
> dashboard — et c'est celui-là qu'hérite le PTY. L'écrire aurait été de la
> donnée fictive. Ce n'est pas une perte : **la TUI l'imprime elle-même** sur
> sa première ligne, trois centimètres plus bas, et là il est vrai.

## 5. L'avertissement passe avant le premier geste

Il est **sous** l'écran. C'était juste quand on lisait, puis qu'on décidait de
copier une commande. Depuis qu'on peut taper directement dans le cadre,
l'avertissement arrive après l'action qu'il devait précéder.

Il remonte **au-dessus du bouton d'ouverture**. Et une fois la session ouverte,
il se replie en une ligne : il a fait son travail, il ne doit plus prendre la
place dont le terminal a besoin. Le titre reste, entier.

## 6. Un terminal vivant a besoin de place

Sous l'écran : l'avertissement, le coût, la note technique. Trois pavés qui
maintiennent `#tecran` à ses 340 px de minimum, sur un portable où il en
faudrait 500.

Session ouverte, les deux qui **n'engagent rien** se replient (le coût et la
note technique), remplacés par une ligne qui dit qu'ils sont repliés et où les
retrouver. L'écran gagne 80 px. L'avertissement, lui, ne disparaît jamais.

## 7. L'aide-mémoire : deux destinations, un geste chacune

> **Corrigé le 2026-08-09.** Ma première version proposait *deux gestes par
> ligne* — copier, et poser dans le terminal. **Elle était fausse**, et je la
> laisse écrite ici pour qu'on sache pourquoi.

Elle supposait que la ligne du terminal soit un **shell**. Elle ne l'est pas :
c'est l'invite de `hermes --tui`, celle qui propose *« Try "write a test
for…" »*. Y poser `hermes doctor` et appuyer sur Entrée n'exécuterait pas la
commande — ça **enverrait ce texte à l'agent comme un message**.

Le geste ne lançait rien (le code l'a vérifié contre le vrai binaire), mais il
**visait à côté**. Et une commande qui a l'air de s'exécuter et qui devient une
phrase est pire qu'une commande qu'on recopie à la main.

### Ce qui distingue ces lignes n'est pas le geste, c'est où elles s'exécutent

| Famille | Destination | Geste |
|---|---|---|
| **Dans votre console** | hors d'Ulysse — les six d'origine | **copier** |
| **Dans cette session** | les commandes de la TUI | **poser** |

**Un seul geste par ligne, jamais deux.** On ne peut plus se tromper de cible,
parce que le mauvais geste n'existe pas là où il serait faux.

Ça règle aussi, sans y toucher, l'empilement des deux pastilles que le code a
dû corriger pour que le texte des six lignes ne se reflue pas à l'ouverture
d'une session : il n'y a plus qu'une pastille par ligne.

La seconde famille n'apparaît **qu'en session ouverte** — proposer des
commandes à une invite qui n'existe pas serait promettre un endroit où les
taper. Et poser n'exécute toujours rien : on insère dans la ligne, c'est à la
personne d'appuyer sur Entrée.

> *Ulysse n'exécute rien que vous n'ayez lancé.* Ça reste vrai, et c'est
> maintenant vrai **au bon endroit**.

### Ce que ça ajoute, et qu'aucun écran ne disait

Le panneau ne dit nulle part que la TUI a ses propres commandes. Quelqu'un qui
ouvre une session voit une invite et ne sait pas ce qu'elle attend. La note
sous le titre le dit en une ligne : *« La session attend d'abord une phrase —
dites ce que vous voulez. Ces commandes-ci sont les raccourcis qu'elle
reconnaît. »*

> ⚠ **À vérifier avant de poser ces lignes.** `/help` est constaté — sa
> complétion s'est déclenchée. `/model`, `/clear`, `/resume` sont **plausibles,
> pas vérifiées**. N'inscrire que ce que la TUI expose réellement ; sa propre
> complétion le dira. Une liste d'aide qui propose une commande inexistante est
> pire que pas d'aide.

---

## Ce qui n'a PAS été touché

- **Les quatre thèmes et les trois tailles.** Ils s'appliquent au terminal
  vivant sans le recréer (`term.options.theme`), ce qui est la bonne façon.
- **La séquence sortir → réécrire → réinstaller.** Elle est juste, et c'est
  elle qui empêche de couper le PTY sous les doigts.
- **`.tscreen`, `.tlaunch`, `.tbtn`, `.tpath`, `.tgrp`, `.tsw`, `.tmemo`** —
  repris de la maquette, rien à y refaire.
- **Le texte de l'avertissement**, mot pour mot. Le relais dit « tel quel ou
  plus fort » : il est déjà au bon endroit du registre, c'est sa *place* qui
  était fausse.

---

## Contrat d'interface

Vérifié en jsdom sur les quatre états × actuel/proposé, sans erreur :
`pTerminal` `tside` `tmain` `tecran` `tstate` `tGo` `tSize` `uStock` — tous
présents · `u-tscreen` / `u-tecran` / `u-tstate` conservées, avec leurs quatre
classes jointes · `data-th` (4) et `data-sz` (3) intacts.

**Attribut nouveau** : `data-poser` (poser une commande dans la ligne sans la
lancer) — à ajouter au §2.2 s'il est retenu.

**Classes nouvelles**, toutes préfixées et sans recouvrement : `p-quoi`,
`p-avert-haut`, `p-repli`, `p-poser`, `p-fam`, `p-tui`, `p-note-tui`,
`p-sep`, `p-fort`, et pour la passe 2 : `p-outils`, `p-pop`, `p-plein`,
`p-sortie`.

**Trois `id` nouveaux** dans la barre de titre : `pApp`, `pMem`, `pFull` — et
leurs deux replis `popApp` / `popMem`. À nommer selon la convention du produit
au moment de l'appliquer ; ce qui compte est qu'ils existent et que les deux
replis s'excluent.

> ~~**À décider :** les deux classes d'état du panneau.~~ **Tranché le
> 2026-08-09 par le code, et bien tranché :** une seule classe,
> `u-term-repos` / `u-term-ouverture` / `u-term-ouvert` / `u-term-coupe`, posée
> par `majTermEtat()` et par rien d'autre. Les quatre états s'excluent : avec
> deux booléens, « en ouverture ET ouvert » est représentable ; avec une
> classe, il ne l'est pas. **On ne teste pas un état impossible, on
> l'empêche.** Dans cet aperçu, `p-ouvert` / `p-ouverture` restent — c'est un
> banc d'essai, pas le produit.
