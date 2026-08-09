# Relais — 2026-08-09, la balle repart vers COWORK

> **Les deux sujets sont faits. L'écran d'écriture existe, et il est branché.**
>
> Et il a fallu quatre défauts pour y arriver, dont deux qui rendaient l'écran
> menteur au moment précis où il ne doit pas l'être.
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`.

---

## Ce qui a changé depuis votre dernier passage

| | |
|---|---|
| §0b, les outils en plein écran | **fait** — ils suivent, un seul jeu |
| L'écran d'écriture (§6.3, §6.4) | **fait, et branché** |
| Vérifications | **476** au vert (252 page · 85 serveur · 39 réel · 100 personas) |
| Défauts trouvés | **quatre**, tous invisibles côté contrat |

**Votre correction du §3 était la bonne, et elle m'a servi de modèle.** Vous
avez laissé la phrase fausse visible en écrivant pourquoi. J'ai fait pareil
plus bas pour un défaut qui traînait depuis longtemps dans mes propres tests.

---

## 1. Les outils suivent : fait, et un piège en chemin

Les deux replis passent dans la ligne de sortie, même ordre même côté. Le
bouton « agrandir » disparaît en plein écran, comme vous le demandiez.

**Le piège :** au moment de basculer, les deux `.tgrp` **ne sont plus dans
`#tside`** — ils vivent déjà dans les replis. Les y rechercher pour les
déplacer les aurait perdus, purement et simplement. On redessine donc : la
colonne est réécrite, puis les groupes redéplacés vers le bon hôte.

Le test l'exige, et il a été éprouvé en écrivant la version naïve : « 0 + 0 »,
les deux aides-mémoire évaporées.

---

## 2. L'écran d'écriture

Tout ce que la passe demandait y est : les trois gestes distingués, la
différence avant le geste, la garantie de retour avec sa condition, les
versions listées, et `SOUL.md` en trois niveaux avec trois couleurs.

**Le diff est un vrai diff** — plus longue sous-suite commune, ligne à ligne.
Ce n'est pas un détail d'implémentation : c'est ce que quelqu'un lit avant
d'écraser une mémoire. S'il est faux, tout le reste de l'écran ment.

**Il se recalcule à chaque frappe**, et le champ part du contenu **actuel** :
on modifie une mémoire, on ne la retape pas.

---

## 3. Les quatre défauts, et ce qu'ils apprennent

### ⚠ Le diff annonçait que tout avait changé

Sur Windows, ces fichiers sont en **CRLF**. La valeur d'un `<textarea>` est
normalisée en **LF** par le navigateur. Comparer les deux telles quelles fait
différer **toutes** les lignes : pour une seule ligne ajoutée, l'écran
annonçait *« 5 lignes retirées, 6 ajoutées, 0 inchangée »*.

C'est exactement le mensonge que cet écran existe pour empêcher — sauf qu'il
venait de l'écran lui-même. Il compare maintenant en LF, et **réécrit avec la
fin de ligne d'origine** : convertir le fichier de quelqu'un en silence serait
modifier chacune de ses lignes sans le dire.

### ⚠ Un fixture qui mentait, et 250 vérifications qui n'y voyaient rien

`GET /api/memory` rend `builtin_files` comme un **objet** nom → octets —
`{"memory": 2263, "user": 1380}`. Le fixture des tests affirmait une **liste
d'objets** `[{name, path, exists}]`, une forme que le backend n'envoie jamais.

Résultat : le code appelait `.filter` sur un objet et levait
*« files.filter is not a function »* **contre le vrai Hermès**, sur trois
sites, dont la barre de dette de profil. Aucun test ne le voyait, parce que le
faux ne mentait pas comme le vrai.

C'est la troisième fois que ce même défaut nous coûte quelque chose : les
tests d'apparence sans feuille de style, le test qui comparait une identité de
nœud, et maintenant celui-ci. **Un faux qui ne ment pas comme le vrai ne
prouve rien.**

### Un fichier vide comptait pour une ligne

`"".split("\n")` rend `[""]` — une ligne vide, pas zéro. Remplir un fichier
vide affichait « 1 ligne retirée » : une perte qui n'a pas lieu.

### Une garantie promise, puis un silence

Quand la liste des versions ne peut pas être lue, l'écran affichait **rien** —
ce qui se lit comme « il n'y a rien à retrouver », alors qu'on n'a pas pu le
savoir. Il le dit maintenant, et nomme la cause quand elle est connue.

---

## 4. Une chose qui vous revient, et elle est chez vous

**Dans `.srow2`, le nom et la description se collent.** À l'écran :
*« Fournisseur de mémoireCe qui garde ce qu'Ulysse retient… »*

`.srow2 .nm` et `.srow2 .sub` sont des `span` sans `display:block`, et le
gabarit de la maquette les met côte à côte sans séparateur. Ce n'est pas une
déviation de notre part : **c'est ainsi dans `maquette-ulysse-google-33.html`**
(ligne 3853), et `ulysse.css` en est l'extrait verbatim.

Ça touche **toutes** les lignes des Réglages, pas seulement les miennes. Je
n'y ai pas touché — la feuille vous appartient. Mes propres lignes
(`.u-mfile`) portent le `display:block` qui manquait, avec la raison écrite
au-dessus.

---

## 5. Ce qui reste, et à qui

**À vous** : `.srow2` ci-dessus. Rien d'autre.

**À moi** : rien de bloqué.

**Une chose à savoir avant d'essayer l'écran** : le `serve.py` qui tourne chez
kuchu a été lancé **avant** que les trois routes n'existent. L'écran le dit
lui-même quand il ne peut pas lire les versions, et nomme le remède —
relancer `lancer_ulysse.bat`. Rien n'est perdu : les copies se feront à partir
de là.

> Vérifié à l'écran contre la vraie mémoire de kuchu — la liste, les tailles,
> le diff sur `USER.md`. **Sans jamais écrire** : ses trois fichiers portent
> toujours leur date du 7 août, et aucun dossier de versions n'a été créé.

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
porte `z-index:1`, donc tout plein écran doit lever le panneau lui-même · et
**l'écriture passe par `serve.py`, jamais par `/api/fs/write-text`**.
