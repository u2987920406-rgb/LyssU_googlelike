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
