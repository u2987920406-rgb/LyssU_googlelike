# Passe de design — le panneau de notifications

**Le dernier écran.** Après lui, plus aucun n'aura échappé à une passe.

Aperçu : `apercu-notifications.html` (quatre cas × actuel/proposé).

Il a changé depuis qu'une panne y entre : il porte **deux genres** au lieu
d'un, et le premier défaut vient exactement de là.

---

## 0. Constaté / supposé

**Constaté** :

- `draw()` groupe sur `dur` — « À décider » / « Récent » ;
- `when` est une **chaîne** posée à la création, jamais recalculée ;
- `.toast` et `#toasts` existent et **ne sont employés nulle part** (zéro
  appel dans tout le produit).

**Supposé** : rien. Cette passe ne repose sur aucun appel.

---

## 1. Le groupe ne dit pas ce qu'il contient

`draw()` sépare sur `dur`. C'était juste quand `decision` était le seul genre
poussé : tout ce qui durait attendait une réponse.

Depuis qu'une panne y entre, **le groupe mélange deux choses**. `dur` veut dire
*« ne part pas toute seule »* — pas *« il faut répondre »*.

> Le code l'a déjà établi pour les boutons : la condition est devenue
> `dur && n.oui`, parce qu'*« une bulle montre des actions quand elle en a »*.
> **Le groupe doit suivre la même règle.** Sinon l'écran range sur un critère
> et affiche sur un autre.

Trois groupes, donc, et **l'ordre n'est pas un détail** :

| Groupe | Ce qu'il contient |
|---|---|
| **Votre réponse est attendue** | ce qui a des boutons — l'agent est bloqué |
| **Ce qui ne va pas** | ce qui dure sans rien demander |
| **Récent** | ce qui ne dure pas |

Ce qui bloque l'agent passe devant ce qui ne bloque personne. Et le second
groupe porte sa couleur dès son titre : on sait ce qu'on va lire avant de le
lire.

---

## 2. Le temps est figé à la création

`when` vaut `"à l'instant"`, écrit une fois dans `onApproval()` et jamais
recalculé. **Une panne qui dure depuis vingt minutes dit encore « à
l'instant ».**

Or c'est la seule chose qu'on veuille savoir d'une panne : **depuis quand**.
Vingt secondes, c'est un hoquet ; vingt minutes, c'est qu'il faut faire quelque
chose.

La bulle porte donc un **horodatage**, et le panneau le rend en clair à
l'ouverture. Ça suffit : on ne regarde pas une liste de notifications fermée.

**Et pour ce qui dure, on dit la durée, pas l'heure.** *« depuis 20 min »* se
lit sans calcul ; *« 14:32 »* demande de savoir quelle heure il est.

---

## 3. Une bulle sans boutons n'est pas une bulle ratée

Elle n'a rien à demander — c'est le cas de la panne, et la correction du code
est juste.

Mais alors **rien ne dit ce qu'il y a à faire**. La bulle gagne une ligne, en
petit, sans bouton :

> Si ça dure, fermez la fenêtre « Ulysse-Serve » et relancez
> `lancer_ulysse.bat`.

C'est un conseil, pas un choix — **et on ne déguise pas un conseil en bouton**.
Un bouton engage le produit à faire quelque chose ; ici, c'est la personne qui
agit, ailleurs.

---

## 4. Ce que je ne propose pas : les toasts

`.toast` et `#toasts` existent dans la maquette et **ne sont employés nulle
part**. Zéro appel.

Ils serviraient à ce qui *ne dure pas* — `dur: false`, donc `livrable` et
`auto`. Or **aucun des deux n'est poussé**, pour les raisons déjà écrites : le
premier demanderait d'interpréter un `tool.complete`, le second un événement
dont on ne sait pas s'il existe.

> Le composant attend son usage, et c'est cohérent. **Le brancher à vide serait
> fabriquer un besoin pour employer une pièce.**

C'est la troisième fois que je refuse de remplir ce vocabulaire, et c'est la
même raison à chaque fois. Quand `livrable` aura un événement, le toast sera
là — et il aura été dessiné pour lui.

---

## 5. Ce qui n'a pas été touché

- **`.nrow`, `.nic`, `.nt`, `.nx`, `.nmeta`, `.nacts`** — repris de la
  maquette, rien à y refaire.
- **`data-go`** : cliquer une ligne va au panneau concerné. C'est juste, y
  compris pour la panne (`panel: "Reglages"`).
- **L'état vide** — *« Rien à signaler. On vous préviendra. »* Il promet, et
  la promesse est tenue par la cloche.
- **La sortie optimiste de `answer()`** : la bulle part tout de suite, et
  revient à sa place si le serveur refuse. C'est le bon ordre.

---

## 6. Contrat d'interface

`npanel` inchangé. `data-yes` / `data-no` inchangés.

**Classes nouvelles**, préfixées `n-` : `n-groupe` (avec `panne` en classe
jointe), `n-depuis`, `n-quoi`.

`.ngroup` reste dans `ulysse.css` — `n-groupe` ne la remplace pas, elle la
double le temps qu'on tranche. **Si la passe est retenue, `.ngroup` peut
partir** ; sinon elle reste seule. Je ne la supprime pas d'ici.

### Par quel geste on atteint chaque état

| État | Geste |
|---|---|
| Deux groupes | une panne pendant qu'une décision attend |
| « Ce qui ne va pas » seul | une panne sans décision en cours |
| « Votre réponse est attendue » seul | le cas ordinaire, avant cette passe |
| « depuis 20 min » | laisser la panne durer — elle ne se recalcule qu'à l'ouverture |
| Panneau vide | répondre à tout, et Hermès qui répond |

**Les cinq s'atteignent dans l'aperçu.**

---

## 7. Le point du rail derrière une porte fermée (ajouté le 2026-08-10)

Question posée par le code : un panneau de niveau 3 n'a pas de bouton tant que
la porte est fermée. Une panne rangée sur « Réglages » n'a donc **rien qui la
marque dans le rail**. Trois issues proposées.

### Deux sont à écarter, et pour des raisons qui existent déjà

**« La porte s'ouvre toute seule »** — non. `nav()` l'ouvre parce que
**l'utilisateur y va** : c'est la conséquence de son geste. Ici elle s'ouvrirait
sur un **événement**, et déplacerait les boutons sous la souris. Le CSS de la
maquette a déjà tranché ce point : *« un menu qui s'ouvre quand on passe est un
menu qui s'ouvre par erreur. »*

**« Un second signe sur la porte »** — non plus. Deux points distincts sur un
bouton de 72 px en mode replié, et il faudrait apprendre lequel dit quoi. C'est
exactement le *« un signe pour deux choses »* que le code refuse — retourné :
deux signes pour un bouton n'est pas mieux.

### Ce qui reste, et pourquoi c'est le bon

**Rien sur la porte.** Le `.raildot` d'un panneau est un **raccourci** : il
évite d'ouvrir la cloche. Quand il ne peut pas exister, ce n'est pas au rail de
se contorsionner — **c'est à la notification de porter l'information**, et elle
a la place.

### Et en cherchant ça, on trouve mieux

`.nrow` porte `data-go` et **mène au panneau depuis toujours** — sans curseur,
sans chevron, sans mot. On le découvre en cliquant par hasard.

**Ce n'est pas un défaut du cas caché : c'est un défaut de *toutes* les
lignes**, que le cas caché a rendu visible.

La ligne gagne donc, au survol, sa destination en clair — *« Réglages ›​ »* —
et le curseur passe en `pointer`. Le libellé, pas l'identifiant : c'est
précisément la confusion que le code vient de corriger dans `drawBell()`.

> **La question portait sur le rail ; la réponse est dans le panneau.** C'est
> la troisième fois qu'une question de cette série se résout ailleurs qu'où
> elle se pose.

`.n-va`, `.n-meta-va` — deux classes de plus, et rien sur la porte.
