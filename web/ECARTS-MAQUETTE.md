# Les écarts voulus entre `ulysse.css` et la maquette

`ulysse.css` porte en tête : *« EXTRAIT VERBATIM de
maquette-ulysse-google-33.html… la maquette EST le produit fini, donc elle est
la source. »*

C'est juste, et ça doit le rester. Mais **la maquette est la source pour les
décisions, pas pour les coquilles.** Une décision se respecte ; une coquille se
corrige — et l'écart se note, sinon le prochain diff la « restaure ».

Ce fichier est ce registre. **Il n'y a rien d'autre : tout le reste de
`ulysse.css` est verbatim.**

---

## Comment on distingue une décision d'une coquille

Trois questions, dans cet ordre. Il faut les trois.

1. **Le rendu contredit-il visiblement l'intention du reste de la règle ?**
   Un `margin-top` sur un élément qui ne peut pas en avoir n'est pas un choix,
   c'est un oubli.
2. **La maquette montrait-elle ce cas ?** Un défaut qui ne se voyait pas dans
   la maquette n'y a jamais été arbitré — il n'y a donc pas de décision à
   respecter.
3. **La correction change-t-elle autre chose que le défaut ?** Si oui, ce n'est
   plus une correction, c'est une passe de design : elle passe par un document
   de passe, pas par ce registre.

En cas de doute, on ne corrige pas : on le signale dans un relais.

---

## Écart 1 — `.srow2 .nm` et `.srow2 .sub`

**Signalé par le code le 2026-08-09.** Visible sur *toutes* les lignes des
Réglages : *« Fournisseur de mémoireCe qui garde ce qu'Ulysse retient… »*

`ligne()` (`ulysse-view.js`, repris verbatim de la maquette) émet deux `span`
collés :

```html
<span class="txt"><span class="nm">…</span><span class="sub">…</span></span>
```

Sans `display:block`, ils se suivent sur la même ligne, et le `margin-top:2px`
de `.sub` ne s'applique pas — un inline n'a pas de marge verticale.

**Ce `margin-top` est la preuve de l'intention.** Il n'a de sens que sur un
bloc. La maquette porte la même coquille, ligne 3853.

```css
.srow2 .nm{display:block;font-weight:500}
.srow2 .sub{display:block;…}
```

## Écarts 2, 3 et 4 — la même coquille, trois autres endroits

Trouvés en cherchant si le défaut était isolé. **Il ne l'était pas** : quatre
règles posent un espacement vertical sur un élément qui ne peut pas en avoir.

| | Où | Pourquoi ça ne se voyait pas |
|---|---|---|
| **2** | `.defl .dn` / `.dt` | le premier lancement n'a jamais été branché |
| **3** | `.dryline .dn` / `.dt` | l'essai à blanc n'existe pas dans le produit |
| **4** | `.fhead .nm` / `.fp` / `.sub` | la fiche a été réécrite avec `<h2>`, qui est un bloc |

Les trois portent `margin-top`, comme la première. Même diagnostic, même
correction.

> **L'écart 4 mérite une note.** `.fhead` était employé dans le produit avec un
> `<h2>` à la place de `.nm` — ce qui masquait la coquille et en créait une
> autre (le `<h2>` prenait 32 px dans un volet de 330, corrigé par la passe du
> Vestiaire). Les deux venaient du même endroit : personne n'avait regardé ce
> que `.fhead` attendait vraiment.

---

## Ce qui n'a PAS été corrigé, et pourquoi

- **`.ask .q`**, `.sheet .sub`, `.firstcard .q`, `.exp-h .n` / `.t` portent
  aussi un espacement vertical sans `display`. Mais ce sont des enfants de
  conteneurs `flex` ou `grid`, ou bien ils sont émis comme `<div>` : le
  contexte les rend blocs, la règle s'applique, il n'y a pas de défaut.
  **Une règle suspecte n'est pas une règle fautive.**
- **`.dette .tx`** n'a que `flex:1` — c'est un enfant flex, tout va bien.

> ⚠ **`.exp-h .t` était bien fautif, mais pas pour la raison examinée ici.**
> Ce registre l'avait innocenté sur la question du `display`, et il avait
> raison sur ce point. Le défaut était ailleurs, dans le même `flex:1` : c'est
> `1 1 0%`, donc une **base nulle**. Le titre de l'étape ne recevait que ce
> qui restait après la pastille d'état, qui gardait sa largeur de contenu.
> Mesuré le 2026-08-12 en « Les deux » sur 859 px : volet 258, ligne 214,
> titre **48 px** — « Cadrage 2025 » se rendait une syllabe par ligne. En
> « Détail » seul, la même ligne est parfaite. Corrigé en base `auto` des deux
> côtés. **Innocenter une règle sur une question ne l'innocente pas sur les
> autres.**

---

## Si vous ajoutez un écart

Une entrée ici, un commentaire `── ÉCART VOULU no N ──` à l'endroit du CSS, et
la raison. Les deux, pas l'un ou l'autre : le commentaire seul se perd dans
85 ko, le registre seul ne se voit pas quand on lit la feuille.

**Et une vérification dans `test_page.js`** — ajoutée le 2026-08-09, côté code.

Ce registre dit *pourquoi*. Il n'empêche rien : une prochaine extraction
verbatim de la maquette restaurerait la coquille en silence, ce que ce
document nomme lui-même comme le risque. Les neuf vérifications de la section
« écart · … » l'empêchent.

Elles sondent avec de vrais `span` — un `div` serait bloc de toute façon, et
la vérification passerait aussi bien avec le défaut qu'avec sa correction.
Éprouvées en annulant deux des quatre écarts : elles tombent, en disant
`inline`.

---

## Les aperçus RECOPIENT la feuille

> **Ils sont ONZE depuis le 2026-08-09** — `apercu-projets.html` est arrivé
> après l'écriture de cette section. Le compte est écrit ici, dans
> `resync_apercus.py` et dans `test_page.js` : **les trois doivent bouger
> ensemble.** Un aperçu hors du compte est précisément la divergence
> silencieuse que cette section existe pour empêcher — et elle a failli
> arriver la première fois.

Ils doivent s'ouvrir d'un double-clic, seuls, sans serveur. Autant de copies
que de fichiers — et autant d'occasions de diverger **en silence**. Un aperçu qui a divergé
ne casse pas : il **ment**, et c'est pire.

Cowork l'a signalé le 2026-08-09 : *« si tu touches à ulysse.css et que je ne
repasse pas, les aperçus divergeront en silence. Dis-le-moi. »*

**Une garantie qui repose sur quelqu'un qui pense à le dire finit par céder.**
Celle-ci se mesure — la copie est identique octet pour octet :

- `test_page.js` compare chaque **bloc entier** et tombe dès qu'un diverge ;
- `python resync_apercus.py` répare, en une commande.

> ⚠ **La limite, et elle est réelle.** `resync_apercus.py` recopie la
> **feuille**, rien d'autre. Le gabarit, les scripts et les notes d'un aperçu
> lui appartiennent : s'ils vieillissent, aucun test ne le dira. Resynchroniser
> n'est pas redessiner.

*Comparer par inclusion ne suffit pas.* Le test a d'abord été écrit en
`indexOf(CSS) >= 0` : il laissait passer un aperçu portant la feuille **plus**
des règles en trop — la divergence la plus probable. Le trou s'est montré tout
seul, sur 26 octets oubliés.
