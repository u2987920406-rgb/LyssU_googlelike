# Passe de design — Vestiaire

Aperçu : `apercu-vestiaire.html` (autonome). Les 6 rôles verbatim
d'`ulysse-app.js`, et 42 compétences avec les provenances qu'Hermès renvoie
réellement (99 en production).

---

## 1. Le défaut principal : le volet de détail est coupé

Ce n'est pas un goût. `ulysse.css` prévoit deux enfants pour ce volet :

```css
.vdet     { flex:0 0 330px; display:flex; flex-direction:column; overflow:hidden }
.vdet-head{ height:46px; flex:none; padding:0 8px 0 18px }
.vdet-body{ flex:1; overflow-y:auto; padding:0 18px 18px }
```

`drawVDetail()` écrit le contenu **directement dans `#vdet`**. Trois
conséquences, toutes visibles à l'écran :

1. **Aucun padding** — le texte colle aux quatre bords du volet.
2. **`overflow:hidden` sans `.vdet-body`** — un contenu long est *coupé*, et
   rien ne défile. Les prompts de rôle font 150 à 200 caractères ; on ne peut
   pas les lire en entier.
3. Le `<h2>` n'est stylé que par `.sheet h2` (l. 706). Hors d'une feuille
   modale, il prend la taille par défaut du navigateur — **2 em ≈ 32 px** —
   dans un volet de 330 px de large.

**Correctif :** rétablir les deux enfants, et reprendre `.vhero` pour la tête
(avatar 52 px + nom 18 px). `.vhero` est dans `ulysse.css` depuis la maquette
et n'a jamais servi.

Vérifié en jsdom : en l'état, `#vdet .vdet-body` = **0**. Dans la proposition,
`.vdet-head`, `.vdet-body` et `.vhero` sont présents et le `<h2>` a disparu.

---

## 2. Quarante-deux tuiles à plat ne sont pas une liste

La maquette montrait **six** agents : une grille suffisait. Hermès en déclare
**99**. À plat, sans autre ordre que celui du serveur, on ne cherche plus — on
fait défiler jusqu'à tomber dessus.

Les compétences portent déjà leur `provenance` (le champ existe, le volet de
détail l'affiche). Chaque origine devient une **section repliable** avec son
compte, et le nombre de désactivées quand il y en a :

```
anthropic-skills   8
hermes-core        10 · 1 désactivée
projet:Ulysse      5
personnel          5 · 1 désactivée
plugin:…
```

Mêmes tuiles, mêmes `data-i`, même sélection : **c'est un rangement, pas un
autre écran.**

Les rôles restent à plat — ils sont six, et six choses ne se rangent pas.

---

## 3. Un bug de sélection, à corriger côté code

`vSel` est un **index dans la liste filtrée**, et il n'est jamais remis à zéro :

```js
let vMode = "roles", vSel = 0, vFiltre = "", skillsCache = null;
// …
$("vgrid").querySelectorAll("[data-i]").forEach((t) => {
  t.onclick = () => { vSel = +t.dataset.i; drawVestiaire(); };
});
drawVDetail(L[vSel]);
```

Sélectionnez la 40ᵉ compétence, tapez un filtre qui n'en retient que deux :
`vSel` vaut toujours 39, `L[39]` est `undefined`, et le volet se vide — ou pire,
affiche une autre entrée que celle qui est surlignée.

**Correctif :** remettre `vSel = 0` quand la liste change (filtre ou mode), ou
mieux, garder la **sélection par identité** (`vSelId`) plutôt que par index, et
la retrouver dans la nouvelle liste. La seconde solution est la bonne : elle
préserve la sélection quand le filtre ne l'exclut pas.

L'aperçu applique le garde-fou minimal (`if (vSel >= L.length) vSel = 0`) — le
produit ne le fait pas.

---

## 4. La réserve technique sort du premier plan

> « Activer ou désactiver une compétence depuis Ulysse passera par
> `POST /api/skills/toggle`, qui existe déjà. Non branché tant que l'effet sur
> les sessions en cours n'est pas tranché. »

La réserve est juste et doit rester — la règle STU-1 interdit de laisser croire
qu'un bouton agit. Mais elle occupe un tiers du volet, en encadré, sur
**chacune des 99 compétences**. Elle passe au pied, en une ligne, en `--faint`.

---

## 5. Ce qui n'a PAS été touché

- **`.tile`** et sa grille (`repeat(auto-fill,minmax(212px,1fr))`) : reprises
  fidèlement de la maquette, rien à y refaire.
- **`#newAgent`** (le `ghost-btn` de la maquette) : on ne crée pas une
  compétence depuis Ulysse, et il n'y a pas d'endpoint pour ça. L'ajouter
  serait promettre un pouvoir qui n'existe pas.
- **Les trois vues de la maquette** (Agents · Équipes · Vérification) : Hermès
  n'a ni équipes ni vérification. Les deux vues du produit (Rôles ·
  Compétences) correspondent à ce qui existe.
- **`.stack`** (les avatars empilés des équipes) : sans équipes, sans objet.

---

## 6. Contrat d'interface

Vérifié en jsdom sur les deux vues × actuel/proposé, sans erreur JS :
`pVestiaire` `vseg` `vgrid` `vdet` `vmeta` `vq` `icSearch` — tous présents ·
`data-v` (2 dans le panneau) · `data-i` (6 puis 42) — intacts, y compris une
fois les groupes en place.

**Attribut nouveau**, à ajouter au contrat §2.2 s'il est retenu : `data-g`
(replier un groupe de provenance).
