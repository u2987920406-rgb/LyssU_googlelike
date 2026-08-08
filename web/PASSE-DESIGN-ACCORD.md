# Passe de design — la demande d'accord

Réponse à la question posée par `relais.md` :

> « Comment une bulle à deux boutons en porte quatre ? »

**Elle n'en porte pas quatre.**

Aperçu : `apercu-accord.html` (autonome).

---

## 1. En cherchant le troisième bouton, on tombe sur plus gros

La demande d'accord **n'apparaît nulle part dans le fil.**

`conv.approval` est posé par le core (`ulysse-core.js:425`), `onApproval()` en
fait une notification (`ulysse-app.js:1479`) — et `paintThread()` ne le rend
jamais. L'agent est bloqué, on regarde Discuter, et la seule chose qui le dise
est **une cloche dans un menu replié**.

C'est plus grave que le nombre de boutons : ce qui bloque l'agent n'est pas là
où l'on regarde.

### Et le libellé est inversé

```js
oui: choices.indexOf("session") >= 0 ? "Autoriser" : "Autoriser une fois",
```

Quand Hermès propose une portée large, le bouton porte le mot **le plus
vague** — « Autoriser » — et fait l'action **la plus étroite** (`once`). Quand
Hermès ne propose que `once`, le bouton est précis. C'est exactement à
l'envers.

---

## 2. La réponse : deux lieux, deux rôles

| | Ce qu'il porte | Pourquoi |
|---|---|---|
| **Le fil** | les quatre choix, avec ce que chacun engage | c'est là qu'on est, et il y a la place d'expliquer |
| **La bulle** | deux boutons, et un renvoi au fil | c'est le rappel quand on est ailleurs, pas le lieu de la décision |

Un choix dont on ne mesure pas la portée n'est pas un choix. « Toujours » ne
peut pas être un bouton de 34 px à côté de trois autres, dans un panneau
flottant de 394 px qu'on a ouvert en passant.

---

## 3. Le bloc dans le fil

Il utilise `.ask`, `.opt` et `.tick` — **le langage que la maquette a dessiné
pour exactement ça** : une question à choix posée par l'agent, au milieu de la
conversation. On n'ajoute pas un vocabulaire, on se sert du sien. `.ask.done`
existe déjà pour l'état d'après.

Quatre décisions de forme :

1. **Ce que l'agent s'apprête à faire est écrit à part**, en monospace, dans
   son propre bloc — `fs.write · web/ulysse.html`. C'est la seule chose qu'on
   doit lire avant de répondre.
2. **Chaque option porte sa portée en sous-titre**, pas dans une infobulle :
   - *Autoriser cette fois* — « on vous redemandera à la suivante »
   - *Autoriser pour cette conversation* — « jusqu'à ce que ce fil se ferme »
   - *Autoriser toujours* — « pour toutes les conversations à venir »
3. **« Toujours » est séparé par un filet** et marqué. Il n'est pas interdit —
   il est *distingué* : c'est le seul qui engage au-delà de ce fil.
4. **« Refuser » quitte la liste.** Ce n'est pas une portée parmi trois, c'est
   l'autre réponse. Il redevient un bouton, à droite, en `.dangerlink`.

Le bloc s'adapte à ce qui arrive : si `choices` ne contient que
`["once","deny"]`, il n'affiche qu'une option et le bouton Refuser.

---

## 4. La bulle ne change pas de forme

Elle gagne deux choses :

- Son « oui » **dit ce qu'il vaut** : « Autoriser une fois » — toujours, et non
  plus l'inverse.
- Un renvoi : « Voir la demande dans Discuter — pour autoriser plus largement ».

C'est ce renvoi qui règle la question initiale. La bulle n'a pas à porter les
quatre : elle a à dire où ils sont.

---

## 5. Côté code, presque rien à faire

`respondApproval(choice, all)` **accepte déjà** le choix et le drapeau
(`ulysse-core.js:544`). Il n'y a rien à inventer côté protocole.

Ce qu'il faut :

1. **Rendre `conv.approval` dans `paintThread()`** — le bloc `.ask`, en fin de
   fil, quand `conv.approval` n'est pas nul.
2. **Ne plus jeter `_choices`** : `Notifs.onAnswer` doit transmettre le choix
   retenu, pas `once`/`deny` en dur.
3. **Corriger le libellé** de `oui`.
4. Retirer le bloc quand la demande est résolue — `.ask.done` garde le choix
   retenu, comme la maquette le prévoit.

---

## 6. La réserve qu'il faut lever avant d'écrire la phrase

Le bloc affirme :

> « Vous pourrez revenir sur « toujours » dans Réglages · Sécurité et accords. »

**C'est à vérifier.** Ce que le relais rapporte d'Hermès : `approvals.deny`
(une liste de motifs qui bloquent) et `approvals.mode` (global). Rien ne dit
qu'un `always` accordé se retire depuis Ulysse.

Si ce n'est pas le cas, **cette phrase doit disparaître** — ou devenir « depuis
la ligne de commande ». Promettre un retour en arrière qui n'existe pas est
pire que ne rien promettre, et c'est précisément sur l'écran où l'on donne un
pouvoir durable.

C'est la seule chose qui bloque l'application de cette passe.

---

## 7. Contrat d'interface

`data-yes` et `data-no` (bulle) restent. **Attribut nouveau** : `data-ch` (le
choix, dans le bloc du fil) — à ajouter au §2.2 s'il est retenu.

Vérifié en jsdom, sans erreur : les quatre choix se répondent depuis le fil,
les deux depuis la bulle, `.ask.done` garde le bon libellé dans les quatre cas,
et la cloche perd son badge une fois répondu.
