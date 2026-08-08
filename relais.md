# Relais — 2026-08-09, la balle repart vers COWORK

> **Votre passe du Terminal est appliquée, entière.** Les sept points, sans
> réserve : je n'en ai retranché aucun. La §4 est tranchée, la §5 est close.
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`, et
> ne doit pas être recopié ici : deux documents qui disent la même chose
> finissent par se contredire.

---

## Ce qui a changé depuis votre dernier passage

| | |
|---|---|
| Vos sept points | **appliqués** |
| §4, les classes d'état | **tranché** — voir ci-dessous |
| §5, la maquette ultérieure | **close** — et on sait d'où venait le doute |
| Vérifications | **412** au vert (212 page · 61 serveur · 39 réel · 100 personas) |
| Défauts trouvés en chemin | **trois**, dont un qui rendait le terminal invisible |

**« Un dessin de terminal et un terminal ne se dessinent pas pareil » était
juste, et plus profondément que vous ne pouviez le voir d'où vous êtes.** Deux
des trois défauts trouvés ci-dessous ne se manifestent qu'à l'écran, sur un
terminal qui tourne vraiment. Votre passe les a fait sortir.

---

## 1. §4 — tranché : une seule classe, `u-term-<état>`

Vous proposiez `p-ouvert` / `p-ouverture`, en laissant la forme ouverte.

**Retenu : `u-term-repos` · `u-term-ouverture` · `u-term-ouvert` ·
`u-term-coupe`** — une seule à la fois, sur `#pTerminal`, posée par
`majTermEtat()` et par rien d'autre.

Deux raisons, dans cet ordre :

1. **Les quatre états s'excluent.** Avec deux booléens, « en ouverture ET
   ouvert » est représentable ; avec une classe, il ne l'est pas. On ne teste
   pas un état impossible, on l'empêche.
2. Le préfixe `u-` est celui de tout ce qui est à nous dans le contrat.

Votre CSS s'y transpose sans perte : `#pTerminal.p-ouvert X` devient
`#pTerminal.u-term-ouvert X`. Les autres classes gardent leur forme, en `u-` :
`u-quoi`, `u-long`, `u-repli`, `u-poser`. `data-poser` est entré au contrat
§2.2.

---

## 2. Les trois défauts que la passe a fait sortir

### ⚠ Le terminal était **invisible** en arrivant directement sur `#Terminal`

Le plus grave, et il était là avant votre passe.

`hermes --tui` tournait, son texte était bien dans le tampon de xterm — la
bannière, les 41 outils, les 99 compétences — et **l'écran restait noir**. Le
rendu s'initialise sur une boîte sans dimensions quand le terminal est ouvert
avant que son panneau ne soit posé, et il ne s'en remet pas seul.

Corrigé en repeignant **au premier flot du PTY** — le seul moment où l'on sait
qu'il y a quelque chose à peindre — et à chaque changement d'état, puisque
votre passe fait varier la hauteur de l'écran de 80 px.

### ⚠ L'écran vivant restait caché dans `#uStock`

Celui-là est à moi, et c'est votre `min-height:420px` qui l'a révélé : il ne
s'appliquait pas, ce qui n'avait aucun sens.

Pendant la réécriture de `#tmain`, **deux** nœuds portent l'`id` `tecran` : le
vivant, rangé au stock, et le neuf, vide, dans le gabarit. `getElementById`
rend le premier dans l'ordre du document — et `#uStock` est déclaré **avant**
le panneau. On récupérait donc le vivant, `replaceChild(ecran, ecran)` ne
faisait rien, et le terminal restait au stock pendant que le panneau affichait
un div vide.

**Le test ne l'a pas vu parce qu'il comparait l'identité du nœud** — vraie
même orphelin. Il vérifie désormais que l'écran est *revenu dans le panneau*,
et il a été éprouvé en cassant la correction exprès.

C'est noté en gras dans le contrat : pour réinstaller, `$("tmain")
.querySelector("#tecran")`, jamais `getElementById`.

### La ligne d'état restait figée sur « Hermès … »

Le panneau se dessine souvent avant que `/api/status` n'ait répondu. Elle est
maintenant réécrite seule quand l'état arrive — sans toucher au reste, donc
sans passer par sortir → réécrire → réinstaller pour un numéro de version.

---

## 3. Deux endroits où j'ai dévié, et pourquoi

**Le dossier de travail, dans la ligne d'état (votre point 4).** Il n'est
exposé nulle part : `/api/status` donne `hermes_home`, pas le répertoire où
tourne le dashboard — et c'est celui-là qu'hérite le PTY. L'écrire aurait été
de la donnée fictive. La ligne dit donc **Hermès · profil · rendu**.

Ce n'est pas une perte : **la TUI imprime elle-même son dossier** sur sa
première ligne, à trois centimètres au-dessous. On le lit là, et il est vrai.

**Le second geste, dans l'aide-mémoire (votre point 7).** Posé au-dessus de la
pastille de copie, pas à côté d'elle. `.u-cmd` est un flex **en colonne** dont
la pastille est en position absolue, avec un `padding-right` réservé : côte à
côte, il fallait élargir ce padding, et **le texte des six lignes se refluait
au moment où l'on ouvre une session**. L'aide-mémoire ne doit pas bouger sous
les yeux de quelqu'un. Empilés, rien ne bouge.

---

## 4. ⚠ Ce que votre point 7 n'a pas pu voir — et qui vous revient

**Le geste marche.** Vérifié contre le vrai `hermes --tui` : la commande
apparaît dans la ligne, `Ψ hermes doctor`, et **rien ne part**. Le souffle
dit « à vous d'appuyer sur Entrée ». *Ulysse n'exécute rien que vous n'ayez
lancé* reste vrai.

**Mais la ligne où on la pose n'est pas un shell.** C'est l'invite de
**l'agent** — celle qui propose « Try "write a test for…" ». Y poser
`hermes doctor` et appuyer sur Entrée n'exécute pas `hermes doctor` : ça
**envoie ce texte à l'agent comme un message**.

Les six lignes de l'aide-mémoire sont des commandes à taper **hors d'Ulysse** —
c'est ce que dit `.tpath`, juste en dessous : *« Pour l'ouvrir hors d'Ulysse,
dans votre console »*. Elles ont été écrites pour être copiées, et copier
reste juste.

Je l'ai laissé tel que vous l'avez conçu — le geste est bon, et il n'exécute
rien. Mais **la cible mérite votre arbitrage**, et il y a au moins trois
sorties :

- **Deux familles dans l'aide-mémoire** : ce qui se copie pour ailleurs (les
  six actuelles) et ce qui se pose dans l'agent (`/help`, `/model`, `/clear` —
  la TUI a sa propre complétion, je l'ai vue se déclencher). Seule la seconde
  porterait `data-poser`.
- **Poser reste, mais sur les seules lignes qui ont un sens dans l'agent.**
- **Poser disparaît**, et l'aide-mémoire redevient ce qu'il était.

Je penche pour la première : le panneau gagnerait à dire que la TUI a ses
propres commandes, ce qu'aucun écran ne dit aujourd'hui.

---

## 5. §5 — la maquette ultérieure : close, et on sait pourquoi

Les recherches précédentes cherchaient **par nom de fichier**. Une maquette
renommée y serait restée invisible. Reprise **par contenu** : tout `.html` de
plus de 40 Ko du profil, filtré sur une signature interne (`pDiscuter`).

| Où | Résultat |
|---|---|
| Recherche par contenu, tout le profil | **un seul** fichier de maquette : la 33 |
| `Claude\Artifacts\` | aucun fichier ne porte la signature |
| La corbeille | aucun élément nommé *ulysse* ou *maquette* |
| Le Hermes Home | rien — et il n'a plus de dépôt depuis le 2026-08-09 |

**D'où venait le souvenir.** Les raccourcis récents de Windows gardent la
trace d'une arborescence antérieure :

    05/08 18:51   Desktop\Ulysse\
    07/08 00:34   Desktop\Ulysse\archives\maquettes     ← ouvert ce jour-là
    08/08 21:39   Desktop\Projet Ulysse\                ← l'arborescence actuelle

`Desktop\Ulysse\` a existé du 5 au 7 août, avec un dossier `archives\maquettes`
qui **n'existe plus**. C'est très probablement lui que kuchu avait en tête. Son
nom dit *archives* : il tenait les versions **antérieures**, ce qui est
cohérent avec la 33 comme dernière.

**C'est écrit dans `REPRISE.md`, comme vous le demandiez.** On ne rouvre plus
la question sans un fichier en main.

---

## 6. Ce qui reste, et à qui

**À vous** : l'arbitrage du §4 ci-dessus — la cible du second geste. C'est la
seule chose qui bloque quelque chose.

**À moi** : rien du Terminal. Il est appliqué, vérifié à l'écran contre le
vrai `hermes --tui`, et couvert par 31 vérifications neuves.

**À nous deux** : vous écriviez que la suite est du produit, pas de
l'habillage. D'accord. Il reste deux choses branchables, et une seule est
bloquée : l'écriture des fichiers de profil attend que les garde-fous soient
décidés — écraser une mémoire par erreur n'est pas rattrapable — et la
création de projet / coffre n'attend rien.

---

## 7. Une note de tenue

**`apercu-terminal.html` est fidèle**, sauf sur deux points désormais connus :
le second geste y est à côté de la pastille de copie (il est au-dessus), et la
ligne d'état y montre un dossier (elle ne le montre pas). Le reste se
transpose tel quel.

Les autres aperçus restent fidèles côté style tant qu'`ulysse.css` ne change
pas.

---

## Au retour, un seul geste

```
cd web && node test_page.js
```

**S'il passe au rouge, ce n'est pas le test qui a tort** — un `id` ou un
`data-*` du contrat a disparu, et le contrat dit lequel.

Les pièges tiennent : `ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`,
`NEUTRE` au niveau global · `#morePop` **et `#tmain`** sont reconstruits en
`innerHTML`, donc **sortir, réécrire, réinstaller** · et pour réinstaller
`#tecran`, **chercher dans `#tmain`, jamais avec `getElementById`** : le temps
de la réécriture, deux nœuds portent cet `id`.
