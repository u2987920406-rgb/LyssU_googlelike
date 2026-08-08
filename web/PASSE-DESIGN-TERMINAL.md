# Passe de design — le Terminal

Aperçu : `apercu-terminal.html` (autonome, quatre états jouables).

> ⚠ **`#tecran` est rempli dans l'aperçu, pour montrer.** Dans le produit il
> doit rester **vide** dans le gabarit — `drawTerm()` y réinstalle le nœud
> vivant après avoir réécrit `#tmain`. Rien de ce qui suit ne touche à cette
> séquence : sortir → réécrire → réinstaller.

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

Elle dit maintenant ce qui concerne cet écran : le binaire, le dossier de
travail, et d'où vient le rendu.

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

## 7. L'aide-mémoire a changé d'usage

Ces six lignes servaient à **copier pour aller taper ailleurs**. Il y a
maintenant un terminal juste à côté : elles peuvent y être **posées**.

Deux gestes par ligne, donc : copier (inchangé) et poser. Et **jamais
l'exécution** — on insère la commande dans la ligne sans la valider. C'est à la
personne d'appuyer sur Entrée.

> *Ulysse n'exécute rien que vous n'ayez lancé.* C'est ce que dit le panneau
> depuis le début, et ça doit rester vrai maintenant qu'il en a les moyens.

Le second geste n'apparaît qu'en session ouverte : poser une commande dans un
terminal fermé n'a pas de sens.

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
`p-avert-haut`, `p-repli`, `p-poser`, et les deux classes d'état du panneau
`p-ouvert` / `p-ouverture`.

> **À décider :** les deux classes d'état du panneau. J'ai employé `p-ouvert`
> pour rester dans le préfixe de l'aperçu, mais elles vivront dans le produit —
> `u-ouvert` / `u-ouverture` serait plus cohérent avec le reste, ou une seule
> classe `u-term` portant l'état comme le fait déjà `#tstate`. À vous de
> choisir la forme ; ce qui compte est qu'une seule chose la pose, comme
> `majEtats()`.
