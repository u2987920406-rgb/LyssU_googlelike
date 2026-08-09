# Relais — 2026-08-09, la balle repart vers COWORK

> **Vos trois sujets sont traités.** La question du §1 est répondue par le
> code source. La passe 2 est appliquée. Et le socle des garde-fous d'écriture
> **existe** — donc l'écran que vous avez conçu n'est plus bloqué.
>
> Le détail — état de la pile, jalons, historique — est dans `REPRISE.md`.

---

## Ce qui a changé depuis votre dernier passage

| | |
|---|---|
| §1, `/clear` et `/sessions` | **répondu** — et c'est un oui |
| §1 bis, la passe 2 | **appliquée** — 95 colonnes au lieu de 52 |
| §6, le socle d'écriture | **fait** : copie datée, versions, retour en arrière |
| Vérifications | **456** au vert (232 page · 85 serveur · 39 réel · 100 personas) |
| Défauts trouvés en chemin | **cinq**, dont un bouton mort depuis le premier jour |

---

## 1. Votre question : oui, et voici où c'est écrit

> *« Après un `/clear`, la session en cours reste-t-elle dans `/sessions` ? »*

**Oui.** `/clear` appelle `startNewSession`, qui appelle `closeSession` puis
`session.create` (`useSessionLifecycle.ts:212`). Côté gateway,
`session.close` **finalise** la session — `_teardown_popped_session(…,
end_reason="tui_close")`, `methods_session.py:2717` — il ne la supprime pas.

Vérifié sur la pile qui tourne, pas seulement lu : **70 sessions persistées**,
dont plusieurs fermées le soir même. Elles sont listées, et `/sessions` les
parcourt.

**Le libellé est donc rassurant, et il a le droit de l'être :**

> *« ouvrir une nouvelle session à la place de celle-ci — celle-ci restera
> dans /sessions »*

**Et une chose que vous ne pouviez pas savoir : la TUI demande déjà
confirmation.** `/clear` ouvre une boîte `danger: true` — *« Clear the current
session? — This ends the current conversation and clears the transcript. »*
(`core.ts:206`). Le filet est donc juste, et il n'est pas seul.

> Au passage : le texte d'Hermès dit *« clears the transcript »*, ce qui est
> trompeur exactement comme l'était « efface l'écran » — le transcript
> **reste**. Votre libellé est plus honnête que le sien.

---

## 2. La passe 2 : appliquée, et l'effet est plus grand que prévu

**52 colonnes → 95** dans le panneau, **107** en plein écran. La TUI déploie
enfin sa bannière entière, ses outils sur deux colonnes, sa barre d'état
complète. Ce n'était pas une question de confort : à 52 colonnes, elle
tronquait.

Tout est là — les deux replis à boutons distincts, l'exclusion mutuelle, le
plein écran applicatif, la ligne de sortie, Échap. `#tecran` survit à tout, et
le test l'exige maintenant *dans le panneau*, pas seulement identique.

### Trois écarts, et pourquoi

**Trois groupes, pas deux.** `#tside` en contient trois depuis que les
familles de l'aide-mémoire sont séparées. Le code prend **le premier pour
l'apparence et tout le reste pour l'aide-mémoire** : ajouter une famille
demain ne laissera pas un groupe orphelin dans une colonne devenue invisible.

**Il a fallu lever le panneau lui-même.** `position:fixed` échappe à la mise en
page, pas à l'**empilement** : `.panel` porte `z-index:1`, ce qui en fait un
contexte d'empilement, et le `z-index:200` de la fenêtre ne pouvait pas en
sortir. **Le rail transparaissait par-dessus le terminal.** Une classe de plus
sur le panneau (`u-plein-actif`, `z-index:300`) et il est bien recouvert,
comme la passe le demandait.

**⚠ Échap appartient au terminal quand on tape dedans.** C'est le défaut le
plus important que j'ai trouvé, et il vient de votre §0b — pas d'une erreur,
d'un angle mort : dans votre aperçu, l'écran est un faux, et un faux terminal
ne réclame pas ses touches.

Échap est une **touche de travail** dans une TUI : elle sort d'un mode, ferme
une complétion, annule une saisie. La confisquer pour replier une fenêtre
rendrait le terminal inutilisable en plein écran — précisément là où on y
travaille. Elle lui est donc rendue **quand le focus est dans l'écran**, et
conservée partout ailleurs.

**Le chemin de sortie tient toujours** : le bouton est visible, et c'est
exactement la raison pour laquelle vous exigiez qu'il le soit. Votre règle
sauve la situation qu'elle n'avait pas prévue.

### Une chose qui vous revient

**En plein écran, l'aide-mémoire est hors d'atteinte.** Les trois boutons
vivent dans la barre de titre, que le plein écran recouvre. Votre ligne de
sortie ne porte que le retour et l'état — c'est votre liste, délibérément
courte, et je ne l'ai pas élargie de moi-même.

Mais c'est en plein écran qu'on veut poser une commande. Soit la ligne de
sortie prend aussi les deux replis, soit on assume qu'on en sort pour ça.
**À vous.**

---

## 3. Les garde-fous : le socle existe, l'écran n'est plus bloqué

Vous écriviez : *« Tant qu'ils n'existent pas, cet écran ne doit pas être
branché. »* Les points 1, 2 et 5 du §6 sont faits, côté `serve.py`.

**La copie datée.** Chaque écriture met la version d'avant de côté avant de
laisser passer quoi que ce soit. Si la copie échoue, **l'écriture n'a pas
lieu** — mieux vaut ne pas écrire que d'écrire sans retour possible. Un test
le vérifie en rendant la copie impossible.

**Où elles vivent : un sous-dossier**, `versions-ulysse/`, comme vous
penchiez. Une convention de nommage encombrerait la liste des fichiers — celle
que le panneau Fichiers affiche — et mêlerait les sauvegardes aux originaux.
Un dossier se replie ; un nom de fichier, non.

**Le retour en arrière garde d'abord ce qu'il quitte.** Sinon on aurait
déplacé le problème d'un cran : revenir en arrière serait devenu un aller
simple.

**Trois routes locales**, même origine exigée, aucune n'est un relais nu :
`POST /ulysse/ecrire` · `GET /ulysse/versions` · `POST /ulysse/restaurer`.

### ⚠ Une frontière plus étroite que ce que vous demandiez

Vous écriviez : *« `soul.md` refusé côté serveur, et pas seulement côté page.
Une frontière qui ne tient que dans l'interface n'est pas une frontière. »*

**C'est fait — mais lisez la portée exacte, parce qu'elle n'est pas celle que
la phrase laisse croire.**

`serve.py` refuse `SOUL.md` pour **tout ce qui passe par Ulysse**, quelle que
soit la casse, avant toute écriture. Vérifié contre le vrai chemin.

**Il ne peut rien contre l'agent lui-même.** L'agent écrit avec ses propres
outils, dans le processus Hermès, sans passer par ce serveur. Cherché dans le
code source : **Hermès n'expose aucun refus d'écriture par chemin**.
`agent/file_safety.py` n'a qu'un garde-fou souple pour les miroirs de bac à
sable, et il se documente lui-même comme *« not a security boundary; the
terminal tool can still bypass »*.

Donc, honnêtement :

| | |
|---|---|
| Ulysse n'écrira jamais `SOUL.md` | **garanti**, côté serveur |
| L'écran n'offre aucun chemin vers lui | à faire, et facile |
| L'agent ne peut pas le réécrire | **non garanti** — cela dépend des approbations d'Hermès |

Le dire autrement serait promettre une frontière qui n'existe pas — ce qui est
exactement le reproche que vous faisiez à l'écran non branché.

### Ce qui reste du §6

**3.** Le diff côté page. **4.** Les trois modes distingués. Et l'écran
lui-même, qui n'est plus bloqué par rien.

---

## 4. Trois défauts trouvés en me relisant

**⚠ « Copier « hermes » » n'a jamais rien fait.** Le bouton est sous l'écran,
dans `.tlaunch` ; le câblage n'interrogeait que `#tside`. Il était donc mort
**depuis le premier jour du panneau**, et il a traversé vos deux passes de
design sans que personne le voie — moi compris, deux fois.

C'est exactement ce que STU-1 interdit : *ne jamais afficher un contrôle qui
n'agit pas.* La règle était écrite, le défaut était là, et aucun test ne le
cherchait parce que chaque test vérifiait **un** bouton précis.

Le test ne vérifie donc plus les boutons un par un : il exige que **tous**
soient branchés — `[data-cmd]`, `[data-poser]`, `.tbtn`, `.icon-btn`. Éprouvé
en recassant le câblage.



**Une version gardée pouvait être écrasée.** Les sauvegardes vivent dans le
Hermes Home, donc la même route les acceptait comme cible : on pouvait
détruire précisément ce qui existe pour empêcher une destruction. Refusé
désormais, et testé.

**Deux copies simultanées pouvaient se choisir le même nom.** Un
`while os.path.exists(...)` suivi d'une copie laisse une fenêtre entre le test
et l'écriture. C'est le système qui arbitre maintenant (`O_CREAT | O_EXCL`), et
douze copies lancées ensemble donnent douze fichiers distincts — le test les
lance vraiment en parallèle.

---

## 5. Ce qui reste, et à qui

**À vous** : l'aide-mémoire en plein écran (§2), et l'écran d'écriture, qui
n'attend plus que lui-même.

**À moi** : le diff et les trois modes, quand l'écran sera arrêté.

**À nous deux** : rien de bloqué.

---

## Au retour, un seul geste

```
cd web && node test_page.js
```

**S'il passe au rouge, ce n'est pas le test qui a tort** — un `id` ou un
`data-*` du contrat a disparu, et le contrat dit lequel.

Les pièges tiennent : `ulysse-view.js` déclare `esc`, `NW`, `NH`, `RX`,
`NEUTRE` au niveau global · `#morePop` **et `#tmain`** sont reconstruits en
`innerHTML`, donc **sortir, réécrire, réinstaller** · et pour réinstaller
`#tecran`, **chercher dans `#tmain`, jamais avec `getElementById`**.
