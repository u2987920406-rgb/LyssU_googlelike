# Relais — 2026-08-09 (2), la balle repart vers COWORK

> **Vos trois retours sur le plein écran sont appliqués, et le bouton
> « console » ouvre maintenant une vraie fenêtre.**
>
> Cette manche n'a pas produit de nouvel écran : elle a produit **quatre
> défauts trouvés**, dont trois qui ne se voyaient pas en regardant la page.
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`.

---

## Ce qui a changé depuis votre dernier passage

| | |
|---|---|
| Plein écran : le « … » qui prenait de la place | **retiré** |
| Plein écran : comment revenir | **dit à l'écran**, plus seulement Échap |
| « Copier hermès » | **devenu « Ouvrir une console Hermès », et il ouvre** |
| Vérifications | **494** au vert (259 page · 96 serveur · 39 réel · 100 personas) |
| Défauts trouvés | **quatre** |

---

## 1. Le plein écran : ce que kuchu voyait, et pourquoi

Le retour était : *« je voulais en plein écran sans "…" qui prend de la
place »*, et *« rien ne dit à l'utilisateur comment revenir »*.

**La cause n'était pas le "…"**, c'était `.tmain` qui **défilait**. L'écran ne
s'étirait donc jamais jusqu'en bas, le contenu de fin restait là, et la ligne
de sortie — qui existait — **partait hors de vue en défilant**. Un bouton de
retour présent mais invisible ne vaut pas mieux qu'un bouton absent.

`.tmain` ne défile plus en plein écran, `.tscreen` prend la place restante, et
tout ce qui n'a rien à y faire est masqué : l'avertissement, la barre de
lancement, le coût, les tâches, les replis.

**La phrase de retour est dans la ligne de sortie elle-même**, pas ailleurs :
c'est le seul endroit dont on est sûr qu'il reste visible.

---

## 2. Le bouton qui promettait moins que son nom

Votre question était juste : *« à quoi sert "copier hermès" ? »*. Il copiait
une commande et disait de la coller ailleurs.

Il ouvre maintenant une vraie console — `POST /ulysse/console`, quatrième
route locale. **C'est le seul endroit où Ulysse lance un processus sur la
machine**, donc il est étroit : la commande est écrite en dur dans `serve.py`,
la route ne lit aucun paramètre, et la fenêtre est **visible** — un lancement
qu'on ne verrait pas serait une porte dérobée.

Le bouton voisin copie toujours, pour qui préfère coller ailleurs. Les deux
gestes existent, chacun sous son vrai nom.

> ⚠ **Ne le rebaptisez pas « Copier ».** Un libellé qui promet moins que ce
> qui se passe est aussi faux qu'un libellé qui promet plus.

---

## 3. Les quatre défauts

### ⚠ Le lanceur aurait ouvert une boîte d'erreur, pas un terminal

La commande était `start Hermes cmd /k hermes`. Or `start` ne prend un premier
mot pour un **titre** que s'il est entre guillemets — sinon c'est le
**programme à lancer**. Windows cherchait donc un programme nommé « Hermes »,
ne le trouvait pas, et ouvrait une **boîte d'erreur modale**.

Six tests passaient au vert. Tous détournaient le lanceur : la commande
n'avait **jamais été exécutée**. C'est kuchu qui a vu la boîte à l'écran.

**Un test qui remplace ce qu'il vérifie ne vérifie que le reste.** La forme
retenue a été éprouvée pour de vrai, et le test épingle maintenant le piège :
le titre remis à `start` doit rester vide.

### ⚠ « Revenir à la version précédente » rendait la mauvaise, une fois sur quatre

Les versions étaient classées par la **date du fichier**. Mais la copie hérite
de la date de l'original — deux écritures rapprochées portent donc la **même**
date, et l'égalité se tranchait dans l'ordre où le système rend les fichiers :
au hasard.

Le test comparait `date[0] >= date[-1]` — vrai d'office quand elles sont
égales. Il regardait précisément à côté du défaut. Il lit maintenant le
**contenu** des versions, qui dit sans ambiguïté laquelle est laquelle.

C'est le pire des quatre : cet écran existe pour qu'on puisse revenir en
arrière sans crainte.

### ⚠ Une route qui « ne lit aucun corps » perdait sa propre réponse

Répondre sans lire le corps d'une requête laisse des octets dans la connexion.
Le serveur ferme, le système coupe net, et **la réponse déjà écrite se perd**.

« Ignorer le corps » doit vouloir dire **le lire et ne pas s'en servir**. La
vidange est faite une fois pour toutes avant toute réponse — une route écrite
demain ne pourra pas oublier de le faire.

### Un test interdisait un caractère au lieu de figer la commande

Il vérifiait l'absence de `&` dans la commande, comme garde contre l'injection.
La vraie garantie n'est pas là : c'est que **rien de ce qui arrive du
navigateur n'entre dans la commande**. Le test fige donc la commande mot pour
mot — si quelqu'un change ce qui s'ouvre chez les gens, il tombe.

---

## 4. Ce qui reste, et à qui

**À vous**, toujours, et c'est chez vous : **`.srow2`, le nom et la
description se collent** — *« Fournisseur de mémoireCe qui garde… »*. `.nm` et
`.sub` sont des `span` sans `display:block`, tel quel dans
`maquette-ulysse-google-33.html` ligne 3853. Ça touche **toutes** les lignes
des Réglages. Je n'y ai pas touché : la feuille vous appartient.

**À moi** : rien de bloqué.

---

## Au retour, un seul geste

```
cd web && node test_page.js
```

**S'il passe au rouge, ce n'est pas le test qui a tort** — un `id` ou un
`data-*` du contrat a disparu, et le contrat dit lequel.

Les pièges tiennent : `ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`,
`NEUTRE` au niveau global · `#morePop` **et `#tmain`** sont reconstruits en
`innerHTML`, donc **sortir, réécrire, réinstaller** · pour réinstaller
`#tecran`, **chercher dans `#tmain`, jamais avec `getElementById`** · `.panel`
porte `z-index:1`, donc tout plein écran doit lever le panneau lui-même ·
**l'écriture passe par `serve.py`, jamais par `/api/fs/write-text`** · et
`#pTerminal .term.u-plein` a besoin de `.term` dans le sélecteur, sinon la
règle des replis, de même poids et écrite plus bas, la reprend.
