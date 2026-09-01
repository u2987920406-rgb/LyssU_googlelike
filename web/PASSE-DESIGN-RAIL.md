# Passe de design — le rail

Le dernier écran que personne n'avait regardé en face. Il porte les dix
panneaux, la cloche et la porte des coulisses : **c'est la seule pièce qui
relie toutes les autres.**

Aperçu : `apercu-rail.html` (quatre destinations × panne × actuel/proposé).

---

## 0. Constaté / supposé

**Constaté**, dans le code :

- `nav()` appelle `drawRail()` mais **n'ouvre jamais les coulisses** ;
- `NKIND` définit quatre genres de notification — **un seul est poussé** ;
- `#dettewrap` vit dans `.stage`, donc s'affiche sur **les dix** panneaux.

**Supposé** : que les genres `livrable` et `auto` puissent être détectés. **Je
ne les propose pas** — voir §4.

---

## 1. On peut être quelque part sans que le menu le dise

`nav()` allume le panneau et redessine le rail, mais si la destination est de
niveau 3 et que les coulisses sont repliées, **aucun bouton n'est actif**.

Quatre chemins y mènent, tous réels :

- l'ancre d'URL (`#Vestiaire`) ;
- « Voir la mémoire », depuis la dette ;
- « Dépenses », depuis le Terminal ;
- avoir refermé les coulisses à la main.

### Deux réponses, et il faut les deux

**Côté code** — `nav()` ouvre les coulisses quand la destination est dedans.
C'est une ligne, et c'est le vrai correctif.

**Côté dessin** — la porte porte une **marque** quand le panneau actif est
derrière elle. Parce qu'on peut la refermer à la main, et qu'alors le problème
revient *sans être un bug*.

> La marque est **`.raildot`**, celle qui signale déjà un panneau concerné par
> une notification. **On ne dessine pas un deuxième signe pour dire la même
> chose** : « il y a quelque chose là-dedans ».

Elle disparaît dès que les coulisses sont ouvertes — le bouton actif se voit
alors tout seul.

---

## 2. Une panne est une notification

`NKIND` définit quatre genres, et **seul `decision` est jamais poussé**. Le
vocabulaire visuel existe en entier ; le produit en emploie un quart.

Or **l'état d'Hermès concerne tous les panneaux.** On l'a rangé dans le kebab de
Discuter — c'était juste pour Discuter, et c'est devenu un angle mort pour les
neuf autres. Depuis le Vestiaire, si le lien tombe, rien ne le dit.

**On ne crée pas un nouveau point qui veille.** C'est ce que la passe de
Discuter refusait déjà : *« un point est plus petit qu'une pastille, mais c'est
toujours un objet de plus qui n'appartient à rien »*. Ici, la cloche
**appartient** à ça : elle est le lieu de ce qui ne va pas, elle est visible
depuis partout, et elle sait déjà marquer le panneau concerné.

Une panne devient donc une notification de genre `panne`. Et
`NKIND.panne.dur` vaut `true` : **elle ne part pas toute seule**, ce qui est
exactement ce qu'on veut d'une panne.

Le badge de la cloche passe en rouge — même signal, autre gravité.

---

## 3. La dette n'a pas à être partout

`#dettewrap` s'affiche sur tous les panneaux et **pousse le contenu** de chacun.

Elle est juste — un profil vide rend les réponses vagues — mais elle n'est pas
également utile partout. Dans le Terminal ou les Repères, **elle parle d'autre
chose que ce qu'on est venu faire.**

Elle reste là où elle a un objet :

| | |
|---|---|
| **Discuter** | c'est là qu'on lit la réponse vague |
| **Réglages** | c'est là qu'on la répare |

Ailleurs, elle se replie. Si on veut qu'elle reste atteignable de partout, le
mécanisme existe déjà : une notification, comme la panne. **Mais je ne le
propose pas** — une dette n'est pas un événement, et la cloche perdrait son
sens à porter un état permanent.

---

## 4. Ce que je ne propose pas, et pourquoi

Les genres **`livrable`** et **`auto`** ne sont pas poussés non plus. Je ne les
touche pas :

- `livrable` supposerait de détecter qu'un fichier a été produit — possible en
  écoutant `tool.complete` sur un `fs.write`, mais c'est une interprétation,
  pas un événement ;
- `auto` supposerait qu'Hermès signale le déclenchement d'un cron. **Je ne sais
  pas si un tel événement existe.**

La panne, elle, est **constatable sans rien supposer** : `lastStatus` est
`null`, `link.state` vaut `denied` ou `closed`. C'est déjà calculé pour
`paintBand()`.

> Trois genres inemployés, un seul proposé. **Le vocabulaire complet n'est pas
> une raison de tout remplir** — c'est une raison de savoir ce qui manque.

---

## 5. Ce qui n'a PAS été touché, et qui est bon

- **Les deux vitesses du survol** — 140 ms sur la lisière, 520 ms sur la bande.
  Le commentaire du CSS explique pourquoi, et c'est juste : *« un menu qui
  s'ouvre quand on passe est un menu qui s'ouvre par erreur »*.
- **Le retrait de `backdrop-filter`**, et l'`overflow:hidden` au repos qui
  supprime le survol fantôme des libellés débordants. Deux défauts déjà
  diagnostiqués et corrigés dans la maquette.
- **Le découpage niveau 2 / coulisses.** Quatre panneaux pour le travail en
  cours, six pour la machine derrière. Le mot « coulisses » est juste, et la
  porte reste ouverte une fois poussée — *« on ne redemande pas à quelqu'un de
  retrouver deux fois le même endroit »*.
- **`.raildot`**, qui marque le panneau concerné par une notification. C'est
  précisément ce qu'on réemploie au §1.

---

## 6. Contrat d'interface

`railwrap` `railhot` `rail` `railItems` `burger` `bell` `bellIc` `dettewrap` —
tous présents, aucun renommé. `data-nav` intact.

**Classes nouvelles**, préfixées `r-` : `r-porte`, `r-cloche-panne`,
`r-dette-cachee`.

Vérifié en jsdom sur quatre destinations × panne × deux versions, sans erreur,
aucun bouton mort.

### Par quel geste on atteint chaque état

*(La règle prise après le quatrième état inatteignable de `PASSE-DESIGN-LIEU`.)*

| État | Geste |
|---|---|
| Panneau actif invisible | aller sur Vestiaire ou Réglages, coulisses repliées |
| Marque sur la porte | idem, en « Proposé » |
| Marque absente | ouvrir les coulisses — le bouton actif se voit |
| Cloche rouge | « Simuler une panne » depuis n'importe quel panneau |
| Dette repliée | aller sur un panneau autre que Discuter et Réglages |

**Les cinq s'atteignent dans l'aperçu, par ces gestes.**
