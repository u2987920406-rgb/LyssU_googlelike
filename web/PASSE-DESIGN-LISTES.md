# Passe de design — les quatre listes

> **Révisée le 2026-08-08 (2ᵉ passe), après le relevé côté code.** Trois
> points ont changé, et c'est le code qui avait raison :
>
> - les actions de ligne sont **plus larges** que prévu (`PATCH` fait
>   renommer, épingler, archiver) — §1 bis, nouveau ;
> - la **tuile Coffre disparaît** : `projects.tree` ne donne rien dessus, et
>   STU-1 interdit d'inventer — §6 réécrit ;
> - `color` et `icon` existent **par projet** et n'étaient pas employés.

Travaux · Livrables · Projets · Automatisations. Quatre panneaux qui ne font
qu'une chose — montrer une liste — et qui partagent la même structure
(`topbar` + `.body` > `.body-in`). Une seule passe les traite.

Aperçu : `apercu-listes.html` (autonome, données figées, quatre panneaux ×
plein/vide × actuel/proposé).

---

## 1. Le défaut principal : aucune ligne n'a d'action

`.acts` est dans `ulysse.css` depuis la maquette, avec sa règle
d'apparition :

```css
.acts{display:flex;gap:2px;opacity:0;transition:opacity .16s ease}
.row:hover .acts,.pcard:hover .acts{opacity:1}
```

**Les quatre listes du produit ne s'en servent nulle part.** On voit une
session, un fichier, un projet — et on ne peut rien en faire sans sortir de
l'écran. C'est le même oubli que le kebab du Plan : la maquette avait prévu la
place, le produit a repris la ligne sans les gestes.

Elles reviennent, au survol, à droite de la ligne. C'est le seul endroit de ces
écrans où la découverte au survol se défend : la ligne entière est déjà
cliquable et fait l'action principale, les actions sont un supplément.

| Liste | Actions | Hermès |
|---|---|---|
| Travaux | Reprendre | ✅ `session.resume`, déjà câblé |
| | Renommer · Épingler · Archiver | ✅ `PATCH /api/sessions/{id}` (`sessions.py:661`) |
| | **Supprimer** (`.danger`) | ✅ `DELETE /api/sessions/{id}`, idempotent |
| Livrables (fichier) | Poser sur l'Établi · Copier le chemin | ✅ local |
| Livrables (dossier) | Ouvrir | ✅ local |
| Projets | Régler · Copier le chemin | ✅ local |

**Toutes sont tenues par le backend.** La réserve de la première passe est
levée.

---

## 1 bis. Une liste qui grandit se range, elle ne se trie pas

`PATCH /api/sessions/{id}` donne deux pouvoirs que la première passe n'avait
pas demandés : **épingler** et **archiver**. Ce n'est pas un détail
d'implémentation — c'est ce qui décide de la tenue de Travaux au bout de six
mois.

Sans eux, Travaux est un **journal** : le dernier en haut, tout le reste qui
descend. On y retrouve ce qu'on vient de faire, jamais ce qu'on cherche.

Avec eux, **trois rangs** :

| Rang | Ce qu'il contient |
|---|---|
| **Épinglées** | ce sur quoi on revient, en tête, quel que soit l'âge |
| **Récentes** | le journal, inchangé |
| **Archivées** | repliées, avec leur compte |

L'archivage n'est pas la suppression, et c'est tout son intérêt : **on peut
ranger sans avoir à décider si on jette.** Le seul geste rouge reste
« Supprimer ».

Une ligne épinglée porte sa marque dans le titre — on voit *pourquoi* elle est
en haut. Une ligne archivée reste lisible mais perd son fond : elle ne prétend
plus à l'attention.

> **À décider :** faut-il archiver automatiquement au-delà d'un certain âge ?
> Je ne le propose pas — une liste qui se range toute seule fait disparaître
> des choses sans qu'on l'ait demandé. Mais la question se posera quand il y
> aura deux cents sessions.

---

## 2. Travaux : une ligne, deux niveaux

Aujourd'hui trois `.meta` de même poids se suivent :

```
● Passe de design sur Discuter   34 messages · %USERPROFILE%/Desktop/Projet Ulysse/web   Terminée   il y a 3 minutes
```

Le chemin peut faire cent caractères et écrase tout le reste ; la ligne n'a
plus de premier mot.

Proposé : **ce qui identifie en haut, ce qui situe en dessous et en petit.**
Le chemin est réduit à ses deux derniers segments (le complet en `title`), et
la date reste seule à droite, avec une largeur fixe — c'est le seul champ sur
lequel on compare deux lignes du regard.

---

## 3. Un filtre sur Travaux et Livrables

`.search` existe dans `ulysse.css` et n'est utilisé que par le **Vestiaire** —
celui qui en a le moins besoin. Travaux charge 50 sessions
(`REST.sessions(50)`), Livrables ouvre des dossiers qui en contiennent des
centaines.

Même composant, même place que dans le Vestiaire : barre de titre, à droite.

---

## 4. « Rafraîchir » n'est plus un bouton plein

Quatre panneaux, quatre `ghost-btn` de 40 px en évidence. C'est l'aveu que les
listes ne se tiennent pas à jour — or **depuis le jalon 4 elles écoutent
`sessions.changed`** et se redessinent sur événement.

Il devient une icône : atteignable, mais il cesse d'être la chose la plus
visible d'un écran qui n'a rien à décider.

---

## 5. Livrables : le fil d'Ariane devient cliquable

Aujourd'hui : un bouton « racine », puis le chemin en **texte mort**. Pour
remonter d'un seul cran, il faut redescendre à la racine et tout refaire.

Chaque segment devient son propre bouton ; le dernier reste en texte, puisqu'on
y est déjà.

---

## 6. Projets : deux tuiles, pas trois — et leur vraie couleur

La première passe voulait rétablir les **trois** tuiles de la maquette. Le
relevé côté code a tranché autrement, et c'est lui qui a raison.

`projects.tree` renvoie `id, label, path, color, icon, sessionCount,
lastActive, repos, previewSessions` (`project_tree.py:522`).

| Tuile | Verdict |
|---|---|
| Bac à sable | ✅ `path` |
| Mémoire | ✅ `sessionCount` + `lastActive` — des **séances et une date**, pas des journaux |
| ~~Coffre~~ | ❌ **rien.** Ni taille, ni nombre de fichiers |

**La tuile Coffre disparaît.** L'afficher demanderait d'inventer un contenu, et
STU-1 l'interdit. Mieux vaut deux tuiles vraies que trois dont une ment. Ça
règle du même coup le « Coffre — mémoire du profil » du produit, qui mélangeait
les deux notions qu'il fallait distinguer.

### Et la couleur cesse de bouger

`color` et `icon` existent **par projet** — et rien ne s'en sert. Le produit
tire la couleur au **rang dans la liste** :

```js
const COL = ["#1A73E8", "#9334E6", "#E8710A", "#00838F", "#D96570", "#188038"];
// …
'<span class="dot" style="background:' + COL[i % COL.length] + '">'
```

Donc la couleur d'un projet **change dès qu'un autre le dépasse** dans le
classement par date. Une couleur qui bouge n'est pas un repère — c'est du
bruit qui a l'air d'un sens.

On prend celle du projet, et son `icon` à la place de la pastille : une pastille
ronde de 8 px ne porte qu'une couleur, une tuile de 30 px porte une couleur
*et* un signe.

---

## 7. Les états vides disent quoi faire

« Dossier vide. » et rien d'autre. Un écran vide qui ne propose rien oblige à
sortir pour comprendre où l'on s'est trompé. Chaque `.empty` gagne sa seconde
ligne — et le cas « aucun résultat pour ce filtre » est distingué du cas
« il n'y a rien », qui n'appellent pas la même réponse.

---

## 8. Ce qui n'a PAS été touché

- **Automatisations** est le panneau le mieux repris de la maquette : `.acard`,
  `.sw`, `.ahead`, `.abody`, le dépli, la note d'en-tête. Rien à y refaire.
  Une seule réserve : les cartes de **webhook** n'ont pas de `data-open`, donc
  elles ne se déplient pas, alors qu'elles en ont l'air (même `.acard`, mais
  pas de chevron). Soit on leur donne un corps, soit on les distingue
  visuellement des tâches planifiées.
- **La corbeille des Projets** (`.trashbtn`, `POUBELLE`, `.pcard.gone`) et le
  menu « Reprendre où ça s'est arrêté / depuis le début » (`.rmenu`) de la
  maquette : Hermès n'a pas de notion de projet supprimé ni de reprise
  partielle. Les reprendre serait fabriquer des pouvoirs qui n'existent pas.

---

## 9. Contrat d'interface

Vérifié en jsdom sur les 4 panneaux × plein/vide × actuel/proposé, sans aucune
erreur JS :

`works` `livrables` `projets` `autos` · `travRefresh` `livRefresh`
`projRefresh` `autoRefresh` — tous présents.
`data-resume` (5) · `data-dir` · `data-file` · `data-cwd` (3) · `data-tog` (3)
· `data-fire` (3) · `data-wh` (2) · `data-open` (3) — tous intacts.

**Attributs nouveaux**, à ajouter au contrat §2.2 s'ils sont retenus :
`data-a` (l'action d'une ligne) et `data-cr` (un segment du fil d'Ariane).
