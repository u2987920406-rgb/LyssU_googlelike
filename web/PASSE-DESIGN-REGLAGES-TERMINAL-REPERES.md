# Passe de design — Réglages · Terminal · Repères

Les trois derniers panneaux. Aperçu :
`apercu-reglages-terminal-reperes.html` (autonome ; il recopie aussi
`ulysse-view.js`, d'où viennent `ligne()`, `sw()`, `titre()`, `drawSetNav()` et
`TTHEMES`).

Aucun de ces trois n'a de défaut structurel. Ce qui suit est du réglage de ton,
sauf deux points — le Terminal qui copie une commande invisible, et les Repères
qui promettent plus qu'ils ne montrent.

---

## 1. Réglages : les réserves changent de ton

Quatre des sept sections finissent par un `.u-todo` en pointillés :

| Section | Réserve |
|---|---|
| Ce qu'Ulysse sait | `/api/fs/write-text` — garde-fous d'écriture non décidés |
| Le cerveau | `/api/model/set` — rôle propriétaire du modèle non tranché |
| Sécurité et accords | `approvals.mode` — sous-mode Plan non câblé |
| Connexions | MCP / Telegram — « une clé saisie dans une page est une clé qui traîne » |

**Ces réserves sont justes et doivent rester.** La règle STU-1 interdit de
laisser croire qu'un réglage agit. Mais mises bout à bout, en encadrés
pointillés de la largeur du texte, elles font des Réglages un écran qui parle
surtout de ce qu'il ne fait pas.

Même texte, même place, autre ton : filet gris à gauche, `--faint`, 12 px. Ce
qui est réglable reprend le premier plan ; ce qui ne l'est pas se lit quand on
descend jusque-là.

## 2. Une section qui ne règle rien le dit en haut

« Le cerveau » et « Connexions » n'ont **aucun** contrôle actif. On les
parcourt en entier avant d'apprendre, dans l'encadré du bas, qu'il n'y a rien à
y faire. La mention monte sous le titre.

---

## 3. Terminal : on copiait sans voir quoi

Le bouton dit « **Copier la commande** » et copie `hermes`. La commande n'est
écrite nulle part dans l'écran. Pire : la colonne de gauche propose six
commandes en aide-mémoire — dont aucune n'est celle qui sera copiée.

Deux correctifs, tous deux visibles :

- **La commande apparaît à l'invite**, dans l'écran, là où elle sera tapée. Le
  bouton la nomme : « Copier « hermes » ».
- **Chaque ligne de l'aide-mémoire devient copiable.** Elles sont là pour être
  tapées ; les faire recopier à la main est le seul usage qu'on n'attendait
  pas d'elles.

> L'écran de terminal reste une **image** : Ulysse n'exécute rien. C'est dit,
> et c'est juste tant que `POST /api/pty` n'est pas branché. La réserve sur
> l'émulateur reste telle quelle.

## 4. L'avertissement ne se répète plus mot pour mot

« Les accords donnés dans Ulysse ne s'appliquent pas au Terminal » est écrit
**deux fois, presque à l'identique** — dans *Sécurité et accords* et dans
*Terminal*.

Il est trop important pour disparaître d'un des deux endroits. Mais un
avertissement qu'on a déjà lu ailleurs s'apprend à sauter, et on finit par
sauter les deux. Réglages garde la phrase courte et un lien ; le Terminal garde
le texte complet, là où l'on est sur le point d'agir.

---

## 5. Repères : le titre promet plus que la liste ne montre

> « Chaque signe de l'interface, son nom, et pourquoi il est là. »

`drawGlossary()` filtre sur `I[k].nm || I[k].r`. Or `ulysse-icons.js` déclare
certaines icônes par une **forme** plutôt que par un tracé :

```js
regler:{tune:true}   equipe:{people:true}   point:{circle:true}   noeuds:{nodes:true}
```

Celles-là n'ont ni `nm` ni `r` — le glossaire ne les voit pas. Mesuré :
**24 signes documentés sur 41.** La promesse du titre est fausse d'un tiers, et
rien ne le dit.

Deux réponses, la seconde n'excluant pas la première :

1. **Le vrai correctif** — écrire les `nm`/`r` manquants dans
   `ulysse-icons.js`. Ce sont 17 courtes phrases ; c'est le genre de dette qui
   ne se rattrape jamais si on ne la note pas.
2. **En attendant** — afficher le compte (« 24 sur 41 signes ») et une note qui
   dit lesquels manquent et pourquoi. C'est ce que fait l'aperçu.

## 6. Et un filtre

41 entrées empilées, aucun filtre. C'est un glossaire : on y vient avec un
signe en tête, pas pour le lire en entier. `.search` existe et sert déjà dans
le Vestiaire.

---

## 7. Ce qui n'a PAS été touché

- **Les quatre thèmes du Terminal** (`TTHEMES`) et les trois tailles : bien
  faits, et l'écran n'invente aucun contenu — il montre une invite vide plutôt
  qu'une fausse session. C'est exactement la bonne réserve.
- **`drawSetNav()`**, `.srow2`, `.tag`, `.seth` : repris fidèlement de la
  maquette.
- **La section « Avancé »** et son `/api/status` brut : c'est fait pour
  déboguer, et ça doit rester brut.
- **`.avert` et `.cout`** : le ton est juste, on ne l'adoucit pas.

---

## 8. Contrat d'interface

Vérifié en jsdom sur les 3 panneaux × actuel/proposé, sans erreur JS :
`pReglages` `setnav` `setbody` · `pTerminal` `tside` `tmain` · `pReperes`
`glossary` — tous présents.
`data-sw` · `data-d` (densité) · `data-th` (4 thèmes) · `data-sz` (3 tailles)
— intacts.

**Attribut nouveau**, à ajouter au contrat §2.2 s'il est retenu : `data-cmd`
(une ligne d'aide-mémoire copiable).

Les deux navigations croisées fonctionnent : le lien « Dépenses » du Terminal
ouvre bien Réglages à la bonne section, et le renvoi de *Sécurité et accords*
mène au Terminal.
